import csv from 'csv-parser';
import { Readable } from 'stream';
import { pool } from '../../db/pool.js';
import { hashPassword } from '../auth/password.js';

export interface CsvRow {
  matric_no: string;
  email: string;
  full_name: string;
  department: string;
  programme: string;
  level: string;
  entry_session: string;
}

export interface ImportError {
  row: number;
  matric_no?: string;
  email?: string;
  reason: string;
}

export interface ImportSummary {
  jobId: string;
  totalRows: number;
  successfulRows: number;
  failedRows: number;
  skippedDuplicates: number;
  errors: ImportError[];
}

export async function processCsvStream(
  inputStream: Readable,
  uploadedByUserId: string,
  filename: string,
  restrictDeptId?: number | null
): Promise<ImportSummary> {
  const client = await pool.connect();
  let jobId = '';

  try {
    // 1. Create import_jobs record
    const jobRes = await client.query(
      `INSERT INTO import_jobs (uploaded_by, filename, status)
       VALUES ($1, $2, 'PROCESSING')
       RETURNING id;`,
      [uploadedByUserId, filename]
    );
    jobId = jobRes.rows[0].id;

    // 2. Cache departments lookup
    const deptRes = await client.query('SELECT id, code, name FROM departments');
    const deptMap = new Map<string, number>();
    for (const d of deptRes.rows) {
      deptMap.set(d.code.toUpperCase().trim(), d.id);
      deptMap.set(d.name.toUpperCase().trim(), d.id);
    }

    let rowIndex = 0;
    let totalRows = 0;
    let successfulRows = 0;
    let skippedDuplicates = 0;
    const errors: ImportError[] = [];

    let currentBatch: { row: number; data: CsvRow; deptId: number }[] = [];

    // 3. Process batches of 100 rows
    const processBatch = async (batch: { row: number; data: CsvRow; deptId: number }[]) => {
      if (batch.length === 0) return;

      const matrics = batch.map(b => b.data.matric_no.trim().toUpperCase());
      const emails = batch.map(b => b.data.email.trim().toLowerCase());

      // Find existing duplicates in DB
      const existingRes = await client.query(
        'SELECT matric_no, email FROM users WHERE matric_no = ANY($1) OR email = ANY($2)',
        [matrics, emails]
      );
      const existingMatrics = new Set(existingRes.rows.map(r => r.matric_no?.toUpperCase()));
      const existingEmails = new Set(existingRes.rows.map(r => r.email?.toLowerCase()));

      for (const item of batch) {
        const matric = item.data.matric_no.trim().toUpperCase();
        const email = item.data.email.trim().toLowerCase();
        const fullName = item.data.full_name.trim();
        const prog = item.data.programme.trim().toUpperCase();
        const lvl = parseInt(item.data.level.trim(), 10);
        const session = item.data.entry_session.trim();

        if (existingMatrics.has(matric) || existingEmails.has(email)) {
          skippedDuplicates++;
          errors.push({
            row: item.row,
            matric_no: matric,
            email: email,
            reason: 'SKIPPED_DUPLICATE: Account with this matric number or email already exists.',
          });
          continue;
        }

        try {
          // Default initial password = sanitized matric number
          const passwordHash = await hashPassword(matric);

          await client.query('BEGIN');

          const userRes = await client.query(
            `INSERT INTO users (
              matric_no, email, password_hash, full_name,
              department_id, programme, level, entry_session,
              role, status, must_change_password, matched_verified, email_verified_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'STUDENT', 'ACTIVE', TRUE, TRUE, NOW())
            RETURNING id;`,
            [matric, email, passwordHash, fullName, item.deptId, prog, lvl, session]
          );

          const newStudentId = userRes.rows[0].id;

          // Auto-enroll in matching courses for this dept, prog, level
          await client.query(
            `INSERT INTO enrollments (student_id, course_id, session, status)
             SELECT $1, id, $2, 'ENROLLED'
             FROM courses
             WHERE department_id = $3 AND programme = $4 AND level = $5
             ON CONFLICT DO NOTHING;`,
            [newStudentId, session, item.deptId, prog, lvl]
          );

          await client.query('COMMIT');
          successfulRows++;

          // Mark in set so later rows in the same batch don't duplicate
          existingMatrics.add(matric);
          existingEmails.add(email);
        } catch (err: any) {
          await client.query('ROLLBACK');
          errors.push({
            row: item.row,
            matric_no: matric,
            email: email,
            reason: `INSERT_FAILED: ${err.message || 'Database error'}`,
          });
        }
      }
    };

    // 4. Stream parser with BOM stripping and true backpressure using for-await
    const parser = inputStream.pipe(
      csv({
        mapHeaders: ({ header }) => header.replace(/^\uFEFF/, '').trim(),
      })
    );

    for await (const rawRow of parser) {
      rowIndex++;
      totalRows++;

      const row: CsvRow = {
        matric_no: String(rawRow.matric_no || rawRow.matric || '').trim(),
        email: String(rawRow.email || '').trim(),
        full_name: String(rawRow.full_name || rawRow.name || '').trim(),
        department: String(rawRow.department || rawRow.dept || '').trim(),
        programme: String(rawRow.programme || rawRow.prog || '').trim().toUpperCase(),
        level: String(rawRow.level || '').trim(),
        entry_session: String(rawRow.entry_session || rawRow.session || '').trim(),
      };

      // Validation
      if (!row.matric_no || !row.email || !row.full_name || !row.department || !row.programme || !row.level) {
        errors.push({
          row: rowIndex,
          matric_no: row.matric_no,
          email: row.email,
          reason: 'VALIDATION_FAILED: Missing one or more required fields.',
        });
        continue;
      }

      if (!['ND', 'HND'].includes(row.programme)) {
        errors.push({
          row: rowIndex,
          matric_no: row.matric_no,
          email: row.email,
          reason: `VALIDATION_FAILED: Invalid programme '${row.programme}'. Must be ND or HND.`,
        });
        continue;
      }

      const lvl = parseInt(row.level, 10);
      if (![1, 2].includes(lvl)) {
        errors.push({
          row: rowIndex,
          matric_no: row.matric_no,
          email: row.email,
          reason: `VALIDATION_FAILED: Invalid level '${row.level}'. Must be 1 or 2.`,
        });
        continue;
      }

      const deptId = deptMap.get(row.department.toUpperCase().trim());
      if (!deptId) {
        errors.push({
          row: rowIndex,
          matric_no: row.matric_no,
          email: row.email,
          reason: `VALIDATION_FAILED: Unrecognized academic department '${row.department}'.`,
        });
        continue;
      }

      if (restrictDeptId && restrictDeptId !== deptId) {
        errors.push({
          row: rowIndex,
          matric_no: row.matric_no,
          email: row.email,
          reason: `SCOPE_VIOLATION: Row belongs to department ${row.department}, outside caller's authorized department scope.`,
        });
        continue;
      }

      currentBatch.push({ row: rowIndex, data: row, deptId });

      if (currentBatch.length >= 100) {
        const toProcess = [...currentBatch];
        currentBatch = [];
        await processBatch(toProcess);
      }
    }

    if (currentBatch.length > 0) {
      await processBatch(currentBatch);
    }

    const failedRows = errors.length;

    // 5. Update import_jobs
    await client.query(
      `UPDATE import_jobs
       SET total_rows = $1, successful_rows = $2, failed_rows = $3,
           error_log_json = $4, status = 'COMPLETED', completed_at = NOW()
       WHERE id = $5;`,
      [totalRows, successfulRows, failedRows, JSON.stringify(errors), jobId]
    );

    return {
      jobId,
      totalRows,
      successfulRows,
      failedRows,
      skippedDuplicates,
      errors,
    };
  } finally {
    client.release();
  }
}
