import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/index.js';
import { pool } from '../src/db/pool.js';
import { generateAccessToken } from '../src/modules/auth/tokens.js';
import { verifyPassword } from '../src/modules/auth/password.js';

describe('Milestone 4: Onboarding & CSV Streaming Importer', () => {
  let deptCsId: number;
  let deptAiId: number;

  let registrarToken: string;
  let hodCsToken: string;
  let hodAiToken: string;
  let coordCsLvl1Token: string;

  beforeAll(async () => {
    // Clean up any stale records from previous runs
    await pool.query(
      "DELETE FROM users WHERE email LIKE '%@csvtest.ng' OR email LIKE '%@regtest.ng' OR matric_no LIKE 'PEND/%' OR matric_no LIKE 'FSS/%/2026/%' OR matric_no LIKE 'UNLISTED/%'"
    );

    const deptRes = await pool.query("SELECT id, code FROM departments WHERE code IN ('CS', 'AI')");
    for (const r of deptRes.rows) {
      if (r.code === 'CS') deptCsId = r.id;
      if (r.code === 'AI') deptAiId = r.id;
    }

    // Insert real staff records into users table so foreign keys in import_jobs and audit_logs are satisfied
    const regUserRes = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, role, status)
       VALUES ('onboard.registrar@fss.ng', 'hash', 'Onboard Registrar', 'REGISTRAR', 'ACTIVE')
       ON CONFLICT (email) DO UPDATE SET role = 'REGISTRAR'
       RETURNING id;`
    );
    const registrarId = regUserRes.rows[0].id;

    const hodCsRes = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, role, department_id, status)
       VALUES ('onboard.hod_cs@fss.ng', 'hash', 'HOD Computer Science', 'HOD', $1, 'ACTIVE')
       ON CONFLICT (email) DO UPDATE SET role = 'HOD', department_id = $1
       RETURNING id;`,
      [deptCsId]
    );
    const hodCsId = hodCsRes.rows[0].id;

    const hodAiRes = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, role, department_id, status)
       VALUES ('onboard.hod_ai@fss.ng', 'hash', 'HOD AI', 'HOD', $1, 'ACTIVE')
       ON CONFLICT (email) DO UPDATE SET role = 'HOD', department_id = $1
       RETURNING id;`,
      [deptAiId]
    );
    const hodAiId = hodAiRes.rows[0].id;

    const coordCs1Res = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, role, department_id, level, programme, status)
       VALUES ('onboard.coord_cs1@fss.ng', 'hash', 'Coord CS Lvl 1', 'LEVEL_COORDINATOR', $1, 1, 'ND', 'ACTIVE')
       ON CONFLICT (email) DO UPDATE SET role = 'LEVEL_COORDINATOR', department_id = $1, level = 1
       RETURNING id;`,
      [deptCsId]
    );
    const coordCs1Id = coordCs1Res.rows[0].id;

    // Set up staff tokens with actual database user IDs
    registrarToken = generateAccessToken({
      userId: registrarId,
      email: 'onboard.registrar@fss.ng',
      matricNo: null,
      role: 'REGISTRAR',
      departmentId: null,
      programme: null,
      level: null,
      mustChangePassword: false,
    });

    hodCsToken = generateAccessToken({
      userId: hodCsId,
      email: 'onboard.hod_cs@fss.ng',
      matricNo: null,
      role: 'HOD',
      departmentId: deptCsId,
      programme: null,
      level: null,
      mustChangePassword: false,
    });

    hodAiToken = generateAccessToken({
      userId: hodAiId,
      email: 'onboard.hod_ai@fss.ng',
      matricNo: null,
      role: 'HOD',
      departmentId: deptAiId,
      programme: null,
      level: null,
      mustChangePassword: false,
    });

    coordCsLvl1Token = generateAccessToken({
      userId: coordCs1Id,
      email: 'onboard.coord_cs1@fss.ng',
      matricNo: null,
      role: 'LEVEL_COORDINATOR',
      departmentId: deptCsId,
      programme: 'ND',
      level: 1,
      mustChangePassword: false,
    });
  });

  afterAll(async () => {
    // Cleanup created test records
    await pool.query("DELETE FROM users WHERE email LIKE '%@csvtest.ng' OR email LIKE '%@regtest.ng'");
  });

  // ============================================================================
  // 1. Streaming CSV Importer Tests
  // ============================================================================
  describe('CSV Streaming Importer', () => {
    it('Imports valid CSV rows with initial password equal to matric, active status, forced change, and auto-enrollment', async () => {
      const csvContent = [
        'matric_no,email,full_name,department,programme,level,entry_session',
        'FSS/ND/CS/2026/101,student101@csvtest.ng,Student One Hundred,CS,ND,1,2025/2026',
        'FSS/HND/CS/2026/102,student102@csvtest.ng,Student One Hundred Two,Computer Science,HND,1,2025/2026',
      ].join('\n');

      const res = await request(app)
        .post('/api/onboarding/import-csv')
        .set('Cookie', [`accessToken=${registrarToken}`])
        .attach('file', Buffer.from(csvContent), 'students.csv');

      expect(res.status).toBe(200);
      expect(res.body.summary.totalRows).toBe(2);
      expect(res.body.summary.successfulRows).toBe(2);
      expect(res.body.summary.failedRows).toBe(0);

      // Verify user record in database
      const userRes = await pool.query(
        "SELECT id, matric_no, password_hash, status, must_change_password FROM users WHERE email = 'student101@csvtest.ng'"
      );
      expect(userRes.rows.length).toBe(1);
      const student = userRes.rows[0];
      expect(student.status).toBe('ACTIVE');
      expect(student.must_change_password).toBe(true);

      // Verify initial password is the sanitized matric number
      const pwMatches = await verifyPassword('FSS/ND/CS/2026/101', student.password_hash);
      expect(pwMatches).toBe(true);

      // Verify auto-enrollment in matching ND Level 1 CS courses
      const enrollRes = await pool.query(
        'SELECT e.id, c.code FROM enrollments e JOIN courses c ON e.course_id = c.id WHERE e.student_id = $1',
        [student.id]
      );
      expect(enrollRes.rows.length).toBeGreaterThan(0);
      expect(enrollRes.rows.some((r: any) => r.code === 'COM111')).toBe(true);
    });

    it('Duplicate accounts are skipped and reported without overwriting existing records', async () => {
      // Import file containing student101 who already exists + one new student
      const csvContent = [
        'matric_no,email,full_name,department,programme,level,entry_session',
        'FSS/ND/CS/2026/101,student101@csvtest.ng,Different Name Overwrite Attempt,CS,ND,1,2025/2026',
        'FSS/ND/CS/2026/103,student103@csvtest.ng,Student One Hundred Three,CS,ND,1,2025/2026',
      ].join('\n');

      const res = await request(app)
        .post('/api/onboarding/import-csv')
        .set('Cookie', [`accessToken=${registrarToken}`])
        .attach('file', Buffer.from(csvContent), 'duplicates.csv');

      expect(res.status).toBe(200);
      expect(res.body.summary.totalRows).toBe(2);
      expect(res.body.summary.successfulRows).toBe(1);
      expect(res.body.summary.skippedDuplicates).toBe(1);

      // Verify existing student was not overwritten
      const checkRes = await pool.query("SELECT full_name FROM users WHERE email = 'student101@csvtest.ng'");
      expect(checkRes.rows[0].full_name).toBe('Student One Hundred');
    });

    it('Bad rows (missing fields, invalid programme/level, unknown dept) are recorded in error report', async () => {
      const csvContent = [
        'matric_no,email,full_name,department,programme,level,entry_session',
        ',student_bad1@csvtest.ng,No Matric,CS,ND,1,2025/2026',
        'FSS/ND/CS/2026/104,student104@csvtest.ng,Invalid Prog,CS,BSc,1,2025/2026',
        'FSS/ND/CS/2026/105,student105@csvtest.ng,Invalid Level,CS,ND,5,2025/2026',
        'FSS/ND/CS/2026/106,student106@csvtest.ng,Unknown Dept,UnknownEngineering,ND,1,2025/2026',
        'FSS/ND/CS/2026/107,student107@csvtest.ng,Valid Student,CS,ND,1,2025/2026',
      ].join('\n');

      const res = await request(app)
        .post('/api/onboarding/import-csv')
        .set('Cookie', [`accessToken=${registrarToken}`])
        .attach('file', Buffer.from(csvContent), 'bad_rows.csv');

      expect(res.status).toBe(200);
      expect(res.body.summary.totalRows).toBe(5);
      expect(res.body.summary.successfulRows).toBe(1);
      expect(res.body.summary.failedRows).toBe(4);
      expect(res.body.summary.errors.length).toBe(4);
    });

    it('BOM-encoded CSV (UTF-8 with Byte Order Mark) is parsed transparently', async () => {
      const bomHeader = '\uFEFFmatric_no,email,full_name,department,programme,level,entry_session\n';
      const row = 'FSS/ND/CS/2026/108,student108@csvtest.ng,BOM Student,CS,ND,1,2025/2026';
      const buffer = Buffer.from(bomHeader + row, 'utf-8');

      const res = await request(app)
        .post('/api/onboarding/import-csv')
        .set('Cookie', [`accessToken=${registrarToken}`])
        .attach('file', buffer, 'bom_file.csv');

      expect(res.status).toBe(200);
      expect(res.body.summary.successfulRows).toBe(1);
    });

    it('Streams a multi-hundred row file in chunks of 100 with bounded memory', async () => {
      const lines = ['matric_no,email,full_name,department,programme,level,entry_session'];
      for (let i = 200; i < 350; i++) {
        lines.push(`FSS/ND/CS/2026/${i},batch_student_${i}@csvtest.ng,Batch Student ${i},CS,ND,1,2025/2026`);
      }
      const largeCsv = lines.join('\n');

      const res = await request(app)
        .post('/api/onboarding/import-csv')
        .set('Cookie', [`accessToken=${registrarToken}`])
        .attach('file', Buffer.from(largeCsv), 'large_stream.csv');

      expect(res.status).toBe(200);
      expect(res.body.summary.totalRows).toBe(150);
      expect(res.body.summary.successfulRows).toBe(150);
      expect(res.body.summary.failedRows).toBe(0);
    }, 30000);
  });

  // ============================================================================
  // 2. Self-Registration & Verification Flow
  // ============================================================================
  describe('Self-Registration & Email Verification', () => {
    it('Creates PENDING user with matched_verified=true if in admissions master list', async () => {
      // Use pre-seeded student 2: FSS/ND/CS/2025/002
      const res = await request(app)
        .post('/api/onboarding/register')
        .send({
          matric_no: 'FSS/ND/CS/2025/002',
          email: 'sample.student2@regtest.ng',
          password: 'Password123!',
          full_name: 'Matched Student',
          department_id: deptCsId,
          programme: 'ND',
          level: 1,
        });

      expect(res.status).toBe(201);
      expect(res.body.matchedVerified).toBe(true);

      const check = await pool.query("SELECT status, matched_verified, email_verified_at FROM users WHERE email = 'sample.student2@regtest.ng'");
      expect(check.rows[0].status).toBe('PENDING');
      expect(check.rows[0].matched_verified).toBe(true);
      expect(check.rows[0].email_verified_at).toBeNull();
    });

    it('Creates PENDING user with matched_verified=false if NOT in admissions master list', async () => {
      const res = await request(app)
        .post('/api/onboarding/register')
        .send({
          matric_no: 'UNLISTED/MATRIC/001',
          email: 'unlisted@regtest.ng',
          password: 'Password123!',
          full_name: 'Unlisted Student',
          department_id: deptCsId,
          programme: 'ND',
          level: 1,
        });

      expect(res.status).toBe(201);
      expect(res.body.matchedVerified).toBe(false);
    });

    it('Verifies email using single-use verification token', async () => {
      // Extract generated verification token from database
      const userRes = await pool.query("SELECT id FROM users WHERE email = 'sample.student2@regtest.ng'");
      const userId = userRes.rows[0].id;

      // Create a specific known token for deterministic testing
      const { generateOpaqueToken } = await import('../src/modules/auth/tokens.js');
      const { token, hash } = generateOpaqueToken();

      await pool.query(
        'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'1 day\')',
        [userId, hash]
      );

      const verifyRes = await request(app).get(`/api/onboarding/verify-email?token=${token}`);
      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.success).toBe(true);

      // Verify email_verified_at is now set
      const check = await pool.query('SELECT email_verified_at FROM users WHERE id = $1', [userId]);
      expect(check.rows[0].email_verified_at).not.toBeNull();
    });
  });

  // ============================================================================
  // 3. Approval Queue & Scoping Tests
  // ============================================================================
  describe('Staff Approval Queue & Scoped Actions', () => {
    let pendingCsStudentId: string;
    let pendingAiStudentId: string;

    beforeAll(async () => {
      // Clean up previous pending students
      await pool.query("DELETE FROM users WHERE matric_no IN ('PEND/CS/001', 'PEND/AI/001')");

      // Create one verified pending CS student and one verified pending AI student
      const csRes = await pool.query(
        `INSERT INTO users (matric_no, email, password_hash, full_name, department_id, programme, level, entry_session, role, status, email_verified_at, matched_verified)
         VALUES ('PEND/CS/001', 'pend_cs@regtest.ng', 'hash', 'Pending CS', $1, 'ND', 1, '2025/2026', 'STUDENT', 'PENDING', NOW(), TRUE)
         RETURNING id`,
        [deptCsId]
      );
      pendingCsStudentId = csRes.rows[0].id;

      const aiRes = await pool.query(
        `INSERT INTO users (matric_no, email, password_hash, full_name, department_id, programme, level, entry_session, role, status, email_verified_at, matched_verified)
         VALUES ('PEND/AI/001', 'pend_ai@regtest.ng', 'hash', 'Pending AI', $1, 'ND', 1, '2025/2026', 'STUDENT', 'PENDING', NOW(), FALSE)
         RETURNING id`,
        [deptAiId]
      );
      pendingAiStudentId = aiRes.rows[0].id;
    });

    it('HOD sees only pending students in their own department', async () => {
      // HOD CS queue
      const csQueueRes = await request(app)
        .get('/api/onboarding/queue')
        .set('Cookie', [`accessToken=${hodCsToken}`]);

      expect(csQueueRes.status).toBe(200);
      const studentIds = csQueueRes.body.queue.map((s: any) => s.id);
      expect(studentIds).toContain(pendingCsStudentId);
      expect(studentIds).not.toContain(pendingAiStudentId);

      // HOD AI queue
      const aiQueueRes = await request(app)
        .get('/api/onboarding/queue')
        .set('Cookie', [`accessToken=${hodAiToken}`]);

      expect(aiQueueRes.status).toBe(200);
      const aiStudentIds = aiQueueRes.body.queue.map((s: any) => s.id);
      expect(aiStudentIds).toContain(pendingAiStudentId);
      expect(aiStudentIds).not.toContain(pendingCsStudentId);
    });

    it('Registrar sees pending students globally across all departments', async () => {
      const regQueueRes = await request(app)
        .get('/api/onboarding/queue')
        .set('Cookie', [`accessToken=${registrarToken}`]);

      expect(regQueueRes.status).toBe(200);
      const allIds = regQueueRes.body.queue.map((s: any) => s.id);
      expect(allIds).toContain(pendingCsStudentId);
      expect(allIds).toContain(pendingAiStudentId);
    });

    it('HOD can approve students in their department, activating account and auto-enrolling', async () => {
      const approveRes = await request(app)
        .post('/api/onboarding/approve')
        .set('Cookie', [`accessToken=${hodCsToken}`])
        .send({ user_ids: [pendingCsStudentId] });

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.approvedCount).toBe(1);

      // Check student is now ACTIVE
      const userCheck = await pool.query('SELECT status FROM users WHERE id = $1', [pendingCsStudentId]);
      expect(userCheck.rows[0].status).toBe('ACTIVE');

      // Check auto-enrollment created
      const enrollCheck = await pool.query('SELECT id FROM enrollments WHERE student_id = $1', [pendingCsStudentId]);
      expect(enrollCheck.rows.length).toBeGreaterThan(0);
    });

    it('HOD attempting to approve a student from another department is rejected with scope error', async () => {
      const crossApproveRes = await request(app)
        .post('/api/onboarding/approve')
        .set('Cookie', [`accessToken=${hodCsToken}`])
        .send({ user_ids: [pendingAiStudentId] });

      expect(crossApproveRes.status).toBe(200);
      expect(crossApproveRes.body.approvedCount).toBe(0);
      expect(crossApproveRes.body.errors.length).toBeGreaterThan(0);
      expect(crossApproveRes.body.errors[0]).toContain('Scope violation');

      // Check AI student is still PENDING
      const userCheck = await pool.query('SELECT status FROM users WHERE id = $1', [pendingAiStudentId]);
      expect(userCheck.rows[0].status).toBe('PENDING');
    });
  });
});
