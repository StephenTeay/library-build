import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { pool } from '../../db/pool.js';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/roleScope.js';
import { getStorageProvider, MAX_FILE_SIZE_BYTES } from '../../providers/storage/s3StorageProvider.js';

export const thesesRouter = Router();

// ==============================================================================
// 1. Presign Upload for Theses Manuscripts & Datasets
// ==============================================================================
thesesRouter.post('/presign-upload', authenticate, async (req: Request, res: Response) => {
  const { filename, mime_type, size_bytes } = req.body || {};

  if (!filename || !size_bytes) {
    res.status(400).json({ error: 'Bad Request', message: 'filename and size_bytes are required.' });
    return;
  }

  const size = Number(size_bytes);
  if (size > MAX_FILE_SIZE_BYTES) {
    res.status(413).json({ error: 'File Too Large', message: `File exceeds limit of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB.` });
    return;
  }

  const cleanFilename = String(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
  const r2Key = `theses/${crypto.randomUUID()}-${cleanFilename}`;
  const mime = String(mime_type || 'application/pdf');

  try {
    const storage = getStorageProvider();
    const uploadUrl = await storage.createPresignedPut(r2Key, mime, size, 900);

    res.status(200).json({
      r2Key,
      uploadUrl,
      expiresIn: 900,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Storage Error', message: err.message });
  }
});

// ==============================================================================
// 2. Submit Final-Year Capstone Project / Thesis
// ==============================================================================
thesesRouter.post('/submit', authenticate, async (req: Request, res: Response) => {
  const {
    title,
    abstract,
    department_id,
    programme,
    academic_session,
    student_authors,
    supervisor_name,
    keywords,
    manuscript_r2_key,
    dataset_r2_key,
    code_repo_url,
  } = req.body || {};

  if (!title || !abstract || !manuscript_r2_key || !supervisor_name || !programme || !academic_session) {
    res.status(400).json({
      error: 'Bad Request',
      message: 'title, abstract, manuscript_r2_key, supervisor_name, programme, and academic_session are required.',
    });
    return;
  }

  const deptId = department_id ? Number(department_id) : req.user!.departmentId;
  if (!deptId) {
    res.status(400).json({ error: 'Bad Request', message: 'department_id is required.' });
    return;
  }

  // 1. Verify manuscript exists in object storage via HEAD
  const storage = getStorageProvider();
  const headResult = await storage.verifyObjectExists(String(manuscript_r2_key));
  if (!headResult.exists) {
    res.status(400).json({
      error: 'Storage Verification Failed',
      message: 'The uploaded manuscript PDF could not be verified in storage. Please re-upload.',
    });
    return;
  }

  // Normalize student authors
  let authorsArray = student_authors;
  if (typeof authorsArray === 'string') {
    try {
      authorsArray = JSON.parse(authorsArray);
    } catch {
      authorsArray = [{ full_name: authorsArray }];
    }
  }
  if (!Array.isArray(authorsArray) || authorsArray.length === 0) {
    authorsArray = [{ matric_no: req.user!.matricNo, full_name: req.user!.email }];
  }

  // Normalize keywords
  const kwList = Array.isArray(keywords)
    ? keywords
    : typeof keywords === 'string'
    ? keywords.split(',').map((k) => k.trim())
    : [];

  try {
    const insertRes = await pool.query(
      `INSERT INTO theses_repository (
         title, abstract, department_id, programme, academic_session,
         student_authors, supervisor_name, keywords, manuscript_r2_key,
         dataset_r2_key, code_repo_url, file_size_bytes, mime_type,
         status, submitted_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'SUBMITTED', $14)
       RETURNING *;`,
      [
        title.trim(),
        abstract.trim(),
        deptId,
        programme,
        academic_session,
        JSON.stringify(authorsArray),
        supervisor_name.trim(),
        kwList,
        manuscript_r2_key,
        dataset_r2_key || null,
        code_repo_url || null,
        headResult.sizeBytes || null,
        headResult.mimeType || 'application/pdf',
        req.user!.userId,
      ]
    );

    res.status(201).json({
      message: 'Capstone project submitted successfully for supervisor and library review.',
      thesis: insertRes.rows[0],
    });
  } catch (err: any) {
    console.error('[Theses] Submit error:', err);
    res.status(500).json({ error: 'Repository Error', message: err.message });
  }
});

// ==============================================================================
// 3. Public / Authenticated Discovery: List Published Theses
// ==============================================================================
thesesRouter.get('/', authenticate, async (req: Request, res: Response) => {
  const q = String(req.query.q || '').trim();
  const dept = req.query.dept ? String(req.query.dept) : '';
  const programme = req.query.programme ? String(req.query.programme) : '';
  const session = req.query.session ? String(req.query.session) : '';

  try {
    let query = `
      SELECT t.*, d.name as department_name, d.code as department_code
      FROM theses_repository t
      JOIN departments d ON t.department_id = d.id
      WHERE t.status = 'PUBLISHED'
    `;
    const params: any[] = [];

    if (dept && dept !== 'ALL') {
      params.push(dept.toUpperCase());
      query += ` AND d.code = $${params.length}`;
    }

    if (programme && programme !== 'ALL') {
      params.push(programme);
      query += ` AND t.programme = $${params.length}`;
    }

    if (session && session !== 'ALL') {
      params.push(session);
      query += ` AND t.academic_session = $${params.length}`;
    }

    if (q) {
      params.push(`%${q.toLowerCase()}%`);
      query += ` AND (
        LOWER(t.title) LIKE $${params.length} OR
        LOWER(t.abstract) LIKE $${params.length} OR
        LOWER(t.supervisor_name) LIKE $${params.length} OR
        LOWER(t.student_authors::text) LIKE $${params.length}
      )`;
    }

    query += ` ORDER BY t.published_at DESC, t.created_at DESC LIMIT 100`;

    const result = await pool.query(query, params);
    res.status(200).json({ theses: result.rows, count: result.rows.length });
  } catch (err: any) {
    res.status(500).json({ error: 'Repository Error', message: err.message });
  }
});

// ==============================================================================
// 4. Staff Review Queue (Scoped by Department for HOD)
// ==============================================================================
thesesRouter.get(
  '/queue/review',
  authenticate,
  requireRole('LIBRARIAN', 'REGISTRAR', 'HOD'),
  async (req: Request, res: Response) => {
    const isHOD = req.user!.role === 'HOD';

    try {
      let query = `
        SELECT t.*, d.name as department_name, d.code as department_code, u.full_name as submitter_name
        FROM theses_repository t
        JOIN departments d ON t.department_id = d.id
        LEFT JOIN users u ON t.submitted_by = u.id
        WHERE t.status = 'SUBMITTED'
      `;
      const params: any[] = [];

      if (isHOD && req.user!.departmentId) {
        params.push(req.user!.departmentId);
        query += ` AND t.department_id = $${params.length}`;
      }

      query += ` ORDER BY t.created_at ASC`;

      const result = await pool.query(query, params);
      res.status(200).json({ queue: result.rows, count: result.rows.length });
    } catch (err: any) {
      res.status(500).json({ error: 'Repository Error', message: err.message });
    }
  }
);

// ==============================================================================
// 5. Staff Review Action: Approve & Publish OR Reject
// ==============================================================================
thesesRouter.post(
  '/:id/review',
  authenticate,
  requireRole('LIBRARIAN', 'REGISTRAR', 'HOD'),
  async (req: Request, res: Response) => {
    const thesisId = req.params.id;
    const { action, review_notes } = req.body || {};

    if (!['APPROVE', 'REJECT'].includes(action)) {
      res.status(400).json({ error: 'Bad Request', message: 'action must be either APPROVE or REJECT.' });
      return;
    }

    try {
      const existing = await pool.query('SELECT * FROM theses_repository WHERE id = $1', [thesisId]);
      if (existing.rows.length === 0) {
        res.status(404).json({ error: 'Not Found', message: 'Thesis submission not found.' });
        return;
      }

      const thesis = existing.rows[0];

      // HOD scope check
      if (req.user!.role === 'HOD' && req.user!.departmentId !== thesis.department_id) {
        res.status(403).json({ error: 'Forbidden', message: 'HODs may only review submissions in their own department.' });
        return;
      }

      const newStatus = action === 'APPROVE' ? 'PUBLISHED' : 'REJECTED';
      const isPublish = newStatus === 'PUBLISHED';
      const updated = await pool.query(
        `UPDATE theses_repository
         SET status = $1,
             reviewed_by = $2,
             review_notes = $3,
             published_at = ${isPublish ? 'NOW()' : 'published_at'},
             updated_at = NOW()
         WHERE id = $4
         RETURNING *;`,
        [newStatus, req.user!.userId, review_notes || null, thesisId]
      );

      res.status(200).json({
        message: action === 'APPROVE' ? 'Thesis approved and published to institutional repository.' : 'Thesis rejected.',
        thesis: updated.rows[0],
      });
    } catch (err: any) {
      console.error('[Theses] Review error:', err);
      res.status(500).json({ error: 'Repository Error', message: err.message });
    }
  }
);

// ==============================================================================
// 6. View Single Thesis Details
// ==============================================================================
thesesRouter.get('/:id', authenticate, async (req: Request, res: Response) => {
  const thesisId = req.params.id;

  try {
    const result = await pool.query(
      `SELECT t.*, d.name as department_name, d.code as department_code
       FROM theses_repository t
       JOIN departments d ON t.department_id = d.id
       WHERE t.id = $1`,
      [thesisId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Not Found', message: 'Thesis not found.' });
      return;
    }

    res.status(200).json({ thesis: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: 'Repository Error', message: err.message });
  }
});

// ==============================================================================
// 7. Stream Thesis Manuscript PDF (HTTP Byte Range Support for E-Reader)
// ==============================================================================
thesesRouter.get('/:id/stream', authenticate, async (req: Request, res: Response) => {
  const thesisId = req.params.id;

  try {
    const result = await pool.query(
      'SELECT id, title, manuscript_r2_key, mime_type FROM theses_repository WHERE id = $1',
      [thesisId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Not Found', message: 'Thesis not found.' });
      return;
    }

    const thesis = result.rows[0];
    const storage = getStorageProvider();
    const rangeHeader = req.headers.range;
    const streamResult = await storage.getObjectStream(thesis.manuscript_r2_key, rangeHeader);

    res.setHeader('Content-Type', streamResult.contentType || thesis.mime_type || 'application/pdf');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(thesis.title)}.pdf"`);

    if (streamResult.contentLength !== undefined) {
      res.setHeader('Content-Length', streamResult.contentLength);
    }
    if (streamResult.contentRange) {
      res.setHeader('Content-Range', streamResult.contentRange);
    }

    res.status(streamResult.statusCode);

    if (streamResult.stream && typeof streamResult.stream.pipe === 'function') {
      streamResult.stream.pipe(res);
    } else if (streamResult.stream && typeof streamResult.stream.transformToByteArray === 'function') {
      const bytes = await streamResult.stream.transformToByteArray();
      res.send(Buffer.from(bytes));
    } else {
      res.end();
    }
  } catch (err: any) {
    console.error('[Theses] Stream error:', err.message || err);
    if (!res.headersSent) {
      if (err.name === 'NoSuchKey' || err.Code === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
        res.status(404).json({ error: 'Not Found', message: 'Thesis manuscript file not found in storage.' });
        return;
      }
      res.status(500).json({ error: 'Storage Stream Error', message: err.message });
    }
  }
});

// ==============================================================================
// 8. Student's Own Submissions
// ==============================================================================
thesesRouter.get('/my/submissions', authenticate, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT t.*, d.name as department_name, d.code as department_code
       FROM theses_repository t
       JOIN departments d ON t.department_id = d.id
       WHERE t.submitted_by = $1
       ORDER BY t.created_at DESC`,
      [req.user!.userId]
    );

    res.status(200).json({ submissions: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: 'Repository Error', message: err.message });
  }
});
