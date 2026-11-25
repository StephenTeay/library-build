import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../src/index.js';
import { pool } from '../src/db/pool.js';
import { generateAccessToken } from '../src/modules/auth/tokens.js';

describe('Phase 3: Circulation & Lending Desk Tests', () => {
  let librarianToken: string;
  let studentToken: string;
  let studentId: string;
  let studentMatric: string;
  let testBookId: number;

  beforeAll(async () => {
    // 1. Cleanup old circulation test records
    await pool.query(`
      DELETE FROM circulation_loans WHERE notes LIKE 'CIRC_TEST%';
      DELETE FROM library_items WHERE title LIKE 'Circulation Test Book%';
      DELETE FROM users WHERE email LIKE 'circ.%';
    `);

    // 2. Create Librarian User
    const libRes = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, role, status)
       VALUES ('circ.librarian@fss.ng', 'hash', 'Chief Librarian', 'LIBRARIAN', 'ACTIVE')
       RETURNING id;`
    );
    const libId = libRes.rows[0].id;
    librarianToken = generateAccessToken({
      userId: libId,
      email: 'circ.librarian@fss.ng',
      matricNo: null,
      role: 'LIBRARIAN',
      departmentId: null,
    });

    // 3. Create Student User
    studentMatric = 'CIRC/ND/099';
    const studRes = await pool.query(
      `INSERT INTO users (email, matric_no, password_hash, full_name, role, level, programme, status)
       VALUES ('circ.student@fss.ng', $1, 'hash', 'Circulation Student', 'STUDENT', 1, 'ND', 'ACTIVE')
       RETURNING id;`,
      [studentMatric]
    );
    studentId = studRes.rows[0].id;
    studentToken = generateAccessToken({
      userId: studentId,
      email: 'circ.student@fss.ng',
      matricNo: studentMatric,
      role: 'STUDENT',
      departmentId: null,
    });

    // 4. Create Test Book with 1 copy available
    const bookRes = await pool.query(
      `INSERT INTO library_items (
         title, author, call_number, shelf_location, copies_total, copies_available
       ) VALUES (
         'Circulation Test Book: Advanced Probability',
         'Prof. Test Author',
         'QA273 .C57 2026',
         'Shelf C-99',
         1,
         1
       ) RETURNING id;`
    );
    testBookId = bookRes.rows[0].id;
  });

  it('1. Librarian checks out book to student by matric number', async () => {
    const res = await request(app)
      .post('/api/circulation/checkout')
      .set('Cookie', [`accessToken=${librarianToken}`])
      .send({
        item_id: testBookId,
        student_matric_or_email: studentMatric,
        duration_days: 14,
        notes: 'CIRC_TEST_1',
      });

    expect(res.status).toBe(201);
    expect(res.body.loan).toBeDefined();
    expect(res.body.loan.status).toBe('ACTIVE');

    // Verify copies_available decremented to 0
    const checkItem = await pool.query('SELECT copies_available FROM library_items WHERE id = $1', [testBookId]);
    expect(checkItem.rows[0].copies_available).toBe(0);
  });

  it('2. Attempting to check out out-of-stock book returns 409 Conflict', async () => {
    const res = await request(app)
      .post('/api/circulation/checkout')
      .set('Cookie', [`accessToken=${librarianToken}`])
      .send({
        item_id: testBookId,
        student_matric_or_email: studentMatric,
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Out of Stock');
  });

  it('3. Student can place a hold on the checked-out book', async () => {
    const res = await request(app)
      .post('/api/circulation/holds')
      .set('Cookie', [`accessToken=${studentToken}`])
      .send({
        item_id: testBookId,
      });

    expect(res.status).toBe(201);
    expect(res.body.hold.status).toBe('PENDING');
  });

  it('4. Student can view their active loans and holds', async () => {
    const res = await request(app)
      .get('/api/circulation/my-loans')
      .set('Cookie', [`accessToken=${studentToken}`]);

    expect(res.status).toBe(200);
    expect(res.body.loans.length).toBeGreaterThan(0);
    expect(res.body.loans[0].title).toContain('Circulation Test Book');
    expect(res.body.holds.length).toBeGreaterThan(0);
  });

  it('5. Librarian checks in / returns book, restoring available count and readying hold', async () => {
    // Get loan id
    const loanRes = await pool.query(
      `SELECT id FROM circulation_loans WHERE item_id = $1 AND status = 'ACTIVE'`,
      [testBookId]
    );
    const loanId = loanRes.rows[0].id;

    const res = await request(app)
      .post(`/api/circulation/checkin/${loanId}`)
      .set('Cookie', [`accessToken=${librarianToken}`]);

    expect(res.status).toBe(200);
    expect(res.body.holdAssigned).toBeDefined();

    // Verify copies_available restored to 1
    const checkItem = await pool.query('SELECT copies_available FROM library_items WHERE id = $1', [testBookId]);
    expect(checkItem.rows[0].copies_available).toBe(1);

    // Verify hold promoted to READY_FOR_PICKUP
    const holdRes = await pool.query('SELECT status FROM circulation_holds WHERE item_id = $1', [testBookId]);
    expect(holdRes.rows[0].status).toBe('READY_FOR_PICKUP');
  });

  it('6. Student without staff privileges cannot execute checkout (403 Forbidden)', async () => {
    const res = await request(app)
      .post('/api/circulation/checkout')
      .set('Cookie', [`accessToken=${studentToken}`])
      .send({
        item_id: testBookId,
        student_matric_or_email: studentMatric,
      });

    expect(res.status).toBe(403);
  });
});
