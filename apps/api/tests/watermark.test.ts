import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../src/index.js';
import { pool } from '../src/db/pool.js';
import { generateAccessToken } from '../src/modules/auth/tokens.js';
import { getStorageProvider } from '../src/providers/storage/s3StorageProvider.js';
import { watermarkPdf } from '../src/services/watermarker.js';
import { extractPdfText } from '../src/services/pdfExtractor.js';
import { PDFDocument } from 'pdf-lib';

describe('Phase 5 & 6: PDF Text Extraction & Dynamic Watermarking Tests', () => {
  let samplePdfBuffer: Buffer;
  let enrolledStudentToken: string;
  let testResourceId: string;

  beforeAll(async () => {
    // 1. Create a valid test PDF in memory using pdf-lib
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 400]);
    page.drawText('Federal School of Statistics Ibadan Demographic Study Sample Document');
    const bytes = await pdfDoc.save();
    samplePdfBuffer = Buffer.from(bytes);

    // Clean up old test records
    await pool.query(`
      DELETE FROM learning_resources WHERE title = 'Watermark Document Test';
      DELETE FROM enrollments WHERE student_id IN (SELECT id FROM users WHERE email = 'watermark.stud@fss.ng');
      DELETE FROM users WHERE email = 'watermark.stud@fss.ng' OR matric_no = 'WM/ND/001';
    `);

    // 2. Setup user and resource in course
    const deptRes = await pool.query("SELECT id FROM departments WHERE code = 'CS'");
    const deptId = deptRes.rows[0].id;

    const courseRes = await pool.query("SELECT id FROM courses WHERE code = 'COM111'");
    const courseId = courseRes.rows[0].id;

    const studRes = await pool.query(
      `INSERT INTO users (email, matric_no, password_hash, full_name, role, department_id, status)
       VALUES ('watermark.stud@fss.ng', 'WM/ND/001', 'hash', 'Watermark Student', 'STUDENT', $1, 'ACTIVE')
       RETURNING id;`,
      [deptId]
    );
    const studId = studRes.rows[0].id;

    enrolledStudentToken = generateAccessToken({
      userId: studId,
      email: 'watermark.stud@fss.ng',
      matricNo: 'WM/ND/001',
      role: 'STUDENT',
      departmentId: deptId,
    });

    await pool.query(
      `INSERT INTO enrollments (course_id, student_id, session, status)
       VALUES ($1, $2, '2025/2026', 'ENROLLED')
       ON CONFLICT DO NOTHING;`,
      [courseId, studId]
    );

    // 3. Put PDF into storage
    const storageKey = `courses/${courseId}/watermark-test-${Date.now()}.pdf`;
    await getStorageProvider().putObjectDirect(storageKey, samplePdfBuffer, 'application/pdf');

    // 4. Create confirmed resource
    const resRow = await pool.query(
      `INSERT INTO learning_resources (
         course_id, title, resource_type, r2_key, size_bytes, mime_type, uploaded_by, is_confirmed
       ) VALUES ($1, 'Watermark Document Test', 'DOCUMENT', $2, $3, 'application/pdf', $4, TRUE)
       RETURNING id;`,
      [courseId, storageKey, samplePdfBuffer.length, studId]
    );
    testResourceId = resRow.rows[0].id;
  });

  it('1. Extracts plain text correctly from PDF buffer', async () => {
    const text = await extractPdfText(samplePdfBuffer);
    expect(text).toContain('Federal School of Statistics');
    expect(text).toContain('Demographic Study');
  });

  it('2. Watermark service stamps PDF and returns valid document', async () => {
    const watermarkedBytes = await watermarkPdf(samplePdfBuffer, {
      studentName: 'Watermark Student',
      matricNo: 'WM/ND/001',
      ipAddress: '192.168.1.100',
    });

    expect(watermarkedBytes.length).toBeGreaterThan(0);
    // Reload into PDFDocument to verify integrity
    const reloaded = await PDFDocument.load(watermarkedBytes);
    expect(reloaded.getPageCount()).toBe(1);
  });

  it('3. GET /api/resources/:id/watermark-download returns watermarked PDF', async () => {
    const res = await request(app)
      .get(`/api/resources/${testResourceId}/watermark-download`)
      .set('Cookie', [`accessToken=${enrolledStudentToken}`]);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('watermarked.pdf');
    expect(res.body).toBeDefined();
  });
});
