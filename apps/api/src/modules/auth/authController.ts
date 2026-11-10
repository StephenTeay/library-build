import { Request, Response } from 'express';
import { pool } from '../../db/pool.js';
import { hashPassword, verifyPassword } from './password.js';
import {
  generateAccessToken,
  generateOpaqueToken,
  hashOpaqueToken,
  setAuthCookies,
  clearAuthCookies,
  REFRESH_TOKEN_EXPIRY_DAYS,
} from './tokens.js';
import { getEmailProvider } from '../../providers/email/emailProvider.js';

export async function login(req: Request, res: Response): Promise<void> {
  const { identifier, password } = req.body || {};

  if (!identifier || !password) {
    res.status(400).json({ error: 'Bad Request', message: 'Identifier (email or matric number) and password are required.' });
    return;
  }

  const cleanIdent = String(identifier).trim();
  const lowerEmail = cleanIdent.toLowerCase();
  const upperMatric = cleanIdent.toUpperCase();
  const ip = req.ip || req.socket.remoteAddress || 'unknown';

  const userRes = await pool.query(
    `SELECT id, matric_no, email, password_hash, full_name, department_id,
            programme, level, role, status, must_change_password,
            failed_attempts, locked_until
     FROM users
     WHERE email = $1 OR matric_no = $2`,
    [lowerEmail, upperMatric]
  );

  if (userRes.rows.length === 0) {
    res.status(401).json({ error: 'Unauthorized', message: 'Invalid matric/email or password.' });
    return;
  }

  const user = userRes.rows[0];

  // 1. Check account lockout status
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const minutesLeft = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / (60 * 1000));
    res.status(429).json({
      error: 'Account Locked',
      message: `Account is temporarily locked due to 5 consecutive failed attempts. Please retry in ${minutesLeft} minute(s).`,
      retryAfter: minutesLeft * 60,
    });
    return;
  }

  // 2. Check account lifecycle status
  if (user.status === 'PENDING') {
    res.status(403).json({
      error: 'Account Pending',
      message: 'Your registration is pending departmental verification and approval.',
    });
    return;
  }

  if (user.status === 'SUSPENDED') {
    res.status(403).json({
      error: 'Account Suspended',
      message: 'Your account has been suspended by the academic institution. Please contact the registrar.',
    });
    return;
  }

  // 3. Verify password via Argon2id
  const isMatch = await verifyPassword(String(password), user.password_hash);

  if (!isMatch) {
    const newFailedCount = user.failed_attempts + 1;
    let lockQuery = 'UPDATE users SET failed_attempts = $1 WHERE id = $2';
    const params: any[] = [newFailedCount, user.id];

    if (newFailedCount >= 5) {
      lockQuery = "UPDATE users SET failed_attempts = $1, locked_until = NOW() + INTERVAL '15 minutes' WHERE id = $2";
    }

    await pool.query(lockQuery, params);
    try {
      await pool.query(
        `INSERT INTO audit_logs (user_id, action, target_type, target_id, ip_address, details_json)
         VALUES ($1, 'LOGIN_FAILED', 'USER', $2, $3, $4)`,
        [user.id, String(user.id), ip, JSON.stringify({ failed_count: newFailedCount })]
      );
    } catch (e) {
      console.error('[AuditLog] Error logging failed login:', e);
    }

    res.status(401).json({
      error: 'Unauthorized',
      message: newFailedCount >= 5
        ? 'Account has been locked for 15 minutes due to 5 failed attempts.'
        : `Invalid matric/email or password. ${5 - newFailedCount} attempt(s) remaining.`,
    });
    return;
  }

  // 4. Successful login: reset failed attempts
  await pool.query('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = $1', [user.id]);

  // 5. Generate dual tokens (access JWT + rotating refresh token)
  const tokenPayload = {
    userId: user.id,
    email: user.email,
    matricNo: user.matric_no,
    role: user.role,
    departmentId: user.department_id,
    programme: user.programme,
    level: user.level,
    mustChangePassword: user.must_change_password,
  };

  const accessToken = generateAccessToken(tokenPayload);
  const { token: refreshToken, hash: refreshHash } = generateOpaqueToken();

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, user_agent, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [user.id, refreshHash, req.headers['user-agent'] || 'unknown', ip, expiresAt]
  );

  setAuthCookies(res, accessToken, refreshToken);

  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, target_type, target_id, ip_address, details_json)
       VALUES ($1, 'LOGIN_SUCCESS', 'USER', $2, $3, '{}'::jsonb)`,
      [user.id, String(user.id), ip]
    );
  } catch (e) {
    console.error('[AuditLog] Error logging login success:', e);
  }

  res.status(200).json({
    message: 'Login successful',
    user: {
      id: user.id,
      email: user.email,
      matricNo: user.matric_no,
      fullName: user.full_name,
      role: user.role,
      departmentId: user.department_id,
      programme: user.programme,
      level: user.level,
      mustChangePassword: user.must_change_password,
    },
  });
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const incomingRefreshToken = req.cookies?.refreshToken;

  if (!incomingRefreshToken) {
    res.status(401).json({ error: 'Unauthorized', message: 'Refresh token cookie missing' });
    return;
  }

  const tokenHash = hashOpaqueToken(incomingRefreshToken);
  const ip = req.ip || req.socket.remoteAddress || 'unknown';

  const tokenRes = await pool.query(
    `SELECT rt.id, rt.user_id, u.email, u.matric_no, u.role, u.department_id,
            u.programme, u.level, u.must_change_password, u.status
     FROM refresh_tokens rt
     JOIN users u ON rt.user_id = u.id
     WHERE rt.token_hash = $1
       AND rt.revoked_at IS NULL
       AND rt.expires_at > NOW()`,
    [tokenHash]
  );

  if (tokenRes.rows.length === 0) {
    clearAuthCookies(res);
    res.status(401).json({ error: 'Unauthorized', message: 'Invalid, revoked or expired refresh token' });
    return;
  }

  const row = tokenRes.rows[0];

  if (row.status !== 'ACTIVE') {
    clearAuthCookies(res);
    res.status(403).json({ error: 'Forbidden', message: 'Account is no longer active' });
    return;
  }

  // Token rotation: revoke old token
  await pool.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1', [row.id]);

  // Create new refresh token and access token
  const { token: newRefreshToken, hash: newRefreshHash } = generateOpaqueToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, user_agent, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [row.user_id, newRefreshHash, req.headers['user-agent'] || 'unknown', ip, expiresAt]
  );

  const accessToken = generateAccessToken({
    userId: row.user_id,
    email: row.email,
    matricNo: row.matric_no,
    role: row.role,
    departmentId: row.department_id,
    programme: row.programme,
    level: row.level,
    mustChangePassword: row.must_change_password,
  });

  setAuthCookies(res, accessToken, newRefreshToken);

  res.status(200).json({ success: true, message: 'Tokens refreshed' });
}

export async function logout(req: Request, res: Response): Promise<void> {
  const incomingRefreshToken = req.cookies?.refreshToken;
  if (incomingRefreshToken) {
    const tokenHash = hashOpaqueToken(incomingRefreshToken);
    await pool.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1', [tokenHash]);
  }

  clearAuthCookies(res);
  res.status(200).json({ success: true, message: 'Logged out successfully' });
}

export async function changePassword(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { current_password, new_password } = req.body || {};

  if (!current_password || !new_password) {
    res.status(400).json({ error: 'Bad Request', message: 'Both current_password and new_password are required.' });
    return;
  }

  if (String(new_password).length < 8) {
    res.status(400).json({ error: 'Bad Request', message: 'New password must be at least 8 characters long.' });
    return;
  }

  const userRes = await pool.query('SELECT password_hash, matric_no FROM users WHERE id = $1', [req.user.userId]);
  if (userRes.rows.length === 0) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const { password_hash, matric_no } = userRes.rows[0];

  const isCurrentValid = await verifyPassword(String(current_password), password_hash);
  if (!isCurrentValid) {
    res.status(401).json({ error: 'Unauthorized', message: 'Current password is incorrect.' });
    return;
  }

  // Prevent setting password to matric number
  if (matric_no && String(new_password).trim().toUpperCase() === String(matric_no).trim().toUpperCase()) {
    res.status(400).json({
      error: 'Insecure Password',
      message: 'New password cannot match your matriculation number.',
    });
    return;
  }

  const newHash = await hashPassword(String(new_password));

  await pool.query(
    'UPDATE users SET password_hash = $1, must_change_password = FALSE, updated_at = NOW() WHERE id = $2',
    [newHash, req.user.userId]
  );

  // Revoke all active sessions
  await pool.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1', [req.user.userId]);

  // Issue new active session tokens
  const tokenPayload = {
    ...req.user,
    mustChangePassword: false,
  };
  const newAccessToken = generateAccessToken(tokenPayload);
  const { token: newRefreshToken, hash: newRefreshHash } = generateOpaqueToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, user_agent, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [req.user.userId, newRefreshHash, req.headers['user-agent'] || 'unknown', req.ip || 'unknown', expiresAt]
  );

  setAuthCookies(res, newAccessToken, newRefreshToken);

  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, target_type, target_id, ip_address, details_json)
       VALUES ($1, 'PASSWORD_CHANGED', 'USER', $2, $3, '{}'::jsonb)`,
      [req.user.userId, String(req.user.userId), req.ip || 'unknown']
    );
  } catch (e) {
    console.error('[AuditLog] Error logging password change:', e);
  }

  res.status(200).json({ success: true, message: 'Password updated successfully. Forced change flag cleared.' });
}

export async function requestPasswordReset(req: Request, res: Response): Promise<void> {
  const { email } = req.body || {};
  if (!email) {
    res.status(400).json({ error: 'Bad Request', message: 'Email address is required' });
    return;
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const userRes = await pool.query('SELECT id, full_name, email FROM users WHERE email = $1', [cleanEmail]);

  if (userRes.rows.length > 0) {
    const user = userRes.rows[0];
    const { token, hash } = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, hash, expiresAt]
    );

    const emailProvider = getEmailProvider();
    await emailProvider.sendPasswordResetEmail(user.email, user.full_name, token);
  }

  // Always return success to protect against account enumeration
  res.status(200).json({
    success: true,
    message: 'If an account exists with that email address, a password reset link has been dispatched.',
  });
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  const { token, new_password } = req.body || {};

  if (!token || !new_password) {
    res.status(400).json({ error: 'Bad Request', message: 'Both token and new_password are required' });
    return;
  }

  if (String(new_password).length < 8) {
    res.status(400).json({ error: 'Bad Request', message: 'New password must be at least 8 characters long.' });
    return;
  }

  const tokenHash = hashOpaqueToken(String(token));

  const resetRes = await pool.query(
    `SELECT id, user_id FROM password_reset_tokens
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
    [tokenHash]
  );

  if (resetRes.rows.length === 0) {
    res.status(400).json({ error: 'Invalid Token', message: 'Reset token is invalid or has expired.' });
    return;
  }

  const resetRecord = resetRes.rows[0];
  const newHash = await hashPassword(String(new_password));

  await pool.query('BEGIN');
  try {
    await pool.query(
      'UPDATE users SET password_hash = $1, must_change_password = FALSE, updated_at = NOW() WHERE id = $2',
      [newHash, resetRecord.user_id]
    );
    await pool.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1', [resetRecord.id]);
    await pool.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1', [resetRecord.user_id]);
    await pool.query('COMMIT');

    res.status(200).json({ success: true, message: 'Password reset successfully. You may now log in.' });
  } catch (err) {
    await pool.query('ROLLBACK');
    res.status(500).json({ error: 'Internal Error', message: 'Failed to reset password.' });
  }
}

export async function getMe(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const userRes = await pool.query(
    `SELECT u.id, u.matric_no, u.email, u.full_name, u.role, u.status,
            u.department_id, d.name as department_name, d.code as department_code,
            u.programme, u.level, u.must_change_password
     FROM users u
     LEFT JOIN departments d ON u.department_id = d.id
     WHERE u.id = $1`,
    [req.user.userId]
  );

  if (userRes.rows.length === 0) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.status(200).json({ user: userRes.rows[0] });
}
