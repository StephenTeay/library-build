import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { authRouter } from './modules/auth/authRoutes.js';
import { onboardingRouter } from './modules/onboarding/onboardingRoutes.js';
import { resourceRouter } from './modules/resources/resourceRoutes.js';
import { libraryRouter } from './modules/library/libraryRoutes.js';
import { aggregatorRouter } from './modules/aggregator/aggregatorRoutes.js';
import { discussionRouter } from './modules/discussions/discussionRoutes.js';
import { courseRouter } from './modules/courses/courseRoutes.js';
import { staffRouter } from './modules/staff/staffRoutes.js';
import { studentRouter } from './modules/students/studentRoutes.js';
import { circulationRouter } from './modules/circulation/circulationRoutes.js';
import { thesesRouter } from './modules/theses/thesesRoutes.js';
import { oaiRouter } from './modules/oai/oaiRoutes.js';
import { analyticsRouter } from './modules/analytics/analyticsRoutes.js';
import { bookshelfRouter } from './modules/bookshelf/bookshelfRoutes.js';
import { authenticate } from './middleware/auth.js';
import {
  requireRole,
  requireDepartmentScope,
  requireLevelScope,
  canManageCourse,
  canAccessCourseContent,
} from './middleware/roleScope.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;
const host = process.env.HOST || '0.0.0.0';

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser requests (e.g. mobile apps, curl) or any connecting desktop origin
    if (!origin) return callback(null, true);
    // Allow all connecting desktops (LAN IP addresses, localhost, tunnels)
    return callback(null, origin);
  },
  credentials: true,
}));
app.use(cookieParser(process.env.COOKIE_SECRET));
app.use(express.json());

// Public Health Check Endpoint for keep-alive pings (cron-job.org / UptimeRobot)
app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth Routes
app.use('/api/auth', authRouter);

// Onboarding & Importer Routes
app.use('/api/onboarding', onboardingRouter);

// Course Management & Enrollment Routes
app.use('/api/courses', courseRouter);

// Learning Resources & S3/R2 Storage Routes
app.use('/api/resources', resourceRouter);

// Library Catalog Provider Routes
app.use('/api/library', libraryRouter);

// Open Resource Aggregator Routes
app.use('/api/aggregator', aggregatorRouter);

// Course Discussion Forum Routes
app.use('/api/discussions', discussionRouter);

// Staff Management Routes (Librarian / Super Admin)
app.use('/api/staff', staffRouter);

// Student Directory & Management Routes
app.use('/api/students', studentRouter);

// Circulation Desk & Lending Routes (Physical & Digital)
app.use('/api/circulation', circulationRouter);

// Institutional Repository (Theses & Capstone Projects)
app.use('/api/theses', thesesRouter);

// OAI-PMH 2.0 Academic Metadata Harvesting Endpoint
app.use('/api/oai', oaiRouter);

// Library Analytics & Search Demand Tracking
app.use('/api/analytics', analyticsRouter);

// Patron Bookshelf & Reading Lists
app.use('/api/bookshelf', bookshelfRouter);

// --------------------------------------------------------------------------
// Permission Matrix Testing Endpoints (Enforces Role-Scope Middleware)
// --------------------------------------------------------------------------

// Registrar Global Only
app.get('/api/test-perm/registrar-only', authenticate, requireRole('REGISTRAR'), (_req, res) => {
  res.status(200).json({ allowed: true, role: 'REGISTRAR' });
});

// HOD or Registrar
app.get('/api/test-perm/hod-or-higher', authenticate, requireRole('REGISTRAR', 'HOD'), (_req, res) => {
  res.status(200).json({ allowed: true });
});

// Department Scoped Action
app.get(
  '/api/test-perm/dept/:department_id',
  authenticate,
  requireRole('REGISTRAR', 'HOD', 'LEVEL_COORDINATOR'),
  requireDepartmentScope('department_id'),
  (_req, res) => {
    res.status(200).json({ allowed: true });
  }
);

// Level Coordinator Scoped Action (Department + Level)
app.get(
  '/api/test-perm/dept/:department_id/level/:level',
  authenticate,
  requireRole('REGISTRAR', 'HOD', 'LEVEL_COORDINATOR'),
  requireDepartmentScope('department_id'),
  requireLevelScope(),
  (_req, res) => {
    res.status(200).json({ allowed: true });
  }
);

// Course Management Scope (Registrar, HOD of dept, Assigned Lecturer)
app.get(
  '/api/test-perm/course-manage/:course_id',
  authenticate,
  async (req, res) => {
    const courseId = Number(req.params.course_id);
    const allowed = await canManageCourse(req.user!.userId, req.user!.role, req.user!.departmentId, courseId);
    if (!allowed) {
      res.status(403).json({ error: 'Forbidden', message: 'Cannot manage course outside assignment/scope' });
      return;
    }
    res.status(200).json({ allowed: true });
  }
);

// Course Content Access Scope (Registrar, Dept Staff, Assigned Lecturer, Enrolled Student)
app.get(
  '/api/test-perm/course-access/:course_id',
  authenticate,
  async (req, res) => {
    const courseId = Number(req.params.course_id);
    const allowed = await canAccessCourseContent(req.user!.userId, req.user!.role, req.user!.departmentId, courseId);
    if (!allowed) {
      res.status(403).json({ error: 'Forbidden', message: 'Cannot access course content without enrollment/scope' });
      return;
    }
    res.status(200).json({ allowed: true });
  }
);

// Protected general endpoint to test forced password change gate
app.get('/api/dashboard/stats', authenticate, (_req, res) => {
  res.status(200).json({ active: true, stats: 'General dashboard data' });
});

export default app;

if (process.env.NODE_ENV !== 'test') {
  app.listen(Number(port), host, async () => {
    console.log(`[FSS-API] Server listening on ${host}:${port}`);
    try {
      const { getStorageProvider } = await import('./providers/storage/s3StorageProvider.js');
      await getStorageProvider().ensureBucketExists();
      console.log(`[FSS-API] Storage bucket verified: ${getStorageProvider().getBucketName()}`);
    } catch (err: any) {
      console.warn(`[FSS-API] Warning verifying storage bucket:`, err.message || err);
    }
  });
}
