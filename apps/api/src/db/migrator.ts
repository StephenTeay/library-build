import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool, query } from './pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, '../../../../db/migrations');

export async function runMigrations(direction: 'up' | 'down' = 'up'): Promise<void> {
  const client = await pool.connect();
  try {
    console.log(`[Migrator] Executing migrations: ${direction.toUpperCase()}`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(100) PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    const files = fs.readdirSync(migrationsDir).sort();

    if (direction === 'up') {
      const upFiles = files.filter(f => f.endsWith('.sql') && !f.endsWith('_down.sql'));
      const { rows: applied } = await client.query('SELECT version FROM schema_migrations');
      const appliedSet = new Set(applied.map(r => r.version));

      for (const file of upFiles) {
        if (!appliedSet.has(file)) {
          console.log(`[Migrator] Applying ${file}...`);
          const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
          await client.query('BEGIN');
          try {
            await client.query(sql);
            await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
            await client.query('COMMIT');
            console.log(`[Migrator] Successfully applied ${file}`);
          } catch (err) {
            await client.query('ROLLBACK');
            console.error(`[Migrator] Failed applying ${file}:`, err);
            throw err;
          }
        }
      }
    } else {
      // DOWN
      const downFiles = files.filter(f => f.endsWith('_down.sql')).reverse();
      for (const downFile of downFiles) {
        const baseVersion = downFile.replace('_down.sql', '.sql');
        const { rows } = await client.query('SELECT version FROM schema_migrations WHERE version = $1', [baseVersion]);
        if (rows.length > 0) {
          console.log(`[Migrator] Reverting ${baseVersion} via ${downFile}...`);
          const sql = fs.readFileSync(path.join(migrationsDir, downFile), 'utf-8');
          await client.query('BEGIN');
          try {
            await client.query(sql);
            await client.query('DELETE FROM schema_migrations WHERE version = $1', [baseVersion]);
            await client.query('COMMIT');
            console.log(`[Migrator] Successfully reverted ${baseVersion}`);
          } catch (err) {
            await client.query('ROLLBACK');
            console.error(`[Migrator] Failed reverting ${downFile}:`, err);
            throw err;
          }
        }
      }
    }
  } finally {
    client.release();
  }
}

// CLI runner
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const direction = process.argv[2] === 'down' ? 'down' : 'up';
  runMigrations(direction)
    .then(async () => {
      console.log(`[Migrator] Finished ${direction} migration.`);
      await pool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('[Migrator] Migration fatal error:', err);
      await pool.end();
      process.exit(1);
    });
}

