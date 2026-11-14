import { Request, Response } from 'express';
import { pool } from '../../db/pool.js';

export async function getAllCourses(req: Request, res: Response): Promise<void> {
  const user = req.user!;
  let queryText = `
    SELECT c.id, c.code, c.title, c.department_id, d.code as department_code, d.name as department_name,
           c.programme, c.level, c.semester, c.credit_units, c.description,
           u.full_name as lecturer_name,
           (SELECT COUNT(*)::int FROM learning_resources lr WHERE lr.course_id = c.id AND lr.is_confirmed = TRUE) as resource_count
    FROM courses c
    JOIN departments d ON c.department_id = d.id
    LEFT JOIN course_assignments ca ON c.id = ca.course_id
    LEFT JOIN users u ON ca.lecturer_id = u.id
  `;
  const params: any[] = [];

  // If HOD or Lecturer or Level Coordinator, filter to their department if not Registrar
  if (user.role === 'HOD' || user.role === 'LEVEL_COORDINATOR') {
    params.push(user.departmentId);
    queryText += ` WHERE c.department_id = $${params.length}`;
  } else if (user.role === 'LECTURER') {
    // If lecturer, show assigned courses or department courses
    params.push(user.userId);
    queryText += ` WHERE ca.lecturer_id = $${params.length}`;
    if (user.departmentId) {
      params.push(user.departmentId);
      queryText += ` OR c.department_id = $${params.length}`;
    }
  } else if (user.role === 'STUDENT') {
    if (user.departmentId) {
      params.push(user.departmentId);
      queryText += ` WHERE c.department_id = $${params.length}`;
    }
  }

  queryText += ' ORDER BY c.code ASC;';

  try {
    const coursesRes = await pool.query(queryText, params);
    res.status(200).json({ courses: coursesRes.rows });
  } catch (err: any) {
    res.status(500).json({ error: 'Database Error', message: err.message });
  }
}

export async function getEnrolledCourses(req: Request, res: Response): Promise<void> {
  const user = req.user!;

  try {
    // For student: query enrollments
    if (user.role === 'STUDENT') {
      const enrolledRes = await pool.query(
        `SELECT c.id, c.code, c.title, c.department_id, d.code as department_code, d.name as department_name,
                c.programme, c.level, c.semester, c.credit_units, c.description,
                u.full_name as lecturer_name,
                (SELECT COUNT(*)::int FROM learning_resources lr WHERE lr.course_id = c.id AND lr.is_confirmed = TRUE) as resource_count
         FROM enrollments e
         JOIN courses c ON e.course_id = c.id
         JOIN departments d ON c.department_id = d.id
         LEFT JOIN course_assignments ca ON c.id = ca.course_id
         LEFT JOIN users u ON ca.lecturer_id = u.id
         WHERE e.student_id = $1 AND e.status = 'ENROLLED'
         ORDER BY c.code ASC;`,
        [user.userId]
      );

      // Fallback: If student has 0 explicit enrollment rows yet (e.g. newly self-registered),
      // match courses for their department, programme, and level
      if (enrolledRes.rows.length === 0 && user.departmentId && user.programme && user.level) {
        const autoRes = await pool.query(
          `SELECT c.id, c.code, c.title, c.department_id, d.code as department_code, d.name as department_name,
                  c.programme, c.level, c.semester, c.credit_units, c.description,
                  u.full_name as lecturer_name,
                  (SELECT COUNT(*)::int FROM learning_resources lr WHERE lr.course_id = c.id AND lr.is_confirmed = TRUE) as resource_count
           FROM courses c
           JOIN departments d ON c.department_id = d.id
           LEFT JOIN course_assignments ca ON c.id = ca.course_id
           LEFT JOIN users u ON ca.lecturer_id = u.id
           WHERE c.department_id = $1 AND c.programme = $2 AND c.level = $3
           ORDER BY c.code ASC;`,
          [user.departmentId, user.programme, user.level]
        );

        // Auto-create enrollment rows for active session
        for (const row of autoRes.rows) {
          await pool.query(
            `INSERT INTO enrollments (student_id, course_id, session, status)
             VALUES ($1, $2, '2025/2026', 'ENROLLED')
             ON CONFLICT DO NOTHING;`,
            [user.userId, row.id]
          );
        }

        res.status(200).json({ courses: autoRes.rows });
        return;
      }

      res.status(200).json({ courses: enrolledRes.rows });
      return;
    }

    // For faculty / staff: return department or assigned courses
    return getAllCourses(req, res);
  } catch (err: any) {
    res.status(500).json({ error: 'Database Error', message: err.message });
  }
}

export async function getCourseById(req: Request, res: Response): Promise<void> {
  const courseId = Number(req.params.id);

  if (!courseId) {
    res.status(400).json({ error: 'Bad Request', message: 'Valid course ID required' });
    return;
  }

  try {
    const courseRes = await pool.query(
      `SELECT c.id, c.code, c.title, c.department_id, d.code as department_code, d.name as department_name,
              c.programme, c.level, c.semester, c.credit_units, c.description,
              u.full_name as lecturer_name
       FROM courses c
       JOIN departments d ON c.department_id = d.id
       LEFT JOIN course_assignments ca ON c.id = ca.course_id
       LEFT JOIN users u ON ca.lecturer_id = u.id
       WHERE c.id = $1;`,
      [courseId]
    );

    if (courseRes.rows.length === 0) {
      res.status(404).json({ error: 'Not Found', message: 'Course not found' });
      return;
    }

    res.status(200).json({ course: courseRes.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: 'Database Error', message: err.message });
  }
}

export async function enrollInCourse(req: Request, res: Response): Promise<void> {
  const courseId = Number(req.params.id);
  const user = req.user!;

  if (!courseId) {
    res.status(400).json({ error: 'Bad Request', message: 'Valid course ID required' });
    return;
  }

  try {
    const courseCheck = await pool.query('SELECT id, department_id, programme, level FROM courses WHERE id = $1', [courseId]);
    if (courseCheck.rows.length === 0) {
      res.status(404).json({ error: 'Not Found', message: 'Course not found' });
      return;
    }

    await pool.query(
      `INSERT INTO enrollments (student_id, course_id, session, status)
       VALUES ($1, $2, '2025/2026', 'ENROLLED')
       ON CONFLICT (student_id, course_id, session) DO UPDATE SET status = 'ENROLLED';`,
      [user.userId, courseId]
    );

    res.status(200).json({ message: 'Enrolled successfully', courseId });
  } catch (err: any) {
    res.status(500).json({ error: 'Enrollment Error', message: err.message });
  }
}
