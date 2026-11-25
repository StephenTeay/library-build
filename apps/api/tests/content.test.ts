import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/index.js';
import { pool } from '../src/db/pool.js';
import { generateAccessToken } from '../src/modules/auth/tokens.js';
import { getStorageProvider } from '../src/providers/storage/s3StorageProvider.js';

describe('Milestone 5: Content, Storage & Library Services', () => {
  let deptCsId: number;
  let courseCom111Id: number;

  let registrarToken: string;
  let lecturerAssignedToken: string;
  let lecturerUnassignedToken: string;
  let studentEnrolledToken: string;
  let studentUnenrolledToken: string;

  let lecturerAssignedId: string;
  let studentEnrolledId: string;

  beforeAll(async () => {
    // 1. Ensure storage bucket exists
    await getStorageProvider().ensureBucketExists();

    // 2. Get CS dept
    const deptRes = await pool.query("SELECT id FROM departments WHERE code = 'CS'");
    deptCsId = deptRes.rows[0].id;

    // 3. Get COM111
    const courseRes = await pool.query("SELECT id FROM courses WHERE code = 'COM111'");
    courseCom111Id = courseRes.rows[0].id;

    // 3. Create clean test users
    await pool.query(`
      DELETE FROM learning_resources WHERE uploaded_by IN (SELECT id FROM users WHERE email LIKE 'content.%');
      DELETE FROM users WHERE email LIKE 'content.%';
    `);

    const regRes = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, role, status)
       VALUES ('content.reg@fss.ng', 'hash', 'Content Registrar', 'REGISTRAR', 'ACTIVE')
       RETURNING id;`
    );
    const regId = regRes.rows[0].id;

    const lectAssignRes = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, role, department_id, status)
       VALUES ('content.lect_assign@fss.ng', 'hash', 'Lecturer Assigned', 'LECTURER', $1, 'ACTIVE')
       RETURNING id;`,
      [deptCsId]
    );
    lecturerAssignedId = lectAssignRes.rows[0].id;

    const lectUnassignRes = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, role, department_id, status)
       VALUES ('content.lect_unassign@fss.ng', 'hash', 'Lecturer Unassigned', 'LECTURER', $1, 'ACTIVE')
       RETURNING id;`,
      [deptCsId]
    );
    const lectUnassignId = lectUnassignRes.rows[0].id;

    const studEnrollRes = await pool.query(
      `INSERT INTO users (email, matric_no, password_hash, full_name, role, department_id, programme, level, status)
       VALUES ('content.stud_enroll@fss.ng', 'CONTENT/ND/001', 'hash', 'Student Enrolled', 'STUDENT', $1, 'ND', 1, 'ACTIVE')
       RETURNING id;`,
      [deptCsId]
    );
    studentEnrolledId = studEnrollRes.rows[0].id;

    const studUnenrollRes = await pool.query(
      `INSERT INTO users (email, matric_no, password_hash, full_name, role, department_id, programme, level, status)
       VALUES ('content.stud_unenroll@fss.ng', 'CONTENT/ND/002', 'hash', 'Student Unenrolled', 'STUDENT', $1, 'ND', 1, 'ACTIVE')
       RETURNING id;`,
      [deptCsId]
    );
    const studUnenrollId = studUnenrollRes.rows[0].id;

    // 4. Assign lecturer to COM111
    await pool.query(
      `INSERT INTO course_assignments (course_id, lecturer_id, session)
       VALUES ($1, $2, '2025/2026')
       ON CONFLICT DO NOTHING;`,
      [courseCom111Id, lecturerAssignedId]
    );

    // 5. Enroll student in COM111
    await pool.query(
      `INSERT INTO enrollments (course_id, student_id, session, status)
       VALUES ($1, $2, '2025/2026', 'ENROLLED')
       ON CONFLICT DO NOTHING;`,
      [courseCom111Id, studentEnrolledId]
    );

    // 6. Generate access tokens
    registrarToken = generateAccessToken({
      userId: regId,
      email: 'content.reg@fss.ng',
      matricNo: null,
      role: 'REGISTRAR',
      departmentId: null,
      programme: null,
      level: null,
      mustChangePassword: false,
    });

    lecturerAssignedToken = generateAccessToken({
      userId: lecturerAssignedId,
      email: 'content.lect_assign@fss.ng',
      matricNo: null,
      role: 'LECTURER',
      departmentId: deptCsId,
      programme: null,
      level: null,
      mustChangePassword: false,
    });

    lecturerUnassignedToken = generateAccessToken({
      userId: lectUnassignId,
      email: 'content.lect_unassign@fss.ng',
      matricNo: null,
      role: 'LECTURER',
      departmentId: deptCsId,
      programme: null,
      level: null,
      mustChangePassword: false,
    });

    studentEnrolledToken = generateAccessToken({
      userId: studentEnrolledId,
      email: 'content.stud_enroll@fss.ng',
      matricNo: 'CONTENT/ND/001',
      role: 'STUDENT',
      departmentId: deptCsId,
      programme: 'ND',
      level: 1,
      mustChangePassword: false,
    });

    studentUnenrolledToken = generateAccessToken({
      userId: studUnenrollId,
      email: 'content.stud_unenroll@fss.ng',
      matricNo: 'CONTENT/ND/002',
      role: 'STUDENT',
      departmentId: deptCsId,
      programme: 'ND',
      level: 1,
      mustChangePassword: false,
    });
  });

  afterAll(async () => {
    // Clean up created resources and test users in order
    await pool.query(`
      DELETE FROM learning_resources WHERE uploaded_by IN (SELECT id FROM users WHERE email LIKE 'content.%');
      DELETE FROM users WHERE email LIKE 'content.%';
    `);
  });

  // ============================================================================
  // 1. Presigned Upload & Storage Flow Tests
  // ============================================================================
  describe('Object Storage & Presigned URL Flow', () => {
    let uploadedR2Key: string;
    let createdResourceId: string;

    it('Lecturer assigned to course requests presigned PUT and uploads directly to S3Mock', async () => {
      // 1. Request presigned upload URL
      const presignRes = await request(app)
        .post('/api/resources/presign-upload')
        .set('Cookie', [`accessToken=${lecturerAssignedToken}`])
        .send({
          course_id: courseCom111Id,
          filename: 'Lab1_Introduction.pdf',
          mime_type: 'application/pdf',
          size_bytes: 1024,
        });

      expect(presignRes.status).toBe(200);
      expect(presignRes.body.uploadUrl).toBeDefined();
      expect(presignRes.body.r2Key).toBeDefined();
      uploadedR2Key = presignRes.body.r2Key;

      // 2. Upload file directly to S3Mock via HTTP PUT (client direct-to-storage)
      const filePayload = Buffer.from('%PDF-1.4 Mock PDF Content For Testing FSS-IB E-Library');
      const s3UploadRes = await fetch(presignRes.body.uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Length': String(filePayload.length),
        },
        body: filePayload,
      });

      expect(s3UploadRes.ok).toBe(true);
    });

    it('Confirm step: verifies object exists via HEAD and inserts database record', async () => {
      const confirmRes = await request(app)
        .post('/api/resources/confirm')
        .set('Cookie', [`accessToken=${lecturerAssignedToken}`])
        .send({
          course_id: courseCom111Id,
          title: 'Lab 1: Introduction to Programming',
          r2_key: uploadedR2Key,
          filename: 'Lab1_Introduction.pdf',
          mime_type: 'application/pdf',
          size_bytes: 1024,
        });

      expect(confirmRes.status).toBe(201);
      expect(confirmRes.body.resource.is_confirmed).toBe(true);
      expect(confirmRes.body.resource.r2_key).toBe(uploadedR2Key);
      createdResourceId = confirmRes.body.resource.id;
    });

    it('Confirm step fails with 400 when object does not exist in S3Mock storage', async () => {
      const fakeKey = `courses/${courseCom111Id}/non_existent_file_${Date.now()}.pdf`;

      const confirmFailRes = await request(app)
        .post('/api/resources/confirm')
        .set('Cookie', [`accessToken=${lecturerAssignedToken}`])
        .send({
          course_id: courseCom111Id,
          title: 'Ghost File',
          r2_key: fakeKey,
          filename: 'ghost.pdf',
        });

      expect(confirmFailRes.status).toBe(400);
      expect(confirmFailRes.body.error).toBe('Storage Verification Failed');

      // Verify no DB record was created
      const dbCheck = await pool.query('SELECT id FROM learning_resources WHERE r2_key = $1', [fakeKey]);
      expect(dbCheck.rows.length).toBe(0);
    });

    it('Rejects presigned upload for oversized files (> 50 MB)', async () => {
      const oversizedBytes = 60 * 1024 * 1024; // 60 MB

      const res = await request(app)
        .post('/api/resources/presign-upload')
        .set('Cookie', [`accessToken=${lecturerAssignedToken}`])
        .send({
          course_id: courseCom111Id,
          filename: 'huge_archive.zip',
          size_bytes: oversizedBytes,
        });

      expect(res.status).toBe(413);
      expect(res.body.error).toBe('File Too Large');
    });

    it('Rejects presigned upload for disallowed file extensions', async () => {
      const res = await request(app)
        .post('/api/resources/presign-upload')
        .set('Cookie', [`accessToken=${lecturerAssignedToken}`])
        .send({
          course_id: courseCom111Id,
          filename: 'dangerous_script.exe',
          size_bytes: 2048,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid File Type');
    });

    it('Rejects presigned upload from lecturer not assigned to course (Wrong User)', async () => {
      const res = await request(app)
        .post('/api/resources/presign-upload')
        .set('Cookie', [`accessToken=${lecturerUnassignedToken}`])
        .send({
          course_id: courseCom111Id,
          filename: 'unauthorized_lab.pdf',
          size_bytes: 2048,
        });

      expect(res.status).toBe(403);
    });

    it('Enrolled student can obtain short-lived presigned download GET URL', async () => {
      const downloadRes = await request(app)
        .get(`/api/resources/${createdResourceId}/download`)
        .set('Cookie', [`accessToken=${studentEnrolledToken}`]);

      expect(downloadRes.status).toBe(200);
      expect(downloadRes.body.downloadUrl).toBeDefined();
      expect(downloadRes.body.expiresIn).toBe(900);

      // Verify URL actually downloads the binary stream from S3Mock
      const s3FetchRes = await fetch(downloadRes.body.downloadUrl);
      expect(s3FetchRes.ok).toBe(true);
      const text = await s3FetchRes.text();
      expect(text).toContain('Mock PDF Content For Testing FSS-IB E-Library');
    });

    it('Unenrolled student is rejected from downloading course resource with 403 Forbidden', async () => {
      const downloadRes = await request(app)
        .get(`/api/resources/${createdResourceId}/download`)
        .set('Cookie', [`accessToken=${studentUnenrolledToken}`]);

      expect(downloadRes.status).toBe(403);
      expect(downloadRes.body.error).toBe('Forbidden');
    });
  });

  // ============================================================================
  // 2. Physical Library Catalog Provider Tests
  // ============================================================================
  describe('LibraryCatalogProvider', () => {
    it('Searches physical catalog items with call number and shelf availability', async () => {
      const res = await request(app)
        .get('/api/library/search?q=Operating')
        .set('Cookie', [`accessToken=${studentEnrolledToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.items.length).toBeGreaterThan(0);
      const item = res.body.items[0];
      expect(item.title).toContain('Operating Systems');
      expect(item.call_number).toBeDefined();
      expect(item.shelf_location).toBeDefined();
      expect(item.copies_available).toBeGreaterThan(0);
    });

    it('Fetches item availability by specific ID', async () => {
      const listRes = await request(app)
        .get('/api/library/search?limit=1')
        .set('Cookie', [`accessToken=${studentEnrolledToken}`]);

      const bookId = listRes.body.items[0].id;

      const singleRes = await request(app)
        .get(`/api/library/items/${bookId}`)
        .set('Cookie', [`accessToken=${studentEnrolledToken}`]);

      expect(singleRes.status).toBe(200);
      expect(singleRes.body.item.id).toBe(bookId);
      expect(singleRes.body.item.shelf_location).toBeDefined();
    });
  });

  // ============================================================================
  // 3. Open Resource Aggregator Tests
  // ============================================================================
  describe('Open Resource Aggregator', () => {
    it('Returns curated open resources for Statistics department', async () => {
      const res = await request(app)
        .get('/api/aggregator/curated?dept=STA')
        .set('Cookie', [`accessToken=${studentEnrolledToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.department).toBe('STA');
      expect(res.body.resources.length).toBeGreaterThan(0);
      expect(res.body.resources.some((r: any) => r.title.includes('NBS') || r.title.includes('R Project'))).toBe(true);
    });

    it('Enrolled student can view and stream learning resource with Range support', async () => {
      // 1. Get confirmed COM111 resource from test setup
      const listRes = await request(app)
        .get(`/api/resources/course/${courseCom111Id}`)
        .set('Cookie', [`accessToken=${studentEnrolledToken}`]);

      expect(listRes.status).toBe(200);
      const targetResource = listRes.body.resources[0];
      expect(targetResource).toBeDefined();

      // 2. Request view metadata
      const viewRes = await request(app)
        .get(`/api/resources/${targetResource.id}/view`)
        .set('Cookie', [`accessToken=${studentEnrolledToken}`]);

      expect(viewRes.status).toBe(200);
      expect(viewRes.body.streamUrl).toBe(`/api/resources/${targetResource.id}/stream`);

      // 3. Stream resource (enrolled student)
      const streamRes = await request(app)
        .get(`/api/resources/${targetResource.id}/stream`)
        .set('Cookie', [`accessToken=${studentEnrolledToken}`]);

      expect(streamRes.status).toBe(200);
      expect(streamRes.headers['accept-ranges']).toBe('bytes');
      expect(streamRes.headers['content-disposition']).toContain('inline');

      // 4. Unenrolled student is blocked (403 Forbidden)
      const deniedRes = await request(app)
        .get(`/api/resources/${targetResource.id}/stream`)
        .set('Cookie', [`accessToken=${studentUnenrolledToken}`]);

      expect(deniedRes.status).toBe(403);
    });
  });

  // ============================================================================
  // 4. Course Discussion Forums & Moderation Tests
  // ============================================================================
  describe('Course Discussion Forums', () => {
    let threadId: number;
    let postId: number;

    it('Enrolled student creates discussion thread in course', async () => {
      const res = await request(app)
        .post(`/api/discussions/course/${courseCom111Id}`)
        .set('Cookie', [`accessToken=${studentEnrolledToken}`])
        .send({
          title: 'Question on Lab 1 Pointer Syntax',
          content: 'Could someone clarify memory allocation for dynamic arrays in the lab exercise?',
        });

      expect(res.status).toBe(201);
      expect(res.body.thread.title).toContain('Pointer Syntax');
      threadId = res.body.thread.id;
    });

    it('Student replies to thread and lecturer can soft delete post', async () => {
      // 1. Reply to thread
      const replyRes = await request(app)
        .post(`/api/discussions/thread/${threadId}/posts`)
        .set('Cookie', [`accessToken=${studentEnrolledToken}`])
        .send({
          content: 'In C, use malloc(sizeof(int) * n) and remember to free it.',
        });

      expect(replyRes.status).toBe(201);
      postId = replyRes.body.post.id;

      // 2. Lecturer soft deletes post for moderation
      const delRes = await request(app)
        .delete(`/api/discussions/posts/${postId}`)
        .set('Cookie', [`accessToken=${lecturerAssignedToken}`]);

      expect(delRes.status).toBe(200);

      // 3. Thread view shows redacted text for deleted post
      const viewRes = await request(app)
        .get(`/api/discussions/thread/${threadId}`)
        .set('Cookie', [`accessToken=${studentEnrolledToken}`]);

      expect(viewRes.status).toBe(200);
      const post = viewRes.body.posts.find((p: any) => p.id === postId);
      expect(post.is_deleted).toBe(true);
      expect(post.content).toContain('removed by a moderator');
    });
  });
});
