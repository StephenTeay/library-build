import { pool } from '../../db/pool.js';
import { hashPassword } from '../auth/password.js';
import { generateOpaqueToken, hashOpaqueToken } from '../auth/tokens.js';
import { getEmailProvider } from '../../providers/email/emailProvider.js';
import { TokenUserPayload } from '../auth/tokens.js';

export interface RegistrationInput {
  matric_no: string;
  email: string;
  password: string;
  full_name: string;
  department_id: number;
  programme: 'ND' | 'HND';
  level: number;
  entry_session: string;
}

export async function registerStudent(input: RegistrationInput) {
  const matric = input.matric_no.trim().toUpperCase();
  const email = input.email.trim().toLowerCase();
  const fullName = input.full_name.trim();

  // 1. Check if user already exists
  const existing = await pool.query(
    'SELECT id, status FROM users WHERE matric_no = $1 OR email = $2',
    [matric, email]
  );

  if (existing.rows.length > 0) {
    const status = existing.rows[0].status;
    if (status === 'ACTIVE') {
      const error = new Error('An account with this matriculation number or email already exists. Please log in or reset your password.');
      (error as any).statusCode = 409;
      throw error;
    } else {
      const error = new Error('A registration is already pending for this matriculation number or email. Please verify your email or await staff approval.');
      (error as any).statusCode = 409;
      throw error;
    }
  }

  // 2. Check Admissions Master List for matching
  const matchRes = await pool.query(
    'SELECT id FROM admissions_master_list WHERE matric_no = $1 AND department_id = $2',
    [matric, input.department_id]
  );
  const matchedVerified = matchRes.rows.length > 0;

  // 3. Hash password with Argon2id
  const passwordHash = await hashPassword(input.password);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 4. Create pending user record
    const userRes = await client.query(
      `INSERT INTO users (
        matric_no, email, password_hash, full_name,
        department_id, programme, level, entry_session,
        role, status, must_change_password, matched_verified
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'STUDENT', 'PENDING', FALSE, $9)
      RETURNING id, matric_no, email, full_name, matched_verified;`,
      [matric, email, passwordHash, fullName, input.department_id, input.programme, input.level, input.entry_session, matchedVerified]
    );

    const newUser = userRes.rows[0];

    // 5. Generate email verification token (using password_reset_tokens table with token type)
    const { token, hash } = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await client.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3);`,
      [newUser.id, hash, expiresAt]
    );

    await client.query('COMMIT');

    // 6. Send verification email
    const emailProvider = getEmailProvider();
    await emailProvider.sendVerificationEmail(email, fullName, token);

    return {
      userId: newUser.id,
      matricNo: newUser.matric_no,
      email: newUser.email,
      matchedVerified: newUser.matched_verified,
      message: 'Registration submitted successfully. Please check your email to verify your address.',
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function verifyEmailToken(token: string): Promise<boolean> {
  const tokenHash = hashOpaqueToken(token.trim());

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tokenRes = await client.query(
      `SELECT id, user_id FROM password_reset_tokens
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
      [tokenHash]
    );

    if (tokenRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return false;
    }

    const { id: tokenId, user_id: userId } = tokenRes.rows[0];

    await client.query('UPDATE users SET email_verified_at = NOW() WHERE id = $1', [userId]);
    await client.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1', [tokenId]);

    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getPendingApprovalQueue(
  actor: TokenUserPayload,
  filterDeptId?: number,
  filterLevel?: number,
  matchedOnly?: boolean,
  verifiedOnly?: boolean
) {
  let queryText = `
    SELECT u.id, u.matric_no, u.email, u.full_name, u.department_id,
           d.name as department_name, d.code as department_code,
           u.programme, u.level, u.entry_session, u.matched_verified,
           u.email_verified_at, u.created_at
    FROM users u
    JOIN departments d ON u.department_id = d.id
    WHERE u.status = 'PENDING'
  `;
  const params: any[] = [];

  if (verifiedOnly) {
    queryText += ' AND u.email_verified_at IS NOT NULL';
  }

  // Role Scope Enforcements
  if (actor.role === 'HOD') {
    params.push(actor.departmentId);
    queryText += ` AND u.department_id = $${params.length}`;
  } else if (actor.role === 'LEVEL_COORDINATOR') {
    params.push(actor.departmentId);
    queryText += ` AND u.department_id = $${params.length}`;
    params.push(actor.level);
    queryText += ` AND u.level = $${params.length}`;
  } else if (actor.role === 'REGISTRAR' || actor.role === 'LIBRARIAN') {
    if (filterDeptId) {
      params.push(filterDeptId);
      queryText += ` AND u.department_id = $${params.length}`;
    }
  }

  if (filterLevel && actor.role !== 'LEVEL_COORDINATOR') {
    params.push(filterLevel);
    queryText += ` AND u.level = $${params.length}`;
  }

  if (matchedOnly) {
    queryText += ' AND u.matched_verified = TRUE';
  }

  queryText += ' ORDER BY u.matched_verified DESC, u.created_at ASC';

  const res = await pool.query(queryText, params);
  return res.rows;
}

export async function batchApproveStudents(
  actor: TokenUserPayload,
  userIds: string[],
  ip: string,
  action: 'APPROVE' | 'REJECT' = 'APPROVE'
): Promise<{ approvedCount: number; errors: string[] }> {
  if (!userIds || userIds.length === 0) {
    return { approvedCount: 0, errors: [] };
  }

  const client = await pool.connect();
  const emailProvider = getEmailProvider();
  let approvedCount = 0;
  const errors: string[] = [];

  try {
    for (const id of userIds) {
      // 1. Fetch user to verify scope
      const userRes = await client.query(
        'SELECT id, email, full_name, department_id, level, programme, entry_session, status FROM users WHERE id = $1',
        [id]
      );

      if (userRes.rows.length === 0) {
        errors.push(`User ${id} not found.`);
        continue;
      }

      const u = userRes.rows[0];

      // Enforce Scope
      if (actor.role === 'HOD' && u.department_id !== actor.departmentId) {
        errors.push(`Scope violation: User ${id} is not in your department.`);
        continue;
      }

      if (actor.role === 'LEVEL_COORDINATOR' && (u.department_id !== actor.departmentId || u.level !== actor.level)) {
        errors.push(`Scope violation: User ${id} is outside your assigned department and level.`);
        continue;
      }

      await client.query('BEGIN');

      if (action === 'REJECT') {
        // 2. Reject: update status to SUSPENDED
        await client.query("UPDATE users SET status = 'SUSPENDED', updated_at = NOW() WHERE id = $1", [id]);

        // Log rejection in audit_logs
        await client.query(
          `INSERT INTO audit_logs (user_id, action, target_type, target_id, ip_address, details_json)
           VALUES ($1, 'STUDENT_REJECTED', 'USER', $2, $3, $4);`,
          [actor.userId, String(id), ip, JSON.stringify({ rejected_by_role: actor.role })]
        );

        await client.query('COMMIT');
        approvedCount++;
        continue;
      }

      // 2. Update status to ACTIVE and ensure email is marked verified
      await client.query("UPDATE users SET status = 'ACTIVE', email_verified_at = COALESCE(email_verified_at, NOW()), updated_at = NOW() WHERE id = $1", [id]);

      // 3. Auto-enroll in matching courses
      await client.query(
        `INSERT INTO enrollments (student_id, course_id, session, status)
         SELECT $1, id, $2, 'ENROLLED'
         FROM courses
         WHERE department_id = $3 AND programme = $4 AND level = $5
         ON CONFLICT DO NOTHING;`,
        [id, u.entry_session, u.department_id, u.programme, u.level]
      );

      // 4. Log in audit_logs
      await client.query(
        `INSERT INTO audit_logs (user_id, action, target_type, target_id, ip_address, details_json)
         VALUES ($1, 'STUDENT_APPROVED', 'USER', $2, $3, $4);`,
        [actor.userId, String(id), ip, JSON.stringify({ approved_by_role: actor.role })]
      );

      await client.query('COMMIT');
      approvedCount++;

      // Dispatch approval email
      await emailProvider.sendApprovalNotice(u.email, u.full_name);
    }

    return { approvedCount, errors };
  } finally {
    client.release();
  }
}

