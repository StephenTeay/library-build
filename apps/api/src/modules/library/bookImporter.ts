import csv from 'csv-parser';
import { Readable } from 'stream';
import { pool } from '../../db/pool.js';

export interface BookCsvRow {
  title: string;
  author: string;
  isbn?: string;
  call_number: string;
  shelf_location: string;
  copies_total?: string | number;
  copies_available?: string | number;
  department_code?: string;
  department?: string;
}

export interface BookImportError {
  row: number;
  title?: string;
  call_number?: string;
  reason: string;
}

export interface BookImportSummary {
  totalRows: number;
  successfulRows: number;
  failedRows: number;
  replacedExisting: boolean;
  errors: BookImportError[];
}

export async function processBookCsvStream(
  inputStream: Readable,
  uploadedByUserId: string,
  mode: 'replace' | 'append' = 'append'
): Promise<BookImportSummary> {
  const client = await pool.connect();

  try {
    // 1. Cache department codes for fast resolution
    const deptRes = await client.query('SELECT id, code, name FROM departments');
    const deptMap = new Map<string, number>();
    for (const d of deptRes.rows) {
      deptMap.set(d.code.toUpperCase().trim(), d.id);
      deptMap.set(d.name.toUpperCase().trim(), d.id);
    }

    await client.query('BEGIN');

    // 2. If mode is 'replace', clear existing catalog items
    let replacedExisting = false;
    if (mode === 'replace') {
      await client.query('DELETE FROM library_items');
      replacedExisting = true;
    }

    let rowIndex = 0;
    let totalRows = 0;
    let successfulRows = 0;
    let failedRows = 0;
    const errors: BookImportError[] = [];

    const CHUNK_SIZE = 100;
    let currentChunk: Array<{
      title: string;
      author: string;
      isbn: string | null;
      call_number: string;
      shelf_location: string;
      copies_total: number;
      copies_available: number;
      department_id: number | null;
    }> = [];

    const flushChunk = async () => {
      if (currentChunk.length === 0) return;

      const values: any[] = [];
      const rowPlaceholders: string[] = [];

      currentChunk.forEach((item, idx) => {
        const offset = idx * 8;
        rowPlaceholders.push(
          `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`
        );
        values.push(
          item.title,
          item.author,
          item.isbn,
          item.call_number,
          item.shelf_location,
          item.copies_total,
          item.copies_available,
          item.department_id
        );
      });

      const insertSql = `
        INSERT INTO library_items (
          title,
          author,
          isbn,
          call_number,
          shelf_location,
          copies_total,
          copies_available,
          department_id
        ) VALUES ${rowPlaceholders.join(', ')}
      `;

      await client.query(insertSql, values);
      successfulRows += currentChunk.length;
      currentChunk = [];
    };

    // 3. Process CSV Stream
    const parser = inputStream.pipe(csv({
      mapHeaders: ({ header }) => header.trim().toLowerCase().replace(/[\s-]+/g, '_'),
    }));

    for await (const rawRow of parser) {
      rowIndex++;
      totalRows++;

      const title = (rawRow.title || '').trim();
      const author = (rawRow.author || '').trim();
      const callNumber = (rawRow.call_number || rawRow.callnumber || '').trim();
      const shelfLocation = (rawRow.shelf_location || rawRow.shelflocation || rawRow.shelf || '').trim();
      const isbn = (rawRow.isbn || '').trim() || null;

      // Validation
      if (!title) {
        failedRows++;
        errors.push({ row: rowIndex, call_number: callNumber, reason: 'Missing required book title' });
        continue;
      }

      if (!author) {
        failedRows++;
        errors.push({ row: rowIndex, title, reason: 'Missing required author' });
        continue;
      }

      if (!callNumber) {
        failedRows++;
        errors.push({ row: rowIndex, title, reason: 'Missing required call number' });
        continue;
      }

      if (!shelfLocation) {
        failedRows++;
        errors.push({ row: rowIndex, title, reason: 'Missing required shelf location' });
        continue;
      }

      // Copies calculation
      const parsedTotal = parseInt(String(rawRow.copies_total || rawRow.total_copies || '1'), 10);
      const copiesTotal = Number.isNaN(parsedTotal) || parsedTotal < 1 ? 1 : parsedTotal;

      const parsedAvailable = parseInt(String(rawRow.copies_available || rawRow.available_copies || copiesTotal), 10);
      const copiesAvailable = Number.isNaN(parsedAvailable) || parsedAvailable < 0
        ? copiesTotal
        : Math.min(parsedAvailable, copiesTotal);

      // Department resolution
      let departmentId: number | null = null;
      const deptKey = (rawRow.department_code || rawRow.department || '').toUpperCase().trim();
      if (deptKey && deptMap.has(deptKey)) {
        departmentId = deptMap.get(deptKey)!;
      }

      currentChunk.push({
        title,
        author,
        isbn,
        call_number: callNumber,
        shelf_location: shelfLocation,
        copies_total: copiesTotal,
        copies_available: copiesAvailable,
        department_id: departmentId,
      });

      if (currentChunk.length >= CHUNK_SIZE) {
        await flushChunk();
      }
    }

    // Flush any remaining rows
    await flushChunk();

    // Audit log
    const actorCheck = uploadedByUserId ? await client.query('SELECT id FROM users WHERE id = $1', [uploadedByUserId]) : { rows: [] };
    const actorId = actorCheck.rows.length > 0 ? uploadedByUserId : null;

    await client.query(
      `INSERT INTO audit_logs (user_id, action, target_type, target_id, details_json)
       VALUES ($1, 'BULK_BOOKS_IMPORTED', 'LIBRARY_ITEMS', 'BATCH', $2)`,
      [
        actorId,
        JSON.stringify({
          mode,
          total_rows: totalRows,
          successful_rows: successfulRows,
          failed_rows: failedRows,
        }),
      ]
    );

    await client.query('COMMIT');

    return {
      totalRows,
      successfulRows,
      failedRows,
      replacedExisting,
      errors: errors.slice(0, 200), // Bound error list to prevent huge JSON response
    };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[BookImporter] Process error:', err);
    throw err;
  } finally {
    client.release();
  }
}
