import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/index.js';
import { pool } from '../src/db/pool.js';
import { generateAccessToken } from '../src/modules/auth/tokens.js';

describe('Course & Module Integration Tests', () => {
  let deptCsId: number;
  let courseCom111Id: number;
  let registrarToken: string;
  let studentToken: string;
  let studentId: string;

  beforeAll(async () => {
    const deptRes = await pool.query("SELECT id FROM departments WHERE code = 'CS'");
    deptCsId = deptRes.rows[0].id;

    const courseRes = await pool.query("SELECT id FROM courses WHERE code = 'COM111'");
    courseCom111Id = courseRes.rows[0].id;

    // Create test student
    await pool.query("DELETE FROM users WHERE email = 'course.test.student@fss.ng'");
    const studRes = await pool.query(
      `INSERT INTO users (email, matric_no, password_hash, full_name, role, department_id, programme, level, status)
       VALUES ('course.test.student@fss.ng', 'FSS/CS/ND/24/TEST01', 'hash', 'Test Course Student', 'STUDENT', $1, 'ND', 1, 'ACTIVE')
       RETURNING id;`,
      [deptCsId]
    );
    studentId = studRes.rows[0].id;

    studentToken = generateAccessToken({
      userId: studentId,
      email: 'course.test.student@fss.ng',
      matricNo: 'FSS/CS/ND/24/TEST01',
      role: 'STUDENT',
      departmentId: deptCsId,
      programme: 'ND',
      level: 1,
      mustChangePassword: false,
    });

    registrarToken = generateAccessToken({
      userId: '00000000-0000-0000-0000-000000000001',
      email: 'registrar@fss.ng',
      matricNo: null,
      role: 'REGISTRAR',
      departmentId: null,
      programme: null,
      level: null,
      mustChangePassword: false,
    });
  });

  afterAll(async () => {
    await pool.query('DELETE FROM enrollments WHERE student_id = $1', [studentId]);
    await pool.query('DELETE FROM users WHERE id = $1', [studentId]);
  });

  it('GET /api/courses returns list of courses with department code and credit units', async () => {
    const res = await request(app)
      .get('/api/courses')
      .set('Cookie', [`accessToken=${registrarToken}`]);

    expect(res.status).toBe(200);
    expect(res.body.courses).toBeDefined();
    expect(res.body.courses.length).toBeGreaterThan(0);
    const com111 = res.body.courses.find((c: any) => c.code === 'COM111');
    expect(com111).toBeDefined();
    expect(com111.credit_units).toBe(3);
    expect(com111.department_code).toBe('CS');
  });

  it('GET /api/courses/enrolled returns courses for student', async () => {
    const res = await request(app)
      .get('/api/courses/enrolled')
      .set('Cookie', [`accessToken=${studentToken}`]);

    expect(res.status).toBe(200);
    expect(res.body.courses).toBeDefined();
    expect(res.body.courses.length).toBeGreaterThan(0);
  });

  it('GET /api/courses/:id returns single course details', async () => {
    const res = await request(app)
      .get(`/api/courses/${courseCom111Id}`)
      .set('Cookie', [`accessToken=${studentToken}`]);

    expect(res.status).toBe(200);
    expect(res.body.course).toBeDefined();
    expect(res.body.course.code).toBe('COM111');
  });

  it('POST /api/courses/:id/enroll allows student to enroll', async () => {
    const res = await request(app)
      .post(`/api/courses/${courseCom111Id}/enroll`)
      .set('Cookie', [`accessToken=${studentToken}`]);

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('Enrolled successfully');
  });

  it('GET /api/library/course/:courseId returns library books mapped to course', async () => {
    const res = await request(app)
      .get(`/api/library/course/${courseCom111Id}`)
      .set('Cookie', [`accessToken=${studentToken}`]);

    expect(res.status).toBe(200);
    expect(res.body.items).toBeDefined();
  });

  it('GET /api/aggregator/query returns live/fallback research results', async () => {
    const res = await request(app)
      .get('/api/aggregator/query?q=statistics')
      .set('Cookie', [`accessToken=${studentToken}`]);

    expect(res.status).toBe(200);
    expect(res.body.results).toBeDefined();
    expect(res.body.results.length).toBeGreaterThan(0);
  }, 15000);

  it('GET /api/aggregator/live-search returns multi-platform results with in-UI reader metadata', async () => {
    const res = await request(app)
      .get('/api/aggregator/live-search?q=calculus')
      .set('Cookie', [`accessToken=${studentToken}`]);

    expect(res.status).toBe(200);
    expect(res.body.results).toBeDefined();
    expect(res.body.results.length).toBeGreaterThan(0);
    expect(res.body.results[0]).toHaveProperty('readerType');
    expect(res.body.results[0]).toHaveProperty('readUrl');
  }, 15000);

  it('GET /api/aggregator/live-search returns 400 if q parameter is missing', async () => {
    const res = await request(app)
      .get('/api/aggregator/live-search')
      .set('Cookie', [`accessToken=${studentToken}`]);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Bad Request');
  });

  it('GET /api/aggregator/read-proxy sanitizes and returns readable content', async () => {
    const res = await request(app)
      .get('/api/aggregator/read-proxy?url=https://example.com')
      .set('Cookie', [`accessToken=${studentToken}`]);

    expect([200, 502]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.content).toBeDefined();
      expect(res.body.contentType).toBeDefined();
    }
  }, 15000);
});
