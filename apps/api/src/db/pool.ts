import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/fss_elibrary?sslmode=disable';

export const pool = new Pool({
  connectionString,
  max: 5, // keep within Neon / Render connection limits
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export async function query<T = any>(text: string, params?: any[]): Promise<{ rows: T[]; rowCount: number }> {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.DEBUG_SQL === 'true') {
    console.log('[SQL]', { text, duration, rows: res.rowCount });
  }
  return { rows: res.rows, rowCount: res.rowCount || 0 };
}

