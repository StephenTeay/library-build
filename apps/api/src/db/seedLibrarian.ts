import dotenv from 'dotenv';
dotenv.config();
import { pool } from './pool.js';
import { hashPassword } from '../modules/auth/password.js';

async function seedLibrarian() {
  const email = 'bimpe@fss.ng';
  const password = 'AdminLibrary';
  const fullName = 'Librarian Bimpe';

  const client = await pool.connect();
  try {
    console.log(`[SeedLibrarian] Seeding super admin account: ${email}`);
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
      ) VALUES ($1, $2, $3, 'LIBRARIAN', 'ACTIVE', FALSE, TRUE, NOW())
      ON CONFLICT (email) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        full_name = EXCLUDED.full_name,
        role = 'LIBRARIAN',
        status = 'ACTIVE',
        must_change_password = FALSE
      RETURNING id, email, full_name, role, status;`,
      [email, passwordHash, fullName]
    );

    console.log('[SeedLibrarian] Successfully seeded Librarian account:', res.rows[0]);
  } finally {
    client.release();
    await pool.end();
  }
}

seedLibrarian().catch((err) => {
  console.error('[SeedLibrarian] Error:', err);
  process.exit(1);
});
