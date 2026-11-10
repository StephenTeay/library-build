import { Router, Request, Response } from 'express';
import multer from 'multer';
import { Readable } from 'stream';
import { processCsvStream } from './csvImporter.js';
import {
  registerStudent,
  verifyEmailToken,
  getPendingApprovalQueue,
  batchApproveStudents,
} from './selfRegistration.js';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/roleScope.js';
import { pool } from '../../db/pool.js';

export const onboardingRouter = Router();

// Multer memory storage with 10 MB limit as specified in Section 5
const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.includes('csv') || file.originalname.endsWith('.csv') || file.mimetype === 'text/plain') {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are permitted for bulk student import.'));
    }
  },
});

// --------------------------------------------------------------------------
// 1. Bulk CSV Import (Registrar / HOD)
// --------------------------------------------------------------------------
onboardingRouter.post(
  '/import-csv',
  authenticate,
  requireRole('REGISTRAR', 'HOD'),
  upload.single('file'),
  async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: 'Bad Request', message: 'No CSV file uploaded' });
      return;
    }

    try {
      const stream = Readable.from(req.file.buffer);
      const restrictDeptId = req.user!.role === 'HOD' ? req.user!.departmentId : null;

      const summary = await processCsvStream(
        stream,
        req.user!.userId,
        req.file.originalname,
        restrictDeptId
      );

      res.status(200).json({
        message: 'CSV import processed',
        summary,
      });
    } catch (err: any) {
      console.error('[ImportCsv] Error:', err);
      res.status(500).json({ error: 'Import Failed', message: err.message || 'Internal error processing CSV' });
    }
  }
);

// --------------------------------------------------------------------------
// 2. Fetch Import Job Status / Error Report
// --------------------------------------------------------------------------
onboardingRouter.get(
  '/import-jobs/:id',
  authenticate,
  requireRole('REGISTRAR', 'HOD'),
  async (req: Request, res: Response) => {
    const jobRes = await pool.query('SELECT * FROM import_jobs WHERE id = $1', [req.params.id]);
    if (jobRes.rows.length === 0) {
      res.status(404).json({ error: 'Not Found', message: 'Import job not found' });
      return;
    }
    res.status(200).json({ job: jobRes.rows[0] });
  }
);

// --------------------------------------------------------------------------
// 3. Self-Registration (Public)
// --------------------------------------------------------------------------
onboardingRouter.post('/register', async (req: Request, res: Response) => {
  const {
    matric_no,
    email,
    password,
    full_name,
    department_id,
    programme,
    level,
    entry_session,
  } = req.body || {};

  if (!matric_no || !email || !password || !full_name || !department_id || !programme || !level) {
    res.status(400).json({ error: 'Bad Request', message: 'All required registration fields must be provided.' });
    return;
  }

  try {
    const result = await registerStudent({
      matric_no,
      email,
      password,
      full_name,
      department_id: Number(department_id),
      programme,
      level: Number(level),
      entry_session: entry_session || '2025/2026',
    });

    res.status(201).json(result);
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({ error: err.name || 'Registration Error', message: err.message });
  }
});

// --------------------------------------------------------------------------
// 4. Email Verification (Public)
// --------------------------------------------------------------------------
onboardingRouter.get('/verify-email', async (req: Request, res: Response) => {
  const token = String(req.query.token || '');
  if (!token) {
    res.status(400).json({ error: 'Bad Request', message: 'Verification token is required.' });
    return;
  }

  const success = await verifyEmailToken(token);
  if (!success) {
    res.status(400).json({ error: 'Invalid Token', message: 'Verification link is invalid or has expired.' });
    return;
  }

  res.status(200).json({
    success: true,
    message: 'Email address verified successfully. Your account has entered the departmental approval queue.',
  });
});

// --------------------------------------------------------------------------
// 5. Staff Approval Queue
// --------------------------------------------------------------------------
onboardingRouter.get(
  '/queue',
  authenticate,
  requireRole('REGISTRAR', 'HOD', 'LEVEL_COORDINATOR'),
  async (req: Request, res: Response) => {
    const filterDept = req.query.department_id ? Number(req.query.department_id) : undefined;
    const filterLvl = req.query.level ? Number(req.query.level) : undefined;
    const matchedOnly = req.query.matched_only === 'true';

    try {
      const queue = await getPendingApprovalQueue(req.user!, filterDept, filterLvl, matchedOnly);
      res.status(200).json({ queue, count: queue.length });
    } catch (err: any) {
      res.status(500).json({ error: 'Internal Error', message: err.message });
    }
  }
);

// --------------------------------------------------------------------------
// 6. Batch Approval
// --------------------------------------------------------------------------
onboardingRouter.post(
  '/approve',
  authenticate,
  requireRole('REGISTRAR', 'HOD', 'LEVEL_COORDINATOR'),
  async (req: Request, res: Response) => {
    const { user_ids } = req.body || {};
    if (!Array.isArray(user_ids) || user_ids.length === 0) {
      res.status(400).json({ error: 'Bad Request', message: 'user_ids array is required' });
      return;
    }

    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const result = await batchApproveStudents(req.user!, user_ids, ip);

    res.status(200).json({
      message: `Approved ${result.approvedCount} student(s)`,
      approvedCount: result.approvedCount,
      errors: result.errors,
    });
  }
);

