import { Request, Response } from 'express';
import crypto from 'crypto';
import { pool } from '../../db/pool.js';
import { hashPassword } from '../auth/password.js';

export async function listStudents(req: Request, res: Response): Promise<void> {
  const actor = req.user!;
  const { q, search, department_id, level, programme, status } = req.query;

  try {
    let query = `
      SELECT 
        u.id,
        u.matric_no,
        u.email,
        u.full_name,
        u.department_id,
        d.name as department_name,
        d.code as department_code,
        u.programme,
        u.level,
        u.entry_session,
        u.role,
        u.status,
        u.matched_verified,
        u.email_verified_at,
        u.created_at,
        u.updated_at,
        (SELECT COUNT(*)::int FROM enrollments e WHERE e.student_id = u.id) as enrollment_count,
        (SELECT COUNT(*)::int FROM circulation_loans l WHERE l.user_id = u.id AND l.status = 'ACTIVE') as active_loan_count
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.role = 'STUDENT'
    `;

    const params: any[] = [];
    let paramIdx = 1;

    // Enforce role-based scoping
    if (actor.role === 'HOD') {
      query += ` AND u.department_id = $${paramIdx++}`;
      params.push(actor.departmentId);
    } else if (actor.role === 'LEVEL_COORDINATOR') {
      query += ` AND u.department_id = $${paramIdx++} AND u.level = $${paramIdx++}`;
      params.push(actor.departmentId, actor.level);
    } else if (department_id) {
      // Registrar / Librarian can filter by department
      query += ` AND u.department_id = $${paramIdx++}`;
      params.push(Number(department_id));
    }

    if (level) {
      query += ` AND u.level = $${paramIdx++}`;
      params.push(Number(level));
    }

    if (programme) {
      query += ` AND u.programme = $${paramIdx++}`;
      params.push(String(programme).toUpperCase());
    }

    if (status) {
      query += ` AND u.status = $${paramIdx++}`;
      params.push(status);
    }

    const searchTerm = (q || search) as string | undefined;
    if (searchTerm && searchTerm.trim()) {
      const term = `%${searchTerm.trim()}%`;
      query += ` AND (u.full_name ILIKE $${paramIdx} OR u.matric_no ILIKE $${paramIdx} OR u.email ILIKE $${paramIdx})`;
      params.push(term);
      paramIdx++;
    }

    query += ' ORDER BY u.created_at DESC';

    const result = await pool.query(query, params);
    res.status(200).json({ students: result.rows, count: result.rows.length });
  } catch (err: any) {
    console.error('[StudentController] listStudents error:', err);
    res.status(500).json({ error: 'Server Error', message: err.message });
  }
}

export async function getStudentById(req: Request, res: Response): Promise<void> {
  const actor = req.user!;
  const studentId = req.params.id;

  try {
    const studentRes = await pool.query(
      `SELECT 
        u.id,
        u.matric_no,
        u.email,
        u.full_name,
        u.department_id,
        d.name as department_name,
        d.code as department_code,
        u.programme,
        u.level,
        u.entry_session,
        u.role,
        u.status,
        u.matched_verified,
        u.email_verified_at,
        u.created_at,
        u.updated_at
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.id = $1 AND u.role = 'STUDENT'`,
      [studentId]
    );

    if (studentRes.rows.length === 0) {
      res.status(404).json({ error: 'Not Found', message: 'Student record not found.' });
      return;
    }

    const student = studentRes.rows[0];

    // Enforce Scope
    if (actor.role === 'HOD' && student.department_id !== actor.departmentId) {
      res.status(403).json({ error: 'Forbidden', message: 'You can only view students in your department.' });
      return;
    }

    // Fetch enrolled courses
    const enrollmentsRes = await pool.query(
      `SELECT c.id, c.code, c.title, c.credit_units, c.semester, e.session, e.status, e.created_at as enrolled_at
       FROM enrollments e
       JOIN courses c ON e.course_id = c.id
       WHERE e.student_id = $1
       ORDER BY c.code ASC`,
      [studentId]
    );

    // Fetch active and past circulation loans
    const loansRes = await pool.query(
      `SELECT cl.id, cl.item_id, li.title as item_title, li.call_number, cl.borrowed_at, cl.due_at, cl.returned_at, cl.status
       FROM circulation_loans cl
       JOIN library_items li ON cl.item_id = li.id
       WHERE cl.user_id = $1
       ORDER BY cl.borrowed_at DESC LIMIT 20`,
      [studentId]
    );

    res.status(200).json({
      student,
      enrollments: enrollmentsRes.rows,
      loans: loansRes.rows,
    });
  } catch (err: any) {
    console.error('[StudentController] getStudentById error:', err);
    res.status(500).json({ error: 'Server Error', message: err.message });
  }
}

export async function createStudent(req: Request, res: Response): Promise<void> {
  const actor = req.user!;
  const {
    email,
    full_name,
    matric_no,
    department_id,
    programme = 'ND',
    level = 1,
    entry_session = '2025/2026',
    password,
  } = req.body || {};

  if (!email || !full_name || !department_id) {
    res.status(400).json({ error: 'Bad Request', message: 'Full name, email, and department are required.' });
    return;
  }

  const deptIdNum = Number(department_id);
  if (isNaN(deptIdNum)) {
    res.status(400).json({ error: 'Bad Request', message: 'Invalid department ID.' });
    return;
  }

  // HOD scope constraint
  if (actor.role === 'HOD' && deptIdNum !== actor.departmentId) {
    res.status(403).json({ error: 'Forbidden', message: 'HODs can only create students in their own department.' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check email uniqueness
    const emailCheck = await client.query('SELECT id FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    if (emailCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'Bad Request', message: 'A user with this email address already exists.' });
      return;
    }

    // Check matric uniqueness if provided
    const cleanMatric = matric_no ? matric_no.trim().toUpperCase() : null;
    if (cleanMatric) {
      const matricCheck = await client.query('SELECT id FROM users WHERE matric_no = $1', [cleanMatric]);
      if (matricCheck.rows.length > 0) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: 'Bad Request', message: 'A student with this matric number already exists.' });
        return;
      }
    }

    // Determine initial password
    const rawPassword = password && password.trim() ? password.trim() : `FSS-${Math.floor(1000 + Math.random() * 9000)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const passwordHash = await hashPassword(rawPassword);

    // Insert student
    const insertRes = await client.query(
      `INSERT INTO users (
        email, password_hash, full_name, matric_no, role, status,
        department_id, programme, level, entry_session,
        email_verified_at, must_change_password, matched_verified
      ) VALUES (
        $1, $2, $3, $4, 'STUDENT', 'ACTIVE',
        $5, $6, $7, $8,
        NOW(), TRUE, TRUE
      ) RETURNING id, email, full_name, matric_no, role, status, department_id, programme, level, entry_session, created_at`,
      [
        email.trim().toLowerCase(),
        passwordHash,
        full_name.trim(),
        cleanMatric,
        deptIdNum,
        programme.toUpperCase(),
        Number(level) || 1,
        entry_session.trim(),
      ]
    );

    const newStudent = insertRes.rows[0];

    // Auto-enroll in matching departmental courses
    await client.query(
      `INSERT INTO enrollments (student_id, course_id, session, status)
       SELECT $1, c.id, $2, 'ACTIVE'
       FROM courses c
       WHERE c.department_id = $3
       ON CONFLICT (student_id, course_id, session) DO NOTHING`,
      [newStudent.id, entry_session.trim(), deptIdNum]
    );

    // Audit log
    await client.query(
      `INSERT INTO audit_logs (user_id, action, target_type, target_id, ip_address, details_json)
       VALUES ($1, 'STUDENT_CREATE', 'USER', $2, $3, $4)`,
      [actor.userId, newStudent.id, req.ip || 'unknown', JSON.stringify({ email: newStudent.email, created_by: actor.email })]
    );

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Student successfully created and enrolled.',
      student: newStudent,
      tempPassword: rawPassword,
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[StudentController] createStudent error:', err);
    res.status(500).json({ error: 'Server Error', message: err.message });
  } finally {
    client.release();
  }
}

export async function updateStudent(req: Request, res: Response): Promise<void> {
  const actor = req.user!;
  const studentId = req.params.id;
  const { full_name, matric_no, email, department_id, programme, level, entry_session } = req.body || {};

  try {
    const studentRes = await pool.query(
      'SELECT id, department_id, full_name, email, matric_no FROM users WHERE id = $1 AND role = \'STUDENT\'',
      [studentId]
    );

    if (studentRes.rows.length === 0) {
      res.status(404).json({ error: 'Not Found', message: 'Student record not found.' });
      return;
    }

    const current = studentRes.rows[0];

    // Enforce Scope
    if (actor.role === 'HOD') {
      if (current.department_id !== actor.departmentId) {
        res.status(403).json({ error: 'Forbidden', message: 'You can only update students in your department.' });
        return;
      }
      if (department_id !== undefined && Number(department_id) !== actor.departmentId) {
        res.status(403).json({ error: 'Forbidden', message: 'HODs cannot move students to another department.' });
        return;
      }
    }

    // Check email uniqueness if changed
    if (email && email.trim().toLowerCase() !== current.email.toLowerCase()) {
      const emailCheck = await pool.query('SELECT id FROM users WHERE email = $1 AND id != $2', [email.trim().toLowerCase(), studentId]);
      if (emailCheck.rows.length > 0) {
        res.status(400).json({ error: 'Bad Request', message: 'Email address is already in use by another account.' });
        return;
      }
    }

    // Check matric uniqueness if changed
    const cleanMatric = matric_no !== undefined ? (matric_no ? matric_no.trim().toUpperCase() : null) : undefined;
    if (cleanMatric && cleanMatric !== current.matric_no) {
      const matricCheck = await pool.query('SELECT id FROM users WHERE matric_no = $1 AND id != $2', [cleanMatric, studentId]);
      if (matricCheck.rows.length > 0) {
        res.status(400).json({ error: 'Bad Request', message: 'Matric number is already assigned to another student.' });
        return;
      }
    }

    const updated = await pool.query(
      `UPDATE users
       SET 
         full_name = COALESCE($1, full_name),
         matric_no = CASE WHEN $2::text IS NOT NULL THEN $2 ELSE matric_no END,
         email = COALESCE($3, email),
         department_id = COALESCE($4, department_id),
         programme = COALESCE($5, programme),
         level = COALESCE($6, level),
         entry_session = COALESCE($7, entry_session),
         updated_at = NOW()
       WHERE id = $8 AND role = 'STUDENT'
       RETURNING id, matric_no, email, full_name, department_id, programme, level, entry_session, status, updated_at`,
      [
        full_name ? full_name.trim() : null,
        cleanMatric !== undefined ? cleanMatric : null,
        email ? email.trim().toLowerCase() : null,
        department_id ? Number(department_id) : null,
        programme ? String(programme).toUpperCase() : null,
        level ? Number(level) : null,
        entry_session ? entry_session.trim() : null,
        studentId,
      ]
    );

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, target_type, target_id, ip_address, details_json)
       VALUES ($1, 'STUDENT_UPDATE', 'USER', $2, $3, $4)`,
      [actor.userId, studentId, req.ip || 'unknown', JSON.stringify({ updated_by: actor.email, changes: req.body })]
    );

    res.status(200).json({
      message: 'Student details updated successfully.',
      student: updated.rows[0],
    });
  } catch (err: any) {
    console.error('[StudentController] updateStudent error:', err);
    res.status(500).json({ error: 'Server Error', message: err.message });
  }
}

export async function updateStudentStatus(req: Request, res: Response): Promise<void> {
  const actor = req.user!;
  const studentId = req.params.id;
  const { status } = req.body || {};

  if (!status || !['ACTIVE', 'SUSPENDED', 'PENDING'].includes(status)) {
    res.status(400).json({ error: 'Bad Request', message: 'Status must be ACTIVE, SUSPENDED, or PENDING.' });
    return;
  }

  try {
    const studentRes = await pool.query('SELECT id, department_id, full_name, email FROM users WHERE id = $1 AND role = \'STUDENT\'', [studentId]);
    if (studentRes.rows.length === 0) {
      res.status(404).json({ error: 'Not Found', message: 'Student record not found.' });
      return;
    }

    const student = studentRes.rows[0];

    // Enforce Scope
    if (actor.role === 'HOD' && student.department_id !== actor.departmentId) {
      res.status(403).json({ error: 'Forbidden', message: 'You can only update students in your department.' });
      return;
    }

    const updated = await pool.query(
      'UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, matric_no, email, full_name, status, updated_at',
      [status, studentId]
    );

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, target_type, target_id, ip_address, details_json)
       VALUES ($1, 'STUDENT_STATUS_UPDATE', 'USER', $2, $3, $4)`,
      [actor.userId, studentId, req.ip || 'unknown', JSON.stringify({ new_status: status, updated_by: actor.email })]
    );

    res.status(200).json({
      message: `Student account status updated to ${status}.`,
      student: updated.rows[0],
    });
  } catch (err: any) {
    console.error('[StudentController] updateStudentStatus error:', err);
    res.status(500).json({ error: 'Server Error', message: err.message });
  }
}

export async function resetStudentPassword(req: Request, res: Response): Promise<void> {
  const actor = req.user!;
  const studentId = req.params.id;

  try {
    const studentRes = await pool.query(
      'SELECT id, department_id, full_name, email, matric_no FROM users WHERE id = $1 AND role = \'STUDENT\'',
      [studentId]
    );

    if (studentRes.rows.length === 0) {
      res.status(404).json({ error: 'Not Found', message: 'Student record not found.' });
      return;
    }

    const student = studentRes.rows[0];

    // Enforce Scope
    if (actor.role === 'HOD' && student.department_id !== actor.departmentId) {
      res.status(403).json({ error: 'Forbidden', message: 'You can only reset passwords for students in your department.' });
      return;
    }

    // Generate memorable random temporary password: FSS-<4-digits>-<3-chars>
    const randomCode = Math.floor(1000 + Math.random() * 9000);
    const randomSuffix = crypto.randomBytes(2).toString('hex').toUpperCase();
    const tempPassword = `FSS-${randomCode}-${randomSuffix}`;
    const passwordHash = await hashPassword(tempPassword);

    await pool.query(
      `UPDATE users 
       SET password_hash = $1, must_change_password = TRUE, updated_at = NOW()
       WHERE id = $2`,
      [passwordHash, studentId]
    );

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, target_type, target_id, ip_address, details_json)
       VALUES ($1, 'STUDENT_PASSWORD_RESET', 'USER', $2, $3, $4)`,
      [actor.userId, studentId, req.ip || 'unknown', JSON.stringify({ reset_by: actor.email })]
    );

    res.status(200).json({
      message: 'Temporary password generated successfully.',
      tempPassword,
      email: student.email,
      studentName: student.full_name,
    });
  } catch (err: any) {
    console.error('[StudentController] resetStudentPassword error:', err);
    res.status(500).json({ error: 'Server Error', message: err.message });
  }
}

export async function enrollStudentInCourse(req: Request, res: Response): Promise<void> {
  const actor = req.user!;
  const studentId = req.params.id;
  const { course_id, session = '2025/2026' } = req.body || {};

  if (!course_id) {
    res.status(400).json({ error: 'Bad Request', message: 'course_id is required.' });
    return;
  }

  try {
    const studentRes = await pool.query(
      'SELECT id, department_id, full_name, email FROM users WHERE id = $1 AND role = \'STUDENT\'',
      [studentId]
    );

    if (studentRes.rows.length === 0) {
      res.status(404).json({ error: 'Not Found', message: 'Student record not found.' });
      return;
    }

    const student = studentRes.rows[0];

    // Enforce HOD Scope
    if (actor.role === 'HOD' && student.department_id !== actor.departmentId) {
      res.status(403).json({ error: 'Forbidden', message: 'You can only enroll students in your department.' });
      return;
    }

    const courseRes = await pool.query('SELECT id, code, title, credit_units FROM courses WHERE id = $1', [Number(course_id)]);
    if (courseRes.rows.length === 0) {
      res.status(404).json({ error: 'Not Found', message: 'Course not found.' });
      return;
    }

    await pool.query(
      `INSERT INTO enrollments (student_id, course_id, session, status)
       VALUES ($1, $2, $3, 'ACTIVE')
       ON CONFLICT (student_id, course_id, session) 
       DO UPDATE SET status = 'ACTIVE'`,
      [studentId, Number(course_id), session]
    );

    const updatedEnrollments = await pool.query(
      `SELECT c.id, c.code, c.title, c.credit_units, c.semester, e.session, e.status, e.created_at as enrolled_at
       FROM enrollments e
       JOIN courses c ON e.course_id = c.id
       WHERE e.student_id = $1
       ORDER BY c.code ASC`,
      [studentId]
    );

    res.status(200).json({
      message: `Enrolled in ${courseRes.rows[0].code} successfully.`,
      enrollments: updatedEnrollments.rows,
    });
  } catch (err: any) {
    console.error('[StudentController] enrollStudentInCourse error:', err);
    res.status(500).json({ error: 'Server Error', message: err.message });
  }
}

export async function unenrollStudentFromCourse(req: Request, res: Response): Promise<void> {
  const actor = req.user!;
  const studentId = req.params.id;
  const courseId = req.params.courseId;

  try {
    const studentRes = await pool.query(
      'SELECT id, department_id FROM users WHERE id = $1 AND role = \'STUDENT\'',
      [studentId]
    );

    if (studentRes.rows.length === 0) {
      res.status(404).json({ error: 'Not Found', message: 'Student record not found.' });
      return;
    }

    if (actor.role === 'HOD' && studentRes.rows[0].department_id !== actor.departmentId) {
      res.status(403).json({ error: 'Forbidden', message: 'You can only manage students in your department.' });
      return;
    }

    await pool.query(
      'DELETE FROM enrollments WHERE student_id = $1 AND course_id = $2',
      [studentId, Number(courseId)]
    );

    res.status(200).json({ message: 'Course enrollment removed.' });
  } catch (err: any) {
    console.error('[StudentController] unenrollStudentFromCourse error:', err);
    res.status(500).json({ error: 'Server Error', message: err.message });
  }
}

export async function deleteStudent(req: Request, res: Response): Promise<void> {
  const actor = req.user!;
  const studentId = req.params.id;

  try {
    const studentRes = await pool.query(
      'SELECT id, full_name, email, matric_no FROM users WHERE id = $1 AND role = \'STUDENT\'',
      [studentId]
    );

    if (studentRes.rows.length === 0) {
      res.status(404).json({ error: 'Not Found', message: 'Student record not found.' });
      return;
    }

    const student = studentRes.rows[0];

    // Check if student has active physical library loans
    const loansCheck = await pool.query(
      'SELECT COUNT(*)::int as count FROM circulation_loans WHERE user_id = $1 AND status = \'ACTIVE\'',
      [studentId]
    );

    if (loansCheck.rows[0].count > 0) {
      res.status(400).json({
        error: 'Bad Request',
        message: `Cannot delete student ${student.full_name}. They have ${loansCheck.rows[0].count} active physical library loan(s). Please process return of borrowed books first.`,
      });
      return;
    }

    // Delete student (cascades to enrollments, tokens, discussions, etc.)
    await pool.query('DELETE FROM users WHERE id = $1 AND role = \'STUDENT\'', [studentId]);

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, target_type, target_id, ip_address, details_json)
       VALUES ($1, 'STUDENT_DELETE', 'USER', $2, $3, $4)`,
      [actor.userId, studentId, req.ip || 'unknown', JSON.stringify({ deleted_student: student, deleted_by: actor.email })]
    );

    res.status(200).json({
      message: `Student account for ${student.full_name} (${student.email}) has been permanently deleted.`,
    });
  } catch (err: any) {
    console.error('[StudentController] deleteStudent error:', err);
    res.status(500).json({ error: 'Server Error', message: err.message });
  }
}
