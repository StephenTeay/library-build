import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/index.js';
import { pool } from '../src/db/pool.js';
import { generateAccessToken } from '../src/modules/auth/tokens.js';

describe('Staff Management & Bulk Book Import Tests', () => {
  let librarianToken: string;
  let libraryStaffToken: string;
  let studentToken: string;
  let deptCsId: number;
  let createdStaffId: string = '';

  let librarianId: string;
  let libraryStaffId: string;

  beforeAll(async () => {
    const deptRes = await pool.query("SELECT id FROM departments WHERE code = 'CS'");
    deptCsId = deptRes.rows[0].id;

    const libRes = await pool.query("SELECT id FROM users WHERE email = 'librarian@fss.ng'");
    librarianId = libRes.rows[0]?.id;
    if (!librarianId) {
      const inserted = await pool.query(
        `INSERT INTO users (email, password_hash, full_name, role, status)
         VALUES ('librarian@fss.ng', 'hash', 'Librarian FSS', 'LIBRARIAN', 'ACTIVE')
         RETURNING id;`
      );
      librarianId = inserted.rows[0].id;
    }

    await pool.query("DELETE FROM users WHERE email = 'test.library.staff@fss.ng'");
    const staffRes = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, role, status)
       VALUES ('test.library.staff@fss.ng', 'hash', 'Test Library Staff', 'LIBRARY_STAFF', 'ACTIVE')
       RETURNING id;`
    );
    libraryStaffId = staffRes.rows[0].id;

    librarianToken = generateAccessToken({
      userId: librarianId,
      email: 'librarian@fss.ng',
      matricNo: null,
      role: 'LIBRARIAN',
      departmentId: null,
      programme: null,
      level: null,
      mustChangePassword: false,
    });

    libraryStaffToken = generateAccessToken({
      userId: libraryStaffId,
      email: 'test.library.staff@fss.ng',
      matricNo: null,
      role: 'LIBRARY_STAFF',
      departmentId: null,
      programme: null,
      level: null,
      mustChangePassword: false,
    });

    studentToken = generateAccessToken({
      userId: '00000000-0000-0000-0000-000000000003',
      email: 'student@fss.ng',
      matricNo: 'FSS/CS/ND/24/0001',
      role: 'STUDENT',
      departmentId: deptCsId,
      programme: 'ND',
      level: 1,
      mustChangePassword: false,
    });
  });

  afterAll(async () => {
    if (createdStaffId) {
      await pool.query('DELETE FROM user_scopes WHERE user_id = $1', [createdStaffId]);
      await pool.query('DELETE FROM users WHERE id = $1', [createdStaffId]);
    }
    await pool.query("DELETE FROM users WHERE email IN ('test.hod.staff@fss.ng', 'test.lib.staff@fss.ng', 'test.library.staff@fss.ng')");
  });

  describe('Staff Management API (/api/staff)', () => {
    it('GET /api/staff: Rejects student with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/staff')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
    });

    it('GET /api/staff: Allows Librarian to retrieve staff directory', async () => {
      const res = await request(app)
        .get('/api/staff')
        .set('Authorization', `Bearer ${librarianToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.staff)).toBe(true);
      expect(typeof res.body.total).toBe('number');
    });

    it('POST /api/staff: Fails when required department is missing for HOD', async () => {
      const res = await request(app)
        .post('/api/staff')
        .set('Authorization', `Bearer ${librarianToken}`)
        .send({
          full_name: 'Dr. John Test HOD',
          email: 'test.hod.staff@fss.ng',
          role: 'HOD',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Department is required');
    });

    it('POST /api/staff: Successfully provisions new HOD with department scope and temp password', async () => {
      const res = await request(app)
        .post('/api/staff')
        .set('Authorization', `Bearer ${librarianToken}`)
        .send({
          full_name: 'Dr. John Test HOD',
          email: 'test.hod.staff@fss.ng',
          role: 'HOD',
          department_id: deptCsId,
        });

      expect(res.status).toBe(201);
      expect(res.body.staff.email).toBe('test.hod.staff@fss.ng');
      expect(res.body.staff.role).toBe('HOD');
      expect(res.body.staff.must_change_password).toBe(true);
      expect(res.body.temporary_password).toBeDefined();

      createdStaffId = res.body.staff.id;

      // Verify user_scopes entry was automatically created
      const scopeCheck = await pool.query('SELECT * FROM user_scopes WHERE user_id = $1', [createdStaffId]);
      expect(scopeCheck.rows.length).toBe(1);
      expect(scopeCheck.rows[0].department_id).toBe(deptCsId);
    });

    it('POST /api/staff: Successfully provisions LIBRARY_STAFF without requiring department', async () => {
      const res = await request(app)
        .post('/api/staff')
        .set('Authorization', `Bearer ${librarianToken}`)
        .send({
          full_name: 'Library Assistant Mary',
          email: 'test.lib.staff@fss.ng',
          role: 'LIBRARY_STAFF',
        });

      expect(res.status).toBe(201);
      expect(res.body.staff.role).toBe('LIBRARY_STAFF');
      expect(res.body.temporary_password).toBeDefined();
    });

    it('PATCH /api/staff/:id: Allows Librarian to suspend an active staff member', async () => {
      const res = await request(app)
        .patch(`/api/staff/${createdStaffId}`)
        .set('Authorization', `Bearer ${librarianToken}`)
        .send({ status: 'SUSPENDED' });

      expect(res.status).toBe(200);
      expect(res.body.staff.status).toBe('SUSPENDED');
    });

    it('POST /api/staff/:id/reset-password: Generates new temp password and sets must_change_password', async () => {
      const res = await request(app)
        .post(`/api/staff/${createdStaffId}/reset-password`)
        .set('Authorization', `Bearer ${librarianToken}`);

      expect(res.status).toBe(200);
      expect(res.body.temporary_password).toBeDefined();

      const userCheck = await pool.query('SELECT must_change_password, failed_attempts FROM users WHERE id = $1', [createdStaffId]);
      expect(userCheck.rows[0].must_change_password).toBe(true);
      expect(userCheck.rows[0].failed_attempts).toBe(0);
    });
  });

  describe('Bulk Book Catalog Importer API (/api/library)', () => {
    it('GET /api/library/template-csv: Returns downloadable CSV catalog template', async () => {
      const res = await request(app).get('/api/library/template-csv');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('attachment; filename="fss_library_catalog_template.csv"');
      expect(res.text).toContain('title,author,isbn,call_number,shelf_location');
    });

    it('POST /api/library/import-csv: Rejects student with 403 Forbidden', async () => {
      const csvBuffer = Buffer.from(
        'title,author,isbn,call_number,shelf_location,copies_total,copies_available,department_code\n' +
        '"Calculus II","J. Stewart","978-0538497817","QA303 .S8","Shelf M-1",4,4,"MTH"\n'
      );

      const res = await request(app)
        .post('/api/library/import-csv')
        .set('Authorization', `Bearer ${studentToken}`)
        .attach('file', csvBuffer, 'books.csv');

      expect(res.status).toBe(403);
    });

    it('POST /api/library/import-csv: Replaces catalog in replace mode and streams new books', async () => {
      const csvBuffer = Buffer.from(
        'title,author,isbn,call_number,shelf_location,copies_total,copies_available,department_code\n' +
        '"Modern Operating Systems","Andrew Tanenbaum","978-0133591620","QA76.76.O63 T36","Shelf CS-01",5,5,"CS"\n' +
        '"Artificial Intelligence: A Modern Approach","Russell & Norvig","978-0136042594","Q335 .R87","Shelf CS-02",3,3,"CS"\n' +
        '"Probability & Mathematical Statistics","Prasanna Sahoo","978-0979570131","QA273 .S24","Shelf ST-05",6,6,"ST"\n'
      );

      const res = await request(app)
        .post('/api/library/import-csv?mode=replace')
        .set('Authorization', `Bearer ${librarianToken}`)
        .attach('file', csvBuffer, 'new_books.csv');

      expect(res.status).toBe(200);
      expect(res.body.summary.successfulRows).toBe(3);
      expect(res.body.summary.replacedExisting).toBe(true);
      expect(res.body.summary.failedRows).toBe(0);

      // Verify books exist in database
      const checkRes = await pool.query('SELECT count(*) as cnt FROM library_items');
      expect(Number(checkRes.rows[0].cnt)).toBe(3);
    });

    it('POST /api/library/import-csv: Appends books in append mode without purging existing catalog', async () => {
      const appendCsvBuffer = Buffer.from(
        'title,author,isbn,call_number,shelf_location,copies_total,copies_available,department_code\n' +
        '"Business Communication Today","Bovee & Thill","978-0134562766","HF5718 .B68","Shelf BA-01",4,4,"BA"\n'
      );

      const res = await request(app)
        .post('/api/library/import-csv?mode=append')
        .set('Authorization', `Bearer ${libraryStaffToken}`)
        .attach('file', appendCsvBuffer, 'append_books.csv');

      expect(res.status).toBe(200);
      expect(res.body.summary.successfulRows).toBe(1);
      expect(res.body.summary.replacedExisting).toBe(false);

      const checkRes = await pool.query('SELECT count(*) as cnt FROM library_items');
      expect(Number(checkRes.rows[0].cnt)).toBe(4);
    });
  });
});
