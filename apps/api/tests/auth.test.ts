import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/index.js';
import { pool } from '../src/db/pool.js';
import { hashPassword } from '../src/modules/auth/password.js';
import { generateAccessToken } from '../src/modules/auth/tokens.js';
import { clearRateLimitStore } from '../src/middleware/rateLimiter.js';

describe('Milestone 3: Authentication, Authorization & Security', () => {
  let deptCsId: number;
  let deptAiId: number;
  let courseCom111Id: number;

  let registrarUser: any;
  let hodCsUser: any;
  let coordCsLvl1User: any;
  let lecturerAssignedUser: any;
  let lecturerUnassignedUser: any;
  let studentEnrolledUser: any;
  let studentUnenrolledUser: any;
  let studentForcedChangeUser: any;

  let registrarToken: string;
  let hodCsToken: string;
  let coordCsLvl1Token: string;
  let lecturerAssignedToken: string;
  let lecturerUnassignedToken: string;
  let studentEnrolledToken: string;
  let studentUnenrolledToken: string;
  let studentForcedChangeToken: string;

  beforeAll(async () => {
    // 1. Get departments
    const deptRes = await pool.query("SELECT id, code FROM departments WHERE code IN ('CS', 'AI')");
    for (const r of deptRes.rows) {
      if (r.code === 'CS') deptCsId = r.id;
      if (r.code === 'AI') deptAiId = r.id;
    }

    // 2. Get COM111 course
    const courseRes = await pool.query("SELECT id FROM courses WHERE code = 'COM111'");
    courseCom111Id = courseRes.rows[0].id;

    const defaultHash = await hashPassword('TestPassword123!');

    // 3. Create test users for each role
    const usersToCreate = [
      { email: 'test.registrar@fss.ng', matric: null, role: 'REGISTRAR', dept: null, lvl: null, prog: null, mustChange: false },
      { email: 'test.hod_cs@fss.ng', matric: null, role: 'HOD', dept: deptCsId, lvl: null, prog: null, mustChange: false },
      { email: 'test.coord_cs_lvl1@fss.ng', matric: null, role: 'LEVEL_COORDINATOR', dept: deptCsId, lvl: 1, prog: 'ND', mustChange: false },
      { email: 'test.lecturer_assigned@fss.ng', matric: null, role: 'LECTURER', dept: deptCsId, lvl: null, prog: null, mustChange: false },
      { email: 'test.lecturer_unassigned@fss.ng', matric: null, role: 'LECTURER', dept: deptCsId, lvl: null, prog: null, mustChange: false },
      { email: 'test.student_enrolled@fss.ng', matric: 'TEST/ND/CS/001', role: 'STUDENT', dept: deptCsId, lvl: 1, prog: 'ND', mustChange: false },
      { email: 'test.student_unenrolled@fss.ng', matric: 'TEST/ND/CS/002', role: 'STUDENT', dept: deptCsId, lvl: 1, prog: 'ND', mustChange: false },
      { email: 'test.student_forced@fss.ng', matric: 'TEST/ND/CS/003', role: 'STUDENT', dept: deptCsId, lvl: 1, prog: 'ND', mustChange: true },
    ];

    for (const u of usersToCreate) {
      const res = await pool.query(
        `INSERT INTO users (email, matric_no, password_hash, full_name, role, department_id, level, programme, status, must_change_password)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE', $9)
         ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, must_change_password = EXCLUDED.must_change_password
         RETURNING id, email, matric_no, role, department_id, level, programme, must_change_password;`,
        [u.email, u.matric, defaultHash, `User ${u.role}`, u.role, u.dept, u.lvl, u.prog, u.mustChange]
      );
      const created = res.rows[0];

      if (u.role === 'REGISTRAR') registrarUser = created;
      if (u.role === 'HOD') hodCsUser = created;
      if (u.role === 'LEVEL_COORDINATOR') coordCsLvl1User = created;
      if (u.email.includes('assigned') && !u.email.includes('unassigned')) lecturerAssignedUser = created;
      if (u.email.includes('unassigned')) lecturerUnassignedUser = created;
      if (u.email.includes('student_enrolled')) studentEnrolledUser = created;
      if (u.email.includes('student_unenrolled')) studentUnenrolledUser = created;
      if (u.email.includes('student_forced')) studentForcedChangeUser = created;
    }

    // 4. Assign lecturer to COM111
    await pool.query(
      `INSERT INTO course_assignments (course_id, lecturer_id, session)
       VALUES ($1, $2, '2025/2026')
       ON CONFLICT (course_id, lecturer_id, session) DO NOTHING;`,
      [courseCom111Id, lecturerAssignedUser.id]
    );

    // 5. Enroll student in COM111
    await pool.query(
      `INSERT INTO enrollments (course_id, student_id, session, status)
       VALUES ($1, $2, '2025/2026', 'ENROLLED')
       ON CONFLICT (student_id, course_id, session) DO NOTHING;`,
      [courseCom111Id, studentEnrolledUser.id]
    );

    // 6. Generate access tokens for each user
    registrarToken = generateAccessToken({
      userId: registrarUser.id,
      email: registrarUser.email,
      matricNo: registrarUser.matric_no,
      role: registrarUser.role,
      departmentId: registrarUser.department_id,
      programme: registrarUser.programme,
      level: registrarUser.level,
      mustChangePassword: false,
    });

    hodCsToken = generateAccessToken({
      userId: hodCsUser.id,
      email: hodCsUser.email,
      matricNo: hodCsUser.matric_no,
      role: hodCsUser.role,
      departmentId: hodCsUser.department_id,
      programme: hodCsUser.programme,
      level: hodCsUser.level,
      mustChangePassword: false,
    });

    coordCsLvl1Token = generateAccessToken({
      userId: coordCsLvl1User.id,
      email: coordCsLvl1User.email,
      matricNo: coordCsLvl1User.matric_no,
      role: coordCsLvl1User.role,
      departmentId: coordCsLvl1User.department_id,
      programme: coordCsLvl1User.programme,
      level: coordCsLvl1User.level,
      mustChangePassword: false,
    });

    lecturerAssignedToken = generateAccessToken({
      userId: lecturerAssignedUser.id,
      email: lecturerAssignedUser.email,
      matricNo: lecturerAssignedUser.matric_no,
      role: lecturerAssignedUser.role,
      departmentId: lecturerAssignedUser.department_id,
      programme: lecturerAssignedUser.programme,
      level: lecturerAssignedUser.level,
      mustChangePassword: false,
    });

    lecturerUnassignedToken = generateAccessToken({
      userId: lecturerUnassignedUser.id,
      email: lecturerUnassignedUser.email,
      matricNo: lecturerUnassignedUser.matric_no,
      role: lecturerUnassignedUser.role,
      departmentId: lecturerUnassignedUser.department_id,
      programme: lecturerUnassignedUser.programme,
      level: lecturerUnassignedUser.level,
      mustChangePassword: false,
    });

    studentEnrolledToken = generateAccessToken({
      userId: studentEnrolledUser.id,
      email: studentEnrolledUser.email,
      matricNo: studentEnrolledUser.matric_no,
      role: studentEnrolledUser.role,
      departmentId: studentEnrolledUser.department_id,
      programme: studentEnrolledUser.programme,
      level: studentEnrolledUser.level,
      mustChangePassword: false,
    });

    studentUnenrolledToken = generateAccessToken({
      userId: studentUnenrolledUser.id,
      email: studentUnenrolledUser.email,
      matricNo: studentUnenrolledUser.matric_no,
      role: studentUnenrolledUser.role,
      departmentId: studentUnenrolledUser.department_id,
      programme: studentUnenrolledUser.programme,
      level: studentUnenrolledUser.level,
      mustChangePassword: false,
    });

    studentForcedChangeToken = generateAccessToken({
      userId: studentForcedChangeUser.id,
      email: studentForcedChangeUser.email,
      matricNo: studentForcedChangeUser.matric_no,
      role: studentForcedChangeUser.role,
      departmentId: studentForcedChangeUser.department_id,
      programme: studentForcedChangeUser.programme,
      level: studentForcedChangeUser.level,
      mustChangePassword: true,
    });
  });

  afterAll(async () => {
    // Clean up test records
    await pool.query("DELETE FROM users WHERE email LIKE 'test.%'");
  });

  // ============================================================================
  // 1. Permission Matrix Tests
  // ============================================================================
  describe('Permission Matrix: Role & Scope Guards', () => {
    it('REGISTRAR Global Route: only REGISTRAR allowed, others rejected with 403', async () => {
      // Registrar -> 200
      const regRes = await request(app)
        .get('/api/test-perm/registrar-only')
        .set('Cookie', [`accessToken=${registrarToken}`]);
      expect(regRes.status).toBe(200);

      // HOD -> 403
      const hodRes = await request(app)
        .get('/api/test-perm/registrar-only')
        .set('Cookie', [`accessToken=${hodCsToken}`]);
      expect(hodRes.status).toBe(403);

      // Level Coordinator -> 403
      const coordRes = await request(app)
        .get('/api/test-perm/registrar-only')
        .set('Cookie', [`accessToken=${coordCsLvl1Token}`]);
      expect(coordRes.status).toBe(403);

      // Lecturer -> 403
      const lectRes = await request(app)
        .get('/api/test-perm/registrar-only')
        .set('Cookie', [`accessToken=${lecturerAssignedToken}`]);
      expect(lectRes.status).toBe(403);

      // Student -> 403
      const studRes = await request(app)
        .get('/api/test-perm/registrar-only')
        .set('Cookie', [`accessToken=${studentEnrolledToken}`]);
      expect(studRes.status).toBe(403);
    });

    it('Department Scoped Route: REGISTRAR has global access, HOD/Coord only for own dept', async () => {
      // Registrar accessing CS and AI -> both 200
      const regCs = await request(app)
        .get(`/api/test-perm/dept/${deptCsId}`)
        .set('Cookie', [`accessToken=${registrarToken}`]);
      expect(regCs.status).toBe(200);

      const regAi = await request(app)
        .get(`/api/test-perm/dept/${deptAiId}`)
        .set('Cookie', [`accessToken=${registrarToken}`]);
      expect(regAi.status).toBe(200);

      // HOD of CS accessing CS -> 200
      const hodCs = await request(app)
        .get(`/api/test-perm/dept/${deptCsId}`)
        .set('Cookie', [`accessToken=${hodCsToken}`]);
      expect(hodCs.status).toBe(200);

      // HOD of CS accessing AI -> 403
      const hodAi = await request(app)
        .get(`/api/test-perm/dept/${deptAiId}`)
        .set('Cookie', [`accessToken=${hodCsToken}`]);
      expect(hodAi.status).toBe(403);

      // Student accessing dept action -> 403
      const studRes = await request(app)
        .get(`/api/test-perm/dept/${deptCsId}`)
        .set('Cookie', [`accessToken=${studentEnrolledToken}`]);
      expect(studRes.status).toBe(403);
    });

    it('Level Coordinator Scoped Route: Level Coordinator restricted to assigned level', async () => {
      // Coord CS Level 1 accessing Level 1 -> 200
      const coordLvl1 = await request(app)
        .get(`/api/test-perm/dept/${deptCsId}/level/1`)
        .set('Cookie', [`accessToken=${coordCsLvl1Token}`]);
      expect(coordLvl1.status).toBe(200);

      // Coord CS Level 1 accessing Level 2 -> 403
      const coordLvl2 = await request(app)
        .get(`/api/test-perm/dept/${deptCsId}/level/2`)
        .set('Cookie', [`accessToken=${coordCsLvl1Token}`]);
      expect(coordLvl2.status).toBe(403);
    });

    it('Course Management: Registrar, HOD, and Assigned Lecturer allowed; Unassigned/Student rejected', async () => {
      // Registrar -> 200
      const regRes = await request(app)
        .get(`/api/test-perm/course-manage/${courseCom111Id}`)
        .set('Cookie', [`accessToken=${registrarToken}`]);
      expect(regRes.status).toBe(200);

      // HOD of CS -> 200
      const hodRes = await request(app)
        .get(`/api/test-perm/course-manage/${courseCom111Id}`)
        .set('Cookie', [`accessToken=${hodCsToken}`]);
      expect(hodRes.status).toBe(200);

      // Lecturer assigned to COM111 -> 200
      const lectAssignRes = await request(app)
        .get(`/api/test-perm/course-manage/${courseCom111Id}`)
        .set('Cookie', [`accessToken=${lecturerAssignedToken}`]);
      expect(lectAssignRes.status).toBe(200);

      // Lecturer NOT assigned to COM111 -> 403
      const lectUnassignRes = await request(app)
        .get(`/api/test-perm/course-manage/${courseCom111Id}`)
        .set('Cookie', [`accessToken=${lecturerUnassignedToken}`]);
      expect(lectUnassignRes.status).toBe(403);

      // Student -> 403
      const studRes = await request(app)
        .get(`/api/test-perm/course-manage/${courseCom111Id}`)
        .set('Cookie', [`accessToken=${studentEnrolledToken}`]);
      expect(studRes.status).toBe(403);
    });

    it('Course Content Access: Enrolled Student and Assigned Lecturer allowed; Unenrolled Student rejected', async () => {
      // Enrolled student -> 200
      const enrollRes = await request(app)
        .get(`/api/test-perm/course-access/${courseCom111Id}`)
        .set('Cookie', [`accessToken=${studentEnrolledToken}`]);
      expect(enrollRes.status).toBe(200);

      // Unenrolled student -> 403
      const unenrollRes = await request(app)
        .get(`/api/test-perm/course-access/${courseCom111Id}`)
        .set('Cookie', [`accessToken=${studentUnenrolledToken}`]);
      expect(unenrollRes.status).toBe(403);

      // Assigned lecturer -> 200
      const lectRes = await request(app)
        .get(`/api/test-perm/course-access/${courseCom111Id}`)
        .set('Cookie', [`accessToken=${lecturerAssignedToken}`]);
      expect(lectRes.status).toBe(200);
    });
  });

  // ============================================================================
  // 2. Forced Password Change Gate
  // ============================================================================
  describe('Forced Password Change Gate', () => {
    it('Blocks user with must_change_password=true from general routes with 403 PASSWORD_CHANGE_REQUIRED', async () => {
      const res = await request(app)
        .get('/api/dashboard/stats')
        .set('Cookie', [`accessToken=${studentForcedChangeToken}`]);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    });

    it('Allows user with must_change_password=true to call /api/auth/change-password and clears the flag', async () => {
      const changeRes = await request(app)
        .post('/api/auth/change-password')
        .set('Cookie', [`accessToken=${studentForcedChangeToken}`])
        .send({
          current_password: 'TestPassword123!',
          new_password: 'BrandNewPassword2026!',
        });

      expect(changeRes.status).toBe(200);
      expect(changeRes.body.success).toBe(true);

      // Extract new accessToken cookie from response
      const setCookies = changeRes.headers['set-cookie'] as unknown as string[];
      expect(setCookies).toBeDefined();
      const newAccessTokenCookie = setCookies.find((c: string) => c.startsWith('accessToken='));
      expect(newAccessTokenCookie).toBeDefined();

      // Now access dashboard stats with updated cookie -> 200 OK
      const statsRes = await request(app)
        .get('/api/dashboard/stats')
        .set('Cookie', [newAccessTokenCookie as string]);

      expect(statsRes.status).toBe(200);
      expect(statsRes.body.active).toBe(true);
    });
  });

  // ============================================================================
  // 3. Login Lockout & Rate Limiting
  // ============================================================================
  describe('Account Lockout & Rate Limiting', () => {
    it('Locks account after 5 consecutive failed login attempts and returns 429', async () => {
      // Create dedicated user for lockout test
      const testEmail = 'lockout.test@fss.ng';
      const pwHash = await hashPassword('CorrectPassword1!');
      await pool.query(
        `INSERT INTO users (email, password_hash, full_name, role, status)
         VALUES ($1, $2, 'Lockout Tester', 'STUDENT', 'ACTIVE')
         ON CONFLICT (email) DO UPDATE SET failed_attempts = 0, locked_until = NULL`,
        [testEmail, pwHash]
      );

      // Attempt 1-4: Invalid credentials (401)
      for (let i = 1; i <= 4; i++) {
        const res = await request(app)
          .post('/api/auth/login')
          .send({ identifier: testEmail, password: 'WrongPassword!' });
        expect(res.status).toBe(401);
      }

      // Attempt 5: Triggers account lock (401 with locked notice)
      const lockRes = await request(app)
        .post('/api/auth/login')
        .send({ identifier: testEmail, password: 'WrongPassword!' });
      expect(lockRes.status).toBe(401);
      expect(lockRes.body.message).toContain('locked for 15 minutes');

      // Clear IP rate limit store so we specifically test database-level account lockout
      clearRateLimitStore();

      // Attempt 6 (even with correct password): Blocked by account lockout (429)
      const blockedRes = await request(app)
        .post('/api/auth/login')
        .send({ identifier: testEmail, password: 'CorrectPassword1!' });
      expect(blockedRes.status).toBe(429);
      expect(blockedRes.body.error).toBe('Account Locked');
    });

    it('Enforces IP rate limit on login endpoint after threshold', async () => {
      clearRateLimitStore();

      // Send 5 requests from this test agent IP
      for (let i = 0; i < 5; i++) {
        await request(app).post('/api/auth/login').send({ identifier: 'nobody@fss.ng', password: 'abc' });
      }

      // 6th request hits rate limit
      const limitRes = await request(app)
        .post('/api/auth/login')
        .send({ identifier: 'nobody@fss.ng', password: 'abc' });

      expect(limitRes.status).toBe(429);
      expect(limitRes.body.error).toBe('Too Many Requests');

      clearRateLimitStore();
    });
  });

  // ============================================================================
  // 4. Session Refresh & Token Rotation
  // ============================================================================
  describe('Session Token Rotation', () => {
    it('Rotates refresh token and issues new access token', async () => {
      clearRateLimitStore();

      // 1. Log in as registrar
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ identifier: registrarUser.email, password: 'TestPassword123!' });

      expect(loginRes.status).toBe(200);
      const cookies = loginRes.headers['set-cookie'] as unknown as string[];
      expect(cookies).toBeDefined();
      const refreshCookie = cookies.find((c: string) => c.startsWith('refreshToken='));
      expect(refreshCookie).toBeDefined();

      // 2. Call refresh endpoint
      const refreshRes = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [refreshCookie as string]);

      expect(refreshRes.status).toBe(200);
      const newCookies = refreshRes.headers['set-cookie'] as unknown as string[];
      expect(newCookies).toBeDefined();
      const newRefreshCookie = newCookies.find((c: string) => c.startsWith('refreshToken='));
      expect(newRefreshCookie).toBeDefined();

      // 3. Trying to reuse old refresh token should be rejected (401)
      const reuseRes = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [refreshCookie as string]);

      expect(reuseRes.status).toBe(401);
    });
  });

  // ============================================================================
  // 5. Password Reset Flow
  // ============================================================================
  describe('Password Reset Flow', () => {
    it('Requests password reset and resets password with token', async () => {
      const email = registrarUser.email;

      // 1. Request reset
      const reqRes = await request(app)
        .post('/api/auth/request-reset')
        .send({ email });
      expect(reqRes.status).toBe(200);

      // 2. Extract token from DB for test verification
      const tokenRow = await pool.query(
        'SELECT id, user_id FROM password_reset_tokens WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
        [registrarUser.id]
      );
      expect(tokenRow.rows.length).toBe(1);
    });
  });
});
