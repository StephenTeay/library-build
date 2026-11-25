import { Request, Response } from 'express';
import { pool } from '../../db/pool.js';
import { canManageCourse } from '../../middleware/roleScope.js';

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

export async function getCourseReserves(req: Request, res: Response): Promise<void> {
  const courseId = Number(req.params.id);

  try {
    const { rows } = await pool.query(
      `SELECT cr.id, cr.course_id, cr.item_type, cr.item_id, cr.requirement_level, cr.notes, cr.created_at,
              COALESCE(li.title, lr.title) as title,
              COALESCE(li.author, 'Course Reading') as author,
              li.call_number,
              li.copies_available,
              li.copies_total,
              li.cover_url,
              lr.resource_type,
              lr.mime_type
       FROM course_reserves cr
       LEFT JOIN library_items li ON cr.item_type = 'BOOK' AND cr.item_id = li.id::text
       LEFT JOIN learning_resources lr ON cr.item_type = 'RESOURCE' AND cr.item_id = lr.id::text
       WHERE cr.course_id = $1
       ORDER BY cr.requirement_level DESC, cr.created_at ASC;`,
      [courseId]
    );

    res.status(200).json({ reserves: rows });
  } catch (err: any) {
    res.status(500).json({ error: 'Database Error', message: err.message });
  }
}

export async function addCourseReserve(req: Request, res: Response): Promise<void> {
  const courseId = Number(req.params.id);
  const user = req.user!;
  const { item_type, item_id, requirement_level = 'REQUIRED', notes = null } = req.body;

  if (!courseId || !item_type || !item_id) {
    res.status(400).json({ error: 'courseId, item_type, and item_id are required' });
    return;
  }

  const allowed = await canManageCourse(user.userId, user.role, user.departmentId, courseId);
  if (!allowed) {
    res.status(403).json({ error: 'Forbidden', message: 'You cannot manage reserves for this course' });
    return;
  }

  if (!['BOOK', 'RESOURCE'].includes(item_type)) {
    res.status(400).json({ error: 'item_type must be BOOK or RESOURCE' });
    return;
  }

  if (!['REQUIRED', 'RECOMMENDED'].includes(requirement_level)) {
    res.status(400).json({ error: 'requirement_level must be REQUIRED or RECOMMENDED' });
    return;
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO course_reserves (course_id, item_type, item_id, requirement_level, notes, added_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (course_id, item_type, item_id)
       DO UPDATE SET requirement_level = EXCLUDED.requirement_level,
                     notes = COALESCE(EXCLUDED.notes, course_reserves.notes)
       RETURNING *;`,
      [courseId, item_type, item_id, requirement_level, notes, user.userId]
    );

    res.status(201).json({ reserve: rows[0], message: 'Item added to course reserves' });
  } catch (err: any) {
    res.status(500).json({ error: 'Database Error', message: err.message });
  }
}

export async function removeCourseReserve(req: Request, res: Response): Promise<void> {
  const courseId = Number(req.params.id);
  const reserveId = req.params.reserveId;
  const user = req.user!;

  const allowed = await canManageCourse(user.userId, user.role, user.departmentId, courseId);
  if (!allowed) {
    res.status(403).json({ error: 'Forbidden', message: 'You cannot manage reserves for this course' });
    return;
  }

  try {
    const { rowCount } = await pool.query(
      `DELETE FROM course_reserves WHERE id = $1 AND course_id = $2;`,
      [reserveId, courseId]
    );

    if (rowCount === 0) {
      res.status(404).json({ error: 'Reserve entry not found' });
      return;
    }

    res.status(200).json({ message: 'Course reserve removed' });
  } catch (err: any) {
    res.status(500).json({ error: 'Database Error', message: err.message });
  }
}

export async function createCourse(req: Request, res: Response): Promise<void> {
  const user = req.user!;
  let { code, title, department_id, programme, level, semester, credit_units, description } = req.body || {};

  if (!code || !title) {
    res.status(400).json({ error: 'Bad Request', message: 'Course code and title are required.' });
    return;
  }

  // If HOD, force their own department
  if (user.role === 'HOD') {
    department_id = user.departmentId;
  }

  if (!department_id) {
    res.status(400).json({ error: 'Bad Request', message: 'Department is required for a course.' });
    return;
  }

  const cleanCode = String(code).trim().toUpperCase();
  const cleanProg = String(programme || 'ND').toUpperCase();
  const cleanLevel = Number(level) || 1;
  const cleanSemester = Number(semester) || 1;
  const cleanCredits = Number(credit_units) || 2;

  try {
    const existing = await pool.query('SELECT id FROM courses WHERE code = $1', [cleanCode]);
    if (existing.rows.length > 0) {
      res.status(400).json({ error: 'Conflict', message: `Course with code ${cleanCode} already exists.` });
      return;
    }

    const { rows } = await pool.query(
      `INSERT INTO courses (
        code, title, department_id, programme, level, semester, credit_units, description
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;`,
      [cleanCode, title.trim(), Number(department_id), cleanProg, cleanLevel, cleanSemester, cleanCredits, description || null]
    );

    // Fetch department details
    const createdRes = await pool.query(
      `SELECT c.*, d.code as department_code, d.name as department_name, 0 as resource_count
       FROM courses c
       JOIN departments d ON c.department_id = d.id
       WHERE c.id = $1`,
      [rows[0].id]
    );

    res.status(201).json({ course: createdRes.rows[0], message: 'Course created successfully.' });
  } catch (err: any) {
    console.error('[CourseController] createCourse error:', err);
    res.status(500).json({ error: 'Database Error', message: err.message });
  }
}

export async function updateCourse(req: Request, res: Response): Promise<void> {
  const user = req.user!;
  const courseId = Number(req.params.id);
  const { title, description, credit_units, semester, level, programme } = req.body || {};

  try {
    const courseRes = await pool.query('SELECT * FROM courses WHERE id = $1', [courseId]);
    if (courseRes.rows.length === 0) {
      res.status(404).json({ error: 'Not Found', message: 'Course not found.' });
      return;
    }

    const course = courseRes.rows[0];
    if (user.role === 'HOD' && course.department_id !== user.departmentId) {
      res.status(403).json({ error: 'Forbidden', message: 'You can only manage courses in your own department.' });
      return;
    }

    const newTitle = title !== undefined ? title.trim() : course.title;
    const newDesc = description !== undefined ? description : course.description;
    const newCredits = credit_units !== undefined ? Number(credit_units) : course.credit_units;
    const newSemester = semester !== undefined ? Number(semester) : course.semester;
    const newLevel = level !== undefined ? Number(level) : course.level;
    const newProg = programme !== undefined ? String(programme).toUpperCase() : course.programme;

    const { rows } = await pool.query(
      `UPDATE courses
       SET title = $1, description = $2, credit_units = $3, semester = $4, level = $5, programme = $6
       WHERE id = $7
       RETURNING *;`,
      [newTitle, newDesc, newCredits, newSemester, newLevel, newProg, courseId]
    );

    res.status(200).json({ course: rows[0], message: 'Course updated successfully.' });
  } catch (err: any) {
    console.error('[CourseController] updateCourse error:', err);
    res.status(500).json({ error: 'Database Error', message: err.message });
  }
}

export async function deleteCourse(req: Request, res: Response): Promise<void> {
  const user = req.user!;
  const courseId = Number(req.params.id);

  try {
    const courseRes = await pool.query('SELECT * FROM courses WHERE id = $1', [courseId]);
    if (courseRes.rows.length === 0) {
      res.status(404).json({ error: 'Not Found', message: 'Course not found.' });
      return;
    }

    const course = courseRes.rows[0];
    if (user.role === 'HOD' && course.department_id !== user.departmentId) {
      res.status(403).json({ error: 'Forbidden', message: 'You can only delete courses in your own department.' });
      return;
    }

    await pool.query('DELETE FROM courses WHERE id = $1', [courseId]);
    res.status(200).json({ message: `Course ${course.code} deleted successfully.` });
  } catch (err: any) {
    console.error('[CourseController] deleteCourse error:', err);
    res.status(500).json({ error: 'Database Error', message: err.message });
  }
}
