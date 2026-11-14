import { Request, Response } from 'express';
import crypto from 'crypto';
import { pool } from '../../db/pool.js';
import { hashPassword } from '../auth/password.js';
import { getEmailProvider } from '../../providers/email/emailProvider.js';

const ALLOWED_STAFF_ROLES = ['HOD', 'LEVEL_COORDINATOR', 'LECTURER', 'LIBRARY_STAFF', 'LIBRARIAN', 'REGISTRAR'] as const;
type StaffRole = typeof ALLOWED_STAFF_ROLES[number];

export async function listStaff(req: Request, res: Response): Promise<void> {
  try {
    const { role, department_id, status, search } = req.query;

    let query = `
      SELECT 
        u.id,
        u.email,
        u.full_name,
        u.role,
        u.status,
        u.department_id,
        d.name as department_name,
        d.code as department_code,
        u.level,
        u.must_change_password,
        u.created_at,
        u.updated_at
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.role IN ('LIBRARIAN', 'REGISTRAR', 'LIBRARY_STAFF', 'HOD', 'LEVEL_COORDINATOR', 'LECTURER')
    `;

    const params: any[] = [];
    let paramIdx = 1;

    if (role) {
      query += ` AND u.role = $${paramIdx++}`;
      params.push(role);
    }

    if (department_id) {
      query += ` AND u.department_id = $${paramIdx++}`;
      params.push(Number(department_id));
    }

    if (status) {
      query += ` AND u.status = $${paramIdx++}`;
      params.push(status);
    }

    if (search && typeof search === 'string') {
      query += ` AND (u.full_name ILIKE $${paramIdx} OR u.email ILIKE $${paramIdx})`;
      params.push(`%${search.trim()}%`);
      paramIdx++;
    }

    query += ' ORDER BY u.created_at DESC';

    const result = await pool.query(query, params);

    res.status(200).json({
      staff: result.rows,
      total: result.rows.length,
    });
  } catch (err: any) {
    console.error('[StaffController] listStaff error:', err);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to retrieve staff directory' });
  }
}

export async function createStaff(req: Request, res: Response): Promise<void> {
  const client = await pool.connect();
  try {
    const { full_name, email, role, department_id, level, initial_password } = req.body;

    if (!full_name || typeof full_name !== 'string' || !full_name.trim()) {
      res.status(400).json({ error: 'Bad Request', message: 'Full name is required' });
      return;
    }

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      res.status(400).json({ error: 'Bad Request', message: 'Valid email address is required' });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();

    if (!role || !ALLOWED_STAFF_ROLES.includes(role as StaffRole)) {
      res.status(400).json({
        error: 'Bad Request',
        message: `Role must be one of: ${ALLOWED_STAFF_ROLES.join(', ')}`,
      });
      return;
    }

    // Role-specific validations
    const requiresDept = ['HOD', 'LEVEL_COORDINATOR', 'LECTURER'].includes(role);
    if (requiresDept && !department_id) {
      res.status(400).json({
        error: 'Bad Request',
        message: `Department is required for staff role: ${role}`,
      });
      return;
    }

    if (department_id) {
      const deptCheck = await client.query('SELECT id, name FROM departments WHERE id = $1', [department_id]);
      if (deptCheck.rows.length === 0) {
        res.status(400).json({ error: 'Bad Request', message: 'Invalid department specified' });
        return;
      }
    }

    if (role === 'LEVEL_COORDINATOR' && level && ![1, 2].includes(Number(level))) {
      res.status(400).json({ error: 'Bad Request', message: 'Level must be 1 (ND 1 / HND 1) or 2 (ND 2 / HND 2)' });
      return;
    }

    // Check duplicate email
    const duplicate = await client.query('SELECT id FROM users WHERE email = $1', [cleanEmail]);
    if (duplicate.rows.length > 0) {
      res.status(409).json({ error: 'Conflict', message: 'An account with this email address already exists' });
      return;
    }

    // Generate or use temporary password
    const tempPassword = initial_password && String(initial_password).trim().length >= 8
      ? String(initial_password).trim()
      : `StaffPass${crypto.randomInt(1000, 9999)}!`;

    const passwordHash = await hashPassword(tempPassword);

    await client.query('BEGIN');

    const insertUserRes = await client.query(
      `INSERT INTO users (
        email,
        password_hash,
        full_name,
        role,
        department_id,
        level,
        status,
        must_change_password,
        matched_verified,
        email_verified_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', TRUE, TRUE, NOW())
      RETURNING id, email, full_name, role, department_id, level, status, must_change_password, created_at;`,
      [cleanEmail, passwordHash, full_name.trim(), role, department_id || null, level || null]
    );

    const newUser = insertUserRes.rows[0];

    // Populate user_scopes for HOD or LEVEL_COORDINATOR
    if (['HOD', 'LEVEL_COORDINATOR'].includes(role) && department_id) {
      await client.query(
        `INSERT INTO user_scopes (user_id, department_id, level)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, department_id, level) DO NOTHING`,
        [newUser.id, department_id, level || null]
      );
    }

    // Verify actor exists before audit log
    const actorCheck = req.user?.userId ? await client.query('SELECT id FROM users WHERE id = $1', [req.user.userId]) : { rows: [] };
    const actorId = actorCheck.rows.length > 0 ? req.user?.userId : null;

    // Audit log
    await client.query(
      `INSERT INTO audit_logs (user_id, action, target_type, target_id, details_json)
       VALUES ($1, 'STAFF_CREATED', 'USER', $2, $3)`,
      [actorId, newUser.id, JSON.stringify({ email: cleanEmail, role, department_id })]
    );

    await client.query('COMMIT');

    // Send Welcome Email
    try {
      const emailProvider = getEmailProvider();
      await emailProvider.sendStaffWelcomeEmail(cleanEmail, full_name.trim(), role, tempPassword);
    } catch (mailErr) {
      console.warn('[StaffController] Email notification warning:', mailErr);
    }

    res.status(201).json({
      message: 'Staff member created successfully',
      staff: newUser,
      temporary_password: tempPassword,
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[StaffController] createStaff error:', err);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to create staff member' });
  } finally {
    client.release();
  }
}

export async function updateStaff(req: Request, res: Response): Promise<void> {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { role, department_id, level, status } = req.body;

    const existing = await client.query('SELECT id, role, department_id, level, status FROM users WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Not Found', message: 'Staff member not found' });
      return;
    }

    if (role && !ALLOWED_STAFF_ROLES.includes(role)) {
      res.status(400).json({ error: 'Bad Request', message: `Invalid role: ${role}` });
      return;
    }

    if (status && !['ACTIVE', 'SUSPENDED'].includes(status)) {
      res.status(400).json({ error: 'Bad Request', message: 'Status must be ACTIVE or SUSPENDED' });
      return;
    }

    const updatedRole = role || existing.rows[0].role;
    const updatedDept = department_id !== undefined ? department_id : existing.rows[0].department_id;
    const updatedLevel = level !== undefined ? level : existing.rows[0].level;
    const updatedStatus = status || existing.rows[0].status;

    await client.query('BEGIN');

    const updateRes = await client.query(
      `UPDATE users
       SET role = $1, department_id = $2, level = $3, status = $4, updated_at = NOW()
       WHERE id = $5
       RETURNING id, email, full_name, role, department_id, level, status, updated_at;`,
      [updatedRole, updatedDept, updatedLevel, updatedStatus, id]
    );

    // Refresh user scopes if HOD or Level Coordinator
    await client.query('DELETE FROM user_scopes WHERE user_id = $1', [id]);
    if (['HOD', 'LEVEL_COORDINATOR'].includes(updatedRole) && updatedDept) {
      await client.query(
        `INSERT INTO user_scopes (user_id, department_id, level)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, department_id, level) DO NOTHING`,
        [id, updatedDept, updatedLevel || null]
      );
    }

    const actorCheck = req.user?.userId ? await client.query('SELECT id FROM users WHERE id = $1', [req.user.userId]) : { rows: [] };
    const actorId = actorCheck.rows.length > 0 ? req.user?.userId : null;

    await client.query(
      `INSERT INTO audit_logs (user_id, action, target_type, target_id, details_json)
       VALUES ($1, 'STAFF_UPDATED', 'USER', $2, $3)`,
      [actorId, id, JSON.stringify({ role: updatedRole, department_id: updatedDept, status: updatedStatus })]
    );

    await client.query('COMMIT');

    res.status(200).json({
      message: 'Staff member updated successfully',
      staff: updateRes.rows[0],
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[StaffController] updateStaff error:', err);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to update staff member' });
  } finally {
    client.release();
  }
}

export async function resetStaffPassword(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const userRes = await pool.query('SELECT id, email, full_name, role FROM users WHERE id = $1', [id]);

    if (userRes.rows.length === 0) {
      res.status(404).json({ error: 'Not Found', message: 'Staff member not found' });
      return;
    }

    const staff = userRes.rows[0];
    const newTempPassword = `StaffReset${crypto.randomInt(1000, 9999)}!`;
    const passwordHash = await hashPassword(newTempPassword);

    await pool.query(
      `UPDATE users
       SET password_hash = $1, must_change_password = TRUE, failed_attempts = 0, locked_until = NULL, updated_at = NOW()
       WHERE id = $2`,
      [passwordHash, id]
    );

    // Send email with new credentials
    try {
      const emailProvider = getEmailProvider();
      await emailProvider.sendStaffWelcomeEmail(staff.email, staff.full_name, staff.role, newTempPassword);
    } catch (mailErr) {
      console.warn('[StaffController] Password reset mail notification warning:', mailErr);
    }

    const actorCheck = req.user?.userId ? await pool.query('SELECT id FROM users WHERE id = $1', [req.user.userId]) : { rows: [] };
    const actorId = actorCheck.rows.length > 0 ? req.user?.userId : null;

    await pool.query(
      `INSERT INTO audit_logs (user_id, action, target_type, target_id, details_json)
       VALUES ($1, 'STAFF_PASSWORD_RESET', 'USER', $2, $3)`,
      [actorId, id, JSON.stringify({ email: staff.email })]
    );

    res.status(200).json({
      message: 'Temporary password generated and account flagged for password change.',
      temporary_password: newTempPassword,
    });
  } catch (err: any) {
    console.error('[StaffController] resetStaffPassword error:', err);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to reset staff password' });
  }
}
