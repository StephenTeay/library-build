import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { authRouter } from './modules/auth/authRoutes.js';
import { onboardingRouter } from './modules/onboarding/onboardingRoutes.js';
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

app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
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
  app.listen(port, () => {
    console.log(`[FSS-API] Server listening on port ${port}`);
  });
}
