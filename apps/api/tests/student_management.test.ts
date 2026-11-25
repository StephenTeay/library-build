import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/index.js';
import { pool } from '../src/db/pool.js';
import { generateAccessToken } from '../src/modules/auth/tokens.js';

describe('Milestone: Admin Student Management Tests', () => {
  let librarianToken: string;
  let hodCsToken: string;
  let studentToken: string;
  let deptCsId: number;
  let deptStaId: number;
  let createdStudentId: string = '';
  let courseIdToEnroll: number;

  beforeAll(async () => {
    const deptCs = await pool.query("SELECT id FROM departments WHERE code = 'CS'");
    deptCsId = deptCs.rows[0].id;
    const deptSta = await pool.query("SELECT id FROM departments WHERE code = 'STA'");
    deptStaId = deptSta.rows[0].id;

    // Get a course for enrollment test
    const courseRes = await pool.query('SELECT id FROM courses LIMIT 1');
    courseIdToEnroll = courseRes.rows[0].id;

    // Librarian token (Super Admin)
    librarianToken = generateAccessToken({
      userId: '3db1e733-988d-4be1-aba3-c12f2205cd64',
      email: 'librarian@fss.ng',
      matricNo: null,
      role: 'LIBRARIAN',
      departmentId: null,
      programme: null,
      level: null,
      mustChangePassword: false,
    });

    // HOD CS token
    hodCsToken = generateAccessToken({
      userId: '6ed6ed20-2f2a-4ed2-b1bf-d35d87a924ac',
      email: 'onboard.hod_cs@fss.ng',
      matricNo: null,
      role: 'HOD',
      departmentId: deptCsId,
      programme: null,
      level: null,
      mustChangePassword: false,
    });

    // Student token
    studentToken = generateAccessToken({
      userId: '11111111-2222-3333-4444-555555555555',
      email: 'regular.student@fss.ng',
      matricNo: 'FSS/TEST/01',
      role: 'STUDENT',
      departmentId: deptCsId,
      programme: 'ND',
      level: 1,
      mustChangePassword: false,
    });

    // Clean up test student if left over
    await pool.query("DELETE FROM users WHERE email IN ('test.create.student@fss.ng', 'test.updated.student@fss.ng')");
  });

  afterAll(async () => {
    await pool.query("DELETE FROM users WHERE email IN ('test.create.student@fss.ng', 'test.updated.student@fss.ng')");
  });

  it('GET /api/students: Denies access to normal student role', async () => {
    const res = await request(app)
      .get('/api/students')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(403);
  });

  it('GET /api/students: Allows Librarian (Admin) to view all students and supports filters', async () => {
    const res = await request(app)
      .get('/api/students')
      .set('Authorization', `Bearer ${librarianToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('students');
    expect(Array.isArray(res.body.students)).toBe(true);
    expect(res.body).toHaveProperty('count');
  });

  it('POST /api/students: Allows Admin to create single student and auto-enrolls in courses', async () => {
    const payload = {
      full_name: 'Adewale Johnson Test',
      email: 'test.create.student@fss.ng',
      matric_no: 'FSS/CS/24/T099',
      department_id: deptCsId,
      programme: 'ND',
      level: 1,
      entry_session: '2025/2026',
    };

    const res = await request(app)
      .post('/api/students')
      .set('Authorization', `Bearer ${librarianToken}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('student');
    expect(res.body.student.email).toBe('test.create.student@fss.ng');
    expect(res.body.student.matric_no).toBe('FSS/CS/24/T099');
    expect(res.body).toHaveProperty('tempPassword');
    expect(res.body.tempPassword).toMatch(/^FSS-/);

    createdStudentId = res.body.student.id;

    // Verify student was auto-enrolled in CS departmental courses
    const enrollments = await pool.query('SELECT COUNT(*)::int as count FROM enrollments WHERE student_id = $1', [createdStudentId]);
    expect(enrollments.rows[0].count).toBeGreaterThan(0);
  });

  it('POST /api/students: Rejects duplicate email address', async () => {
    const res = await request(app)
      .post('/api/students')
      .set('Authorization', `Bearer ${librarianToken}`)
      .send({
        full_name: 'Duplicate Student',
        email: 'test.create.student@fss.ng',
        department_id: deptCsId,
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('already exists');
  });

  it('GET /api/students/:id: Returns student profile with enrolled courses and loans', async () => {
    const res = await request(app)
      .get(`/api/students/${createdStudentId}`)
      .set('Authorization', `Bearer ${librarianToken}`);

    expect(res.status).toBe(200);
    expect(res.body.student.id).toBe(createdStudentId);
    expect(res.body).toHaveProperty('enrollments');
    expect(res.body).toHaveProperty('loans');
    expect(Array.isArray(res.body.enrollments)).toBe(true);
  });

  it('PUT /api/students/:id: Allows Admin to update student details', async () => {
    const res = await request(app)
      .put(`/api/students/${createdStudentId}`)
      .set('Authorization', `Bearer ${librarianToken}`)
      .send({
        full_name: 'Adewale Johnson Updated',
        matric_no: 'FSS/CS/24/T100',
        level: 2,
      });

    expect(res.status).toBe(200);
    expect(res.body.student.full_name).toBe('Adewale Johnson Updated');
    expect(res.body.student.matric_no).toBe('FSS/CS/24/T100');
    expect(res.body.student.level).toBe(2);
  });

  it('PATCH /api/students/:id/status: Allows toggling student account status (ACTIVE <-> SUSPENDED)', async () => {
    const suspendRes = await request(app)
      .patch(`/api/students/${createdStudentId}/status`)
      .set('Authorization', `Bearer ${librarianToken}`)
      .send({ status: 'SUSPENDED' });

    expect(suspendRes.status).toBe(200);
    expect(suspendRes.body.student.status).toBe('SUSPENDED');

    const activateRes = await request(app)
      .patch(`/api/students/${createdStudentId}/status`)
      .set('Authorization', `Bearer ${librarianToken}`)
      .send({ status: 'ACTIVE' });

    expect(activateRes.status).toBe(200);
    expect(activateRes.body.student.status).toBe('ACTIVE');
  });

  it('POST /api/students/:id/reset-password: Generates temporary password for student', async () => {
    const res = await request(app)
      .post(`/api/students/${createdStudentId}/reset-password`)
      .set('Authorization', `Bearer ${librarianToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('tempPassword');
    expect(res.body.tempPassword).toMatch(/^FSS-/);

    // Verify must_change_password flag was set in DB
    const checkDb = await pool.query('SELECT must_change_password FROM users WHERE id = $1', [createdStudentId]);
    expect(checkDb.rows[0].must_change_password).toBe(true);
  });

  it('POST & DELETE /api/students/:id/enroll: Allows managing course enrollments', async () => {
    // Enroll in course
    const enrollRes = await request(app)
      .post(`/api/students/${createdStudentId}/enroll`)
      .set('Authorization', `Bearer ${librarianToken}`)
      .send({ course_id: courseIdToEnroll });

    expect(enrollRes.status).toBe(200);
    expect(enrollRes.body).toHaveProperty('enrollments');

    // Unenroll from course
    const unenrollRes = await request(app)
      .delete(`/api/students/${createdStudentId}/enroll/${courseIdToEnroll}`)
      .set('Authorization', `Bearer ${librarianToken}`);

    expect(unenrollRes.status).toBe(200);
  });

  it('DELETE /api/students/:id: Allows Super Admin (Librarian) to delete student account', async () => {
    const res = await request(app)
      .delete(`/api/students/${createdStudentId}`)
      .set('Authorization', `Bearer ${librarianToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('deleted');

    // Verify no longer in DB
    const checkDb = await pool.query('SELECT id FROM users WHERE id = $1', [createdStudentId]);
    expect(checkDb.rows.length).toBe(0);
  });
});
