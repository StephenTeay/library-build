import { Request, Response, NextFunction } from 'express';
import { pool } from '../db/pool.js';

export type UserRole = 'REGISTRAR' | 'HOD' | 'LEVEL_COORDINATOR' | 'LECTURER' | 'STUDENT';

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized', message: 'Authentication required' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        error: 'Forbidden',
        message: `Insufficient role privileges. Required: [${roles.join(', ')}], Current: ${req.user.role}`,
      });
      return;
    }

    next();
  };
}

export function requireDepartmentScope(deptParamName = 'department_id') {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized', message: 'Authentication required' });
      return;
    }

    // REGISTRAR has global department access
    if (req.user.role === 'REGISTRAR') {
      return next();
    }

    const requestedDeptId = Number(req.params[deptParamName] || req.body[deptParamName] || req.query[deptParamName]);

    if (!requestedDeptId) {
      res.status(400).json({ error: 'Bad Request', message: `Missing required parameter: ${deptParamName}` });
      return;
    }

    if (req.user.departmentId !== requestedDeptId) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'You are not authorized to access or manage records outside your assigned department.',
      });
      return;
    }

    next();
  };
}

export function requireLevelScope() {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized', message: 'Authentication required' });
      return;
    }

    // REGISTRAR and HOD have cross-level department access
    if (req.user.role === 'REGISTRAR' || req.user.role === 'HOD') {
      return next();
    }

    if (req.user.role === 'LEVEL_COORDINATOR') {
      const requestedLevel = Number(req.params.level || req.body.level || req.query.level);
      if (requestedLevel && req.user.level !== requestedLevel) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'Level Coordinator cannot access records outside their designated academic level.',
        });
        return;
      }
    }

    next();
  };
}

export async function canManageCourse(userId: string, role: UserRole, userDeptId: number | null, courseId: number): Promise<boolean> {
  if (role === 'REGISTRAR') return true;

  const courseRes = await pool.query('SELECT department_id FROM courses WHERE id = $1', [courseId]);
  if (courseRes.rows.length === 0) return false;
  const courseDeptId = courseRes.rows[0].department_id;

  if (role === 'HOD' || role === 'LEVEL_COORDINATOR') {
    return userDeptId === courseDeptId;
  }

  if (role === 'LECTURER') {
    const assignRes = await pool.query(
      'SELECT id FROM course_assignments WHERE course_id = $1 AND lecturer_id = $2',
      [courseId, userId]
    );
    return assignRes.rows.length > 0;
  }

  return false;
}

export async function canAccessCourseContent(userId: string, role: UserRole, userDeptId: number | null, courseId: number): Promise<boolean> {
  if (role === 'REGISTRAR') return true;

  if (role === 'HOD' || role === 'LEVEL_COORDINATOR') {
    const courseRes = await pool.query('SELECT department_id FROM courses WHERE id = $1', [courseId]);
    return courseRes.rows.length > 0 && courseRes.rows[0].department_id === userDeptId;
  }

  if (role === 'LECTURER') {
    return canManageCourse(userId, role, userDeptId, courseId);
  }

  if (role === 'STUDENT') {
    const enrollRes = await pool.query(
      "SELECT id FROM enrollments WHERE course_id = $1 AND student_id = $2 AND status = 'ENROLLED'",
      [courseId, userId]
    );
    return enrollRes.rows.length > 0;
  }

  return false;
}

