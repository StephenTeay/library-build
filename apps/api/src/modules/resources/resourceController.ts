import { Request, Response } from 'express';
import crypto from 'crypto';
import { pool } from '../../db/pool.js';
import { getStorageProvider, MAX_FILE_SIZE_BYTES } from '../../providers/storage/s3StorageProvider.js';
import { canManageCourse, canAccessCourseContent } from '../../middleware/roleScope.js';
import { extractPdfText } from '../../services/pdfExtractor.js';
import { watermarkPdf } from '../../services/watermarker.js';

export async function presignUpload(req: Request, res: Response): Promise<void> {
  const { course_id, filename, mime_type, size_bytes } = req.body || {};

  if (!course_id || !filename || !size_bytes) {
    res.status(400).json({ error: 'Bad Request', message: 'course_id, filename, and size_bytes are required.' });
    return;
  }

  const courseId = Number(course_id);
  const sizeBytes = Number(size_bytes);

  // 1. Authorization check: must have course management privileges
  const canManage = await canManageCourse(req.user!.userId, req.user!.role, req.user!.departmentId, courseId);
  if (!canManage) {
    res.status(403).json({ error: 'Forbidden', message: 'You are not authorized to upload resources for this course.' });
    return;
  }

  const storage = getStorageProvider();

  // 2. Validate file type
  if (!storage.isFileTypeAllowed(String(filename))) {
    res.status(400).json({
      error: 'Invalid File Type',
      message: 'This file extension is not permitted. Allowed: documents (.pdf, .docx), code (.py, .r, .ipynb), data (.csv, .sav), audio (.mp3), labs (.zip, .pkt).',
    });
    return;
  }

  // 3. Validate file size
  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    res.status(413).json({
      error: 'File Too Large',
      message: `File exceeds maximum upload limit of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB.`,
    });
    return;
  }

  // 4. Generate clean object key: courses/{course_id}/{uuid}-{filename}
  const cleanFilename = String(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
  const r2Key = `courses/${courseId}/${crypto.randomUUID()}-${cleanFilename}`;
  const mimeType = String(mime_type || 'application/octet-stream');

  try {
    const uploadUrl = await storage.createPresignedPut(r2Key, mimeType, sizeBytes, 900);

    res.status(200).json({
      r2Key,
      uploadUrl,
      expiresIn: 900,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Storage Error', message: err.message });
  }
}

export async function confirmUpload(req: Request, res: Response): Promise<void> {
  const { course_id, title, r2_key, filename, mime_type, size_bytes, description, resource_type, visibility, metadata_json } = req.body || {};

  if (!course_id || !title || !r2_key) {
    res.status(400).json({ error: 'Bad Request', message: 'course_id, title, and r2_key are required.' });
    return;
  }

  const courseId = Number(course_id);

  // 1. Authorization check
  const canManage = await canManageCourse(req.user!.userId, req.user!.role, req.user!.departmentId, courseId);
  if (!canManage) {
    res.status(403).json({ error: 'Forbidden', message: 'Not authorized to publish resources for this course.' });
    return;
  }

  // 2. Mandatory Confirm Step: Verify object presence in R2/S3 storage via HEAD
  const storage = getStorageProvider();
  const headResult = await storage.verifyObjectExists(String(r2_key));

  if (!headResult.exists) {
    res.status(400).json({
      error: 'Storage Verification Failed',
      message: 'The uploaded file could not be verified in object storage. Direct upload may have failed or timed out.',
    });
    return;
  }

  // 3. Infer resource type if not supplied
  const ALLOWED_DB_TYPES = new Set(['DOCUMENT', 'CODE', 'NOTEBOOK', 'TOPOLOGY', 'DATASET', 'SPREADSHEET', 'CASE_STUDY', 'VIDEO', 'AUDIO']);
  let inferredType = String(resource_type || 'DOCUMENT').toUpperCase();
  const fname = String(filename || r2_key).toLowerCase();

  if (inferredType === 'SLIDE' || inferredType === 'PAST_QUESTION' || !ALLOWED_DB_TYPES.has(inferredType)) {
    inferredType = 'DOCUMENT';
  }
  if (fname.endsWith('.ipynb')) inferredType = 'NOTEBOOK';
  else if (fname.endsWith('.py') || fname.endsWith('.r') || fname.endsWith('.sql')) inferredType = 'CODE';
  else if (fname.endsWith('.csv') || fname.endsWith('.sav') || fname.endsWith('.dta')) inferredType = 'DATASET';
  else if (fname.endsWith('.mp3') || fname.endsWith('.wav')) inferredType = 'AUDIO';
  else if (fname.endsWith('.pkt') || fname.endsWith('.gns3')) inferredType = 'TOPOLOGY';

  const size = headResult.sizeBytes || Number(size_bytes) || 0;
  const mime = headResult.mimeType || mime_type || 'application/octet-stream';

  // Extract text from PDF for deep full-text indexing
  let extractedText: string | null = null;
  if (mime.includes('pdf') || fname.endsWith('.pdf')) {
    try {
      const streamRes = await storage.getObjectStream(String(r2_key));
      if (streamRes.stream && typeof streamRes.stream.transformToByteArray === 'function') {
        const bytes = await streamRes.stream.transformToByteArray();
        extractedText = await extractPdfText(Buffer.from(bytes));
      }
    } catch (e) {
      // Non-fatal if extraction fails
    }
  }

  const insertRes = await pool.query(
    `INSERT INTO learning_resources (
      course_id, title, description, resource_type, visibility,
      r2_key, size_bytes, mime_type, metadata_json, uploaded_by, is_confirmed, extracted_text
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE, $11)
    RETURNING *;`,
    [
      courseId,
      title,
      description || null,
      inferredType,
      visibility || 'ENROLLED_ONLY',
      r2_key,
      size,
      mime,
      metadata_json ? JSON.stringify(metadata_json) : '{}',
      req.user!.userId,
      extractedText,
    ]
  );

  res.status(201).json({
    message: 'Resource verified and published successfully.',
    resource: insertRes.rows[0],
  });
}

export async function createExternalResource(req: Request, res: Response): Promise<void> {
  const { course_id, title, description, resource_type, external_url, video_id, start_seconds, metadata_json, visibility } = req.body || {};

  if (!course_id || !title || (!external_url && !video_id)) {
    res.status(400).json({ error: 'Bad Request', message: 'course_id, title, and external_url (or video_id) are required.' });
    return;
  }

  const courseId = Number(course_id);

  const canManage = await canManageCourse(req.user!.userId, req.user!.role, req.user!.departmentId, courseId);
  if (!canManage) {
    res.status(403).json({ error: 'Forbidden', message: 'Not authorized to manage this course.' });
    return;
  }

  // Auto-detect YouTube video ID from external URL if video_id is not explicit
  let extractedVideoId = video_id || null;
  let finalResourceType = resource_type || 'DOCUMENT';

  if (external_url) {
    const ytMatch = String(external_url).match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    if (ytMatch && ytMatch[1]) {
      extractedVideoId = ytMatch[1];
      finalResourceType = 'VIDEO';
    }
  }

  const ALLOWED_DB_TYPES = new Set(['DOCUMENT', 'CODE', 'NOTEBOOK', 'TOPOLOGY', 'DATASET', 'SPREADSHEET', 'CASE_STUDY', 'VIDEO', 'AUDIO']);
  if (!ALLOWED_DB_TYPES.has(finalResourceType)) {
    finalResourceType = extractedVideoId ? 'VIDEO' : 'DOCUMENT';
  }

  const insertRes = await pool.query(
    `INSERT INTO learning_resources (
      course_id, title, description, resource_type, visibility,
      external_url, video_id, start_seconds, metadata_json, uploaded_by, is_confirmed
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE)
    RETURNING *;`,
    [
      courseId,
      title,
      description || null,
      finalResourceType,
      visibility || 'ENROLLED_ONLY',
      external_url || null,
      extractedVideoId,
      start_seconds || 0,
      metadata_json ? JSON.stringify(metadata_json) : '{}',
      req.user!.userId,
    ]
  );

  res.status(201).json({
    message: 'External resource recorded successfully.',
    resource: insertRes.rows[0],
  });
}

export async function downloadResource(req: Request, res: Response): Promise<void> {
  const resourceId = req.params.id;

  const resRow = await pool.query(
    'SELECT * FROM learning_resources WHERE id = $1 AND is_confirmed = TRUE',
    [resourceId]
  );

  if (resRow.rows.length === 0) {
    res.status(404).json({ error: 'Not Found', message: 'Resource not found' });
    return;
  }

  const resource = resRow.rows[0];

  // 1. Authorization check: user must have access to course content
  const canAccess = await canAccessCourseContent(
    req.user!.userId,
    req.user!.role,
    req.user!.departmentId,
    resource.course_id
  );

  if (!canAccess) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'You are not enrolled in this course or lack required privileges to download this resource.',
    });
    return;
  }

  // 2. If external link (e.g. YouTube, Colab), return URL directly
  if (resource.external_url) {
    res.status(200).json({
      isExternal: true,
      url: resource.external_url,
      resource,
    });
    return;
  }

  // 3. Generate short-lived presigned GET URL (15 minutes)
  if (!resource.r2_key) {
    res.status(400).json({ error: 'Bad Request', message: 'No storage key associated with this resource.' });
    return;
  }

  try {
    const storage = getStorageProvider();
    const downloadUrl = await storage.createPresignedGet(resource.r2_key, `${resource.title}.download`, 900);

    res.status(200).json({
      isExternal: false,
      downloadUrl,
      expiresIn: 900,
      resourceId: resource.id,
      title: resource.title,
      sizeBytes: resource.size_bytes,
      mimeType: resource.mime_type,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Storage Error', message: err.message });
  }
}

export async function streamResource(req: Request, res: Response): Promise<void> {
  const resourceId = req.params.id;

  const resRow = await pool.query(
    `SELECT r.*, c.title as course_title, c.code as course_code
     FROM learning_resources r
     JOIN courses c ON r.course_id = c.id
     WHERE r.id = $1 AND r.is_confirmed = TRUE`,
    [resourceId]
  );

  if (resRow.rows.length === 0) {
    res.status(404).json({ error: 'Not Found', message: 'Resource not found' });
    return;
  }

  const resource = resRow.rows[0];

  const canAccess = await canAccessCourseContent(
    req.user!.userId,
    req.user!.role,
    req.user!.departmentId,
    resource.course_id
  );

  if (!canAccess) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'You are not authorized to stream this resource.',
    });
    return;
  }

  if (!resource.r2_key) {
    res.status(400).json({ error: 'Bad Request', message: 'No storage key associated with this resource.' });
    return;
  }

  try {
    const storage = getStorageProvider();
    const rangeHeader = req.headers.range;
    const result = await storage.getObjectStream(resource.r2_key, rangeHeader);

    const contentType = result.contentType || resource.mime_type || 'application/pdf';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(resource.title)}"`);

    if (result.contentLength !== undefined) {
      res.setHeader('Content-Length', result.contentLength);
    }
    if (result.contentRange) {
      res.setHeader('Content-Range', result.contentRange);
    }

    res.status(result.statusCode);

    if (result.stream && typeof result.stream.pipe === 'function') {
      result.stream.pipe(res);
    } else if (result.stream && typeof result.stream.transformToByteArray === 'function') {
      const bytes = await result.stream.transformToByteArray();
      res.send(Buffer.from(bytes));
    } else {
      res.end();
    }
  } catch (err: any) {
    console.error('[StreamResource] Error streaming file:', err.message || err);
    if (!res.headersSent) {
      if (err.name === 'NoSuchKey' || err.Code === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
        res.status(404).json({ error: 'Not Found', message: 'Resource file not found in object storage.' });
        return;
      }
      res.status(500).json({ error: 'Storage Stream Error', message: err.message });
    }
  }
}

export async function viewResource(req: Request, res: Response): Promise<void> {
  const resourceId = req.params.id;

  const resRow = await pool.query(
    `SELECT r.*, c.title as course_title, c.code as course_code, u.full_name as uploader_name
     FROM learning_resources r
     JOIN courses c ON r.course_id = c.id
     LEFT JOIN users u ON r.uploaded_by = u.id
     WHERE r.id = $1 AND r.is_confirmed = TRUE`,
    [resourceId]
  );

  if (resRow.rows.length === 0) {
    res.status(404).json({ error: 'Not Found', message: 'Resource not found' });
    return;
  }

  const resource = resRow.rows[0];

  const canAccess = await canAccessCourseContent(
    req.user!.userId,
    req.user!.role,
    req.user!.departmentId,
    resource.course_id
  );

  if (!canAccess) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'You are not authorized to view this resource.',
    });
    return;
  }

  if (resource.external_url) {
    res.status(200).json({
      isExternal: true,
      url: resource.external_url,
      resource,
    });
    return;
  }

  let inlineUrl = `/api/resources/${resource.id}/stream`;
  let presignedInlineUrl = '';
  if (resource.r2_key) {
    try {
      const storage = getStorageProvider();
      presignedInlineUrl = await storage.createPresignedGet(resource.r2_key, resource.title, 900, true);
    } catch (err) {
      // Fallback to stream endpoint
    }
  }

  res.status(200).json({
    isExternal: false,
    streamUrl: inlineUrl,
    presignedInlineUrl: presignedInlineUrl || inlineUrl,
    resource,
  });
}

export async function getCourseResources(req: Request, res: Response): Promise<void> {
  const courseId = Number(req.params.course_id);

  const canAccess = await canAccessCourseContent(
    req.user!.userId,
    req.user!.role,
    req.user!.departmentId,
    courseId
  );

  if (!canAccess) {
    res.status(403).json({ error: 'Forbidden', message: 'You are not enrolled in this course.' });
    return;
  }

  const resources = await pool.query(
    `SELECT lr.id, lr.course_id, lr.title, lr.description, lr.resource_type, lr.visibility,
            lr.r2_key, lr.size_bytes, lr.mime_type, lr.external_url, lr.video_id, lr.start_seconds,
            lr.metadata_json, lr.created_at, u.full_name as uploader_name
     FROM learning_resources lr
     LEFT JOIN users u ON lr.uploaded_by = u.id
     WHERE lr.course_id = $1 AND lr.is_confirmed = TRUE
     ORDER BY lr.created_at DESC;`,
    [courseId]
  );

  res.status(200).json({ resources: resources.rows });
}

export async function deleteResource(req: Request, res: Response): Promise<void> {
  const resourceId = req.params.id;

  const resRow = await pool.query(
    'SELECT * FROM learning_resources WHERE id = $1',
    [resourceId]
  );

  if (resRow.rows.length === 0) {
    res.status(404).json({ error: 'Not Found', message: 'Resource not found' });
    return;
  }

  const resource = resRow.rows[0];

  const canManage = await canManageCourse(
    req.user!.userId,
    req.user!.role,
    req.user!.departmentId,
    resource.course_id
  );

  if (!canManage) {
    res.status(403).json({ error: 'Forbidden', message: 'Not authorized to delete resources for this course.' });
    return;
  }

  // Delete from object storage if r2_key exists
  if (resource.r2_key) {
    try {
      const storage = getStorageProvider();
      await storage.deleteObject(resource.r2_key);
    } catch (e) {
      console.warn('[ResourceDelete] Could not delete object from storage:', e);
    }
  }

  await pool.query('DELETE FROM learning_resources WHERE id = $1', [resourceId]);
  res.status(200).json({ success: true, message: 'Resource deleted successfully' });
}

export async function watermarkDownloadResource(req: Request, res: Response): Promise<void> {
  const resourceId = req.params.id;

  const resRow = await pool.query(
    'SELECT * FROM learning_resources WHERE id = $1 AND is_confirmed = TRUE',
    [resourceId]
  );

  if (resRow.rows.length === 0) {
    res.status(404).json({ error: 'Not Found', message: 'Resource not found' });
    return;
  }

  const resource = resRow.rows[0];

  const canAccess = await canAccessCourseContent(
    req.user!.userId,
    req.user!.role,
    req.user!.departmentId,
    resource.course_id
  );

  if (!canAccess) {
    res.status(403).json({ error: 'Forbidden', message: 'Not authorized to download this resource.' });
    return;
  }

  if (!resource.r2_key) {
    res.status(400).json({ error: 'Bad Request', message: 'No storage file associated with this resource.' });
    return;
  }

  try {
    const storage = getStorageProvider();
    const streamRes = await storage.getObjectStream(resource.r2_key);

    let pdfBytes: Buffer;
    if (streamRes.stream && typeof streamRes.stream.transformToByteArray === 'function') {
      const bytes = await streamRes.stream.transformToByteArray();
      pdfBytes = Buffer.from(bytes);
    } else {
      res.status(500).json({ error: 'Storage Error', message: 'Could not buffer PDF for watermarking.' });
      return;
    }

    const watermarkedBytes = await watermarkPdf(pdfBytes, {
      studentName: req.user!.email,
      matricNo: req.user!.matricNo || undefined,
      ipAddress: req.ip,
      timestamp: new Date().toISOString().split('T')[0],
    });

    const filename = `${resource.title.replace(/[^a-zA-Z0-9_-]/g, '_')}_watermarked.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', watermarkedBytes.length);
    res.send(Buffer.from(watermarkedBytes));
  } catch (err: any) {
    console.error('[WatermarkDownload] Error:', err.message || err);
    if (!res.headersSent) {
      if (err.name === 'NoSuchKey' || err.Code === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
        res.status(404).json({ error: 'Not Found', message: 'Resource file not found in storage.' });
        return;
      }
      res.status(500).json({ error: 'Watermark Error', message: err.message });
    }
  }
}

