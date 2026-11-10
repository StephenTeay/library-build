import dotenv from 'dotenv';
import { pool } from './pool.js';
import { hashPassword } from '../modules/auth/password.js';

dotenv.config();

export async function bootstrapRegistrar(): Promise<void> {
  const email = (process.env.BOOTSTRAP_REGISTRAR_EMAIL || 'registrar@fss-ibadan.edu.ng').toLowerCase().trim();
  const password = process.env.BOOTSTRAP_REGISTRAR_PASSWORD || 'ChangeMeRegistrar2026!';
  const fullName = process.env.BOOTSTRAP_REGISTRAR_NAME || 'Registrar FSS-IB';

  const client = await pool.connect();
  try {
    console.log(`[Bootstrap] Checking super admin account: ${email}`);

    const existing = await client.query('SELECT id, role, status FROM users WHERE email = $1', [email]);

    if (existing.rows.length === 0) {
      console.log('[Bootstrap] Creating initial bootstrap Registrar account...');
      const passwordHash = await hashPassword(password);

      const res = await client.query(
        `INSERT INTO users (
          email,
          password_hash,
          full_name,
          role,
          status,
          must_change_password,
          matched_verified,
          email_verified_at
        ) VALUES ($1, $2, $3, 'REGISTRAR', 'ACTIVE', TRUE, TRUE, NOW())
        RETURNING id, email, role, status;`,
        [email, passwordHash, fullName]
      );

      console.log('[Bootstrap] Successfully bootstrapped Registrar user:', res.rows[0]);
    } else {
      console.log(`[Bootstrap] Registrar user already exists with ID: ${existing.rows[0].id} (Role: ${existing.rows[0].role})`);
    }
  } finally {
    client.release();
  }
}

// CLI runner
if (process.argv[1]?.includes('bootstrap')) {
  bootstrapRegistrar()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('[Bootstrap] Failed to bootstrap Registrar:', err);
      await pool.end();
      process.exit(1);
    });
}

