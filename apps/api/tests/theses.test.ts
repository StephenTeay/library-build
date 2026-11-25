import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../src/index.js';
import { pool } from '../src/db/pool.js';
import { generateAccessToken } from '../src/modules/auth/tokens.js';
import { getStorageProvider } from '../src/providers/storage/s3StorageProvider.js';

describe('Phase 4: Institutional Repository (Theses & Capstone Projects) Tests', () => {
  let deptCsId: number;
  let deptStaId: number;

  let hodCsToken: string;
  let hodStaToken: string;
  let studentCsToken: string;
  let studentCsId: string;
  let studentCsMatric: string;

  let createdThesisId: string;
  let manuscriptKey: string;

  beforeAll(async () => {
    // 1. Ensure storage bucket
    await getStorageProvider().ensureBucketExists();

    // 2. Fetch departments
    const csRes = await pool.query("SELECT id FROM departments WHERE code = 'CS'");
    deptCsId = csRes.rows[0].id;

    const staRes = await pool.query("SELECT id FROM departments WHERE code = 'STA'");
    deptStaId = staRes.rows[0].id;

    // 3. Clean old test data
    await pool.query(`
      DELETE FROM theses_repository WHERE title LIKE 'Theses Test%';
      DELETE FROM users WHERE email LIKE 'theses.%';
    `);

    // 4. Create HOD CS
    const hodCsRes = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, role, department_id, status)
       VALUES ('theses.hodcs@fss.ng', 'hash', 'Dr. CS HOD', 'HOD', $1, 'ACTIVE')
       RETURNING id;`,
      [deptCsId]
    );
    hodCsToken = generateAccessToken({
      userId: hodCsRes.rows[0].id,
      email: 'theses.hodcs@fss.ng',
      matricNo: null,
      role: 'HOD',
      departmentId: deptCsId,
    });

    // 5. Create HOD STA
    const hodStaRes = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, role, department_id, status)
       VALUES ('theses.hodsta@fss.ng', 'hash', 'Dr. STA HOD', 'HOD', $1, 'ACTIVE')
       RETURNING id;`,
      [deptStaId]
    );
    hodStaToken = generateAccessToken({
      userId: hodStaRes.rows[0].id,
      email: 'theses.hodsta@fss.ng',
      matricNo: null,
      role: 'HOD',
      departmentId: deptStaId,
    });

    // 6. Create Student
    studentCsMatric = 'THESES/HND/001';
    const studRes = await pool.query(
      `INSERT INTO users (email, matric_no, password_hash, full_name, role, department_id, level, programme, status)
       VALUES ('theses.student@fss.ng', $1, 'hash', 'Ibrahim Thesis Student', 'STUDENT', $2, 2, 'HND', 'ACTIVE')
       RETURNING id;`,
      [studentCsMatric, deptCsId]
    );
    studentCsId = studRes.rows[0].id;
    studentCsToken = generateAccessToken({
      userId: studentCsId,
      email: 'theses.student@fss.ng',
      matricNo: studentCsMatric,
      role: 'STUDENT',
      departmentId: deptCsId,
    });

    // 7. Seed dummy manuscript into storage
    manuscriptKey = `theses/test-manuscript-${Date.now()}.pdf`;
    await getStorageProvider().putObjectDirect(
      manuscriptKey,
      Buffer.from('%PDF-1.4 Institutional Repository Capstone Manuscript Content'),
      'application/pdf'
    );
  });

  it('1. Student submits final-year capstone project manuscript', async () => {
    const res = await request(app)
      .post('/api/theses/submit')
      .set('Cookie', [`accessToken=${studentCsToken}`])
      .send({
        title: 'Theses Test: An Autonomous Deep Learning Model for Statistical Demography in Ibadan',
        abstract: 'This project develops a convolutional forecasting model for demographic estimation in Oyo State.',
        department_id: deptCsId,
        programme: 'HND',
        academic_session: '2024/2025',
        supervisor_name: 'Dr. CS HOD',
        keywords: ['Machine Learning', 'Demography', 'Neural Networks'],
        student_authors: [
          { matric_no: studentCsMatric, full_name: 'Ibrahim Thesis Student', email: 'theses.student@fss.ng' },
        ],
        manuscript_r2_key: manuscriptKey,
        code_repo_url: 'https://github.com/fss-ib/demography-dl',
      });

    expect(res.status).toBe(201);
    expect(res.body.thesis).toBeDefined();
    expect(res.body.thesis.status).toBe('SUBMITTED');
    createdThesisId = res.body.thesis.id;
  });

  it('2. HOD CS sees the submitted thesis in their departmental review queue', async () => {
    const res = await request(app)
      .get('/api/theses/queue/review')
      .set('Cookie', [`accessToken=${hodCsToken}`]);

    expect(res.status).toBe(200);
    const item = res.body.queue.find((t: any) => t.id === createdThesisId);
    expect(item).toBeDefined();
    expect(item.title).toContain('Theses Test');
  });

  it('3. HOD from another department (STA) does NOT see CS submissions in their queue', async () => {
    const res = await request(app)
      .get('/api/theses/queue/review')
      .set('Cookie', [`accessToken=${hodStaToken}`]);

    expect(res.status).toBe(200);
    const item = res.body.queue.find((t: any) => t.id === createdThesisId);
    expect(item).toBeUndefined();
  });

  it('4. HOD STA cannot review CS submissions (403 Forbidden)', async () => {
    const res = await request(app)
      .post(`/api/theses/${createdThesisId}/review`)
      .set('Cookie', [`accessToken=${hodStaToken}`])
      .send({
        action: 'APPROVE',
        review_notes: 'Unauthorized approval attempt',
      });

    expect(res.status).toBe(403);
  });

  it('5. HOD CS approves the thesis, publishing it to the repository', async () => {
    const res = await request(app)
      .post(`/api/theses/${createdThesisId}/review`)
      .set('Cookie', [`accessToken=${hodCsToken}`])
      .send({
        action: 'APPROVE',
        review_notes: 'Excellent methodology and reproducible statistical pipeline.',
      });

    expect(res.status).toBe(200);
    expect(res.body.thesis.status).toBe('PUBLISHED');
  });

  it('6. Published thesis appears in public repository list and search', async () => {
    const res = await request(app)
      .get('/api/theses?dept=CS&q=Autonomous')
      .set('Cookie', [`accessToken=${studentCsToken}`]);

    expect(res.status).toBe(200);
    const item = res.body.theses.find((t: any) => t.id === createdThesisId);
    expect(item).toBeDefined();
    expect(item.status).toBe('PUBLISHED');
  });

  it('7. Thesis manuscript PDF can be streamed with Range support', async () => {
    const res = await request(app)
      .get(`/api/theses/${createdThesisId}/stream`)
      .set('Cookie', [`accessToken=${studentCsToken}`]);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['accept-ranges']).toBe('bytes');
  });
});
