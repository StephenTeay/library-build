import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../src/index.js';
import { pool } from '../src/db/pool.js';
import { generateAccessToken } from '../src/modules/auth/tokens.js';

describe('Phase 6: OAI-PMH, Library Analytics, Bookshelf & Course Reserves', () => {
  let librarianToken: string;
  let studentToken: string;
  let lecturerToken: string;
  let studentId: string;
  let testCourseId: number;
  let testBookId: string;
  let testThesisId: string;

  beforeAll(async () => {
    // 1. Cleanup old test records
    await pool.query(`
      DELETE FROM course_reserves WHERE notes LIKE 'RESERVE_TEST%';
      DELETE FROM user_bookshelf WHERE notes LIKE 'SHELF_TEST%';
      DELETE FROM library_search_queries WHERE query_text LIKE 'TEST_QUERY%';
      DELETE FROM theses_repository WHERE title LIKE 'OAI Test Thesis%';
      DELETE FROM library_items WHERE title LIKE 'Analytics Test Book%';
      DELETE FROM course_assignments WHERE course_id IN (SELECT id FROM courses WHERE code LIKE 'OAI%');
      DELETE FROM courses WHERE code LIKE 'OAI%';
      DELETE FROM users WHERE email LIKE 'oai_test.%';
    `);

    // 2. Create Librarian User
    const libRes = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, role, status)
       VALUES ('oai_test.librarian@fss.ng', 'hash', 'OAI Librarian', 'LIBRARIAN', 'ACTIVE')
       RETURNING id;`
    );
    librarianToken = generateAccessToken({
      userId: libRes.rows[0].id,
      email: 'oai_test.librarian@fss.ng',
      matricNo: null,
      role: 'LIBRARIAN',
      departmentId: null,
    });

    // 3. Create Lecturer User
    const deptRes = await pool.query(`SELECT id FROM departments LIMIT 1;`);
    const deptId = deptRes.rows[0].id;

    const lecRes = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, role, department_id, status)
       VALUES ('oai_test.lecturer@fss.ng', 'hash', 'OAI Lecturer', 'LECTURER', $1, 'ACTIVE')
       RETURNING id;`,
      [deptId]
    );
    lecturerToken = generateAccessToken({
      userId: lecRes.rows[0].id,
      email: 'oai_test.lecturer@fss.ng',
      matricNo: null,
      role: 'LECTURER',
      departmentId: deptId,
    });

    // 4. Create Student User
    const studRes = await pool.query(
      `INSERT INTO users (email, matric_no, password_hash, full_name, role, department_id, level, programme, status)
       VALUES ('oai_test.student@fss.ng', 'OAI/ND/001', 'hash', 'OAI Student', 'STUDENT', $1, 1, 'ND', 'ACTIVE')
       RETURNING id;`,
      [deptId]
    );
    studentId = studRes.rows[0].id;
    studentToken = generateAccessToken({
      userId: studentId,
      email: 'oai_test.student@fss.ng',
      matricNo: 'OAI/ND/001',
      role: 'STUDENT',
      departmentId: deptId,
    });

    // 5. Create Test Course & Assignment
    const courseRes = await pool.query(
      `INSERT INTO courses (code, title, department_id, programme, level, semester, credit_units)
       VALUES ('OAI101', 'OAI & Analytics Intro', $1, 'ND', 1, 1, 3)
       RETURNING id;`,
      [deptId]
    );
    testCourseId = courseRes.rows[0].id;

    await pool.query(
      `INSERT INTO course_assignments (course_id, lecturer_id, session) VALUES ($1, $2, '2025/2026');`,
      [testCourseId, lecRes.rows[0].id]
    );

    // 6. Create Test Book
    const bookRes = await pool.query(
      `INSERT INTO library_items (title, author, call_number, shelf_location, copies_total, copies_available, publisher, publication_year)
       VALUES ('Analytics Test Book', 'Prof. Bayes', 'QA276 .B39 2024', 'Shelf A3', 5, 5, 'FSS Academic Press', 2024)
       RETURNING id;`
    );
    testBookId = String(bookRes.rows[0].id);

    // 7. Create Published Thesis for OAI harvesting
    const thesisRes = await pool.query(
      `INSERT INTO theses_repository (
         title, abstract, student_authors, supervisor_name, department_id,
         programme, academic_session, manuscript_r2_key, status, published_at, submitted_by
       ) VALUES (
         'OAI Test Thesis on Machine Learning',
         'A novel empirical evaluation of predictive neural algorithms for institutional research.',
         $1::jsonb, 'Dr. Supervisor', $2, 'ND', '2024/2025', 'theses/oai_test.pdf', 'PUBLISHED', NOW(), $3
       ) RETURNING id;`,
      [JSON.stringify([{ name: 'OAI Student', matric_no: 'OAI/ND/001' }]), deptId, studentId]
    );
    testThesisId = thesisRes.rows[0].id;
  });

  // --------------------------------------------------------------------------
  // OAI-PMH 2.0 Academic Harvesting Tests
  // --------------------------------------------------------------------------
  describe('OAI-PMH 2.0 Academic Harvesting Endpoint (/api/oai)', () => {
    it('1. GET /api/oai without verb returns 400 badVerb error in XML', async () => {
      const res = await request(app).get('/api/oai');
      expect(res.status).toBe(400);
      expect(res.headers['content-type']).toContain('xml');
      expect(res.text).toContain('<OAI-PMH');
      expect(res.text).toContain('<error code="badVerb">');
    });

    it('2. GET /api/oai?verb=Identify returns repository metadata in XML', async () => {
      const res = await request(app).get('/api/oai?verb=Identify');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('xml');
      expect(res.text).toContain('<repositoryName>Federal School of Statistics, Ibadan Institutional Repository</repositoryName>');
      expect(res.text).toContain('<protocolVersion>2.0</protocolVersion>');
      expect(res.text).toContain('<adminEmail>library@fss.ng</adminEmail>');
    });

    it('3. GET /api/oai?verb=ListMetadataFormats returns oai_dc Dublin Core schema', async () => {
      const res = await request(app).get('/api/oai?verb=ListMetadataFormats');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('xml');
      expect(res.text).toContain('<metadataPrefix>oai_dc</metadataPrefix>');
      expect(res.text).toContain('http://www.openarchives.org/OAI/2.0/oai_dc.xsd');
    });

    it('4. GET /api/oai?verb=ListSets returns repository sets', async () => {
      const res = await request(app).get('/api/oai?verb=ListSets');
      expect(res.status).toBe(200);
      expect(res.text).toContain('<setSpec>theses</setSpec>');
      expect(res.text).toContain('<setSpec>nd</setSpec>');
    });

    it('5. GET /api/oai?verb=ListIdentifiers returns item headers', async () => {
      const res = await request(app).get('/api/oai?verb=ListIdentifiers&metadataPrefix=oai_dc');
      expect(res.status).toBe(200);
      expect(res.text).toContain(`<identifier>oai:fss.ng:theses/${testThesisId}</identifier>`);
      expect(res.text).toContain('<setSpec>theses</setSpec>');
    });

    it('6. GET /api/oai?verb=ListRecords returns Dublin Core metadata records', async () => {
      const res = await request(app).get('/api/oai?verb=ListRecords&metadataPrefix=oai_dc');
      expect(res.status).toBe(200);
      expect(res.text).toContain('<dc:title>OAI Test Thesis on Machine Learning</dc:title>');
      expect(res.text).toContain('<dc:creator>OAI Student</dc:creator>');
      expect(res.text).toContain('<dc:publisher>Federal School of Statistics, Ibadan</dc:publisher>');
      expect(res.text).toContain('<dc:type>Text / Thesis</dc:type>');
    });

    it('7. GET /api/oai?verb=GetRecord returns individual item or 404 if missing', async () => {
      const validRes = await request(app).get(
        `/api/oai?verb=GetRecord&identifier=oai:fss.ng:theses/${testThesisId}&metadataPrefix=oai_dc`
      );
      expect(validRes.status).toBe(200);
      expect(validRes.text).toContain('<dc:title>OAI Test Thesis on Machine Learning</dc:title>');

      const missingRes = await request(app).get(
        '/api/oai?verb=GetRecord&identifier=oai:fss.ng:theses/00000000-0000-0000-0000-000000000000&metadataPrefix=oai_dc'
      );
      expect(missingRes.status).toBe(404);
      expect(missingRes.text).toContain('<error code="idDoesNotExist">');
    });
  });

  // --------------------------------------------------------------------------
  // Library Search Analytics & Demand Tracking Tests
  // --------------------------------------------------------------------------
  describe('Library Analytics & Unmet Demand API (/api/analytics)', () => {
    it('1. POST /api/analytics/log-search logs search queries including zero-hit demand', async () => {
      // Log zero-result query
      const res1 = await request(app)
        .post('/api/analytics/log-search')
        .send({ query: 'TEST_QUERY Deep Learning with PyTorch', scope: 'CATALOG', results_count: 0 });
      expect(res1.status).toBe(201);
      expect(res1.body.logged).toBe(true);

      // Log hit query with auth
      const res2 = await request(app)
        .post('/api/analytics/log-search')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ query: 'TEST_QUERY Analytics Test Book', scope: 'CATALOG', results_count: 5 });
      expect(res2.status).toBe(201);
      expect(res2.body.logged).toBe(true);
    });

    it('2. GET /api/analytics/search-demand returns unmet demand and top searches for staff', async () => {
      const res = await request(app)
        .get('/api/analytics/search-demand')
        .set('Authorization', `Bearer ${librarianToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.unmetDemand)).toBe(true);
      expect(Array.isArray(res.body.topSearches)).toBe(true);

      const unmetPyTorch = res.body.unmetDemand.find(
        (q: any) => q.query_text === 'TEST_QUERY Deep Learning with PyTorch'
      );
      expect(unmetPyTorch).toBeDefined();
      expect(unmetPyTorch.frequency).toBeGreaterThanOrEqual(1);
    });

    it('3. GET /api/analytics/summary returns accreditation metrics and circulation summary', async () => {
      const res = await request(app)
        .get('/api/analytics/summary')
        .set('Authorization', `Bearer ${librarianToken}`);
      expect(res.status).toBe(200);
      expect(res.body.physicalCatalog.total_titles).toBeGreaterThanOrEqual(1);
      expect(res.body.thesesRepository.total_theses_published).toBeGreaterThanOrEqual(1);
      expect(res.body.circulation).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Patron Bookshelf Tests
  // --------------------------------------------------------------------------
  describe('Patron Bookshelf API (/api/bookshelf)', () => {
    let shelfEntryId: string;

    it('1. POST /api/bookshelf saves a book to user bookshelf', async () => {
      const res = await request(app)
        .post('/api/bookshelf')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          item_type: 'BOOK',
          item_id: testBookId,
          shelf_status: 'CURRENTLY_READING',
          notes: 'SHELF_TEST Reading for upcoming exam',
        });
      expect(res.status).toBe(201);
      expect(res.body.item.item_id).toBe(testBookId);
      expect(res.body.item.shelf_status).toBe('CURRENTLY_READING');
      shelfEntryId = res.body.item.id;
    });

    it('2. GET /api/bookshelf lists saved items with resolved book details', async () => {
      const res = await request(app)
        .get('/api/bookshelf')
        .set('Authorization', `Bearer ${studentToken}`);
      expect(res.status).toBe(200);
      expect(res.body.bookshelf.length).toBeGreaterThanOrEqual(1);

      const item = res.body.bookshelf.find((b: any) => b.id === shelfEntryId);
      expect(item).toBeDefined();
      expect(item.title).toBe('Analytics Test Book');
      expect(item.author_or_creator).toBe('Prof. Bayes');
    });

    it('3. DELETE /api/bookshelf/:id removes item from bookshelf', async () => {
      const res = await request(app)
        .delete(`/api/bookshelf/${shelfEntryId}`)
        .set('Authorization', `Bearer ${studentToken}`);
      expect(res.status).toBe(200);

      const check = await request(app)
        .get('/api/bookshelf')
        .set('Authorization', `Bearer ${studentToken}`);
      const item = check.body.bookshelf.find((b: any) => b.id === shelfEntryId);
      expect(item).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // Course Reserves Tests
  // --------------------------------------------------------------------------
  describe('Course Reserves API (/api/courses/:id/reserves)', () => {
    let reserveId: string;

    it('1. Assigned Lecturer adds physical book as REQUIRED syllabus reserve', async () => {
      const res = await request(app)
        .post(`/api/courses/${testCourseId}/reserves`)
        .set('Authorization', `Bearer ${lecturerToken}`)
        .send({
          item_type: 'BOOK',
          item_id: testBookId,
          requirement_level: 'REQUIRED',
          notes: 'RESERVE_TEST Essential textbook chapters 1-5',
        });
      expect(res.status).toBe(201);
      expect(res.body.reserve.requirement_level).toBe('REQUIRED');
      reserveId = res.body.reserve.id;
    });

    it('2. Student can retrieve syllabus course reserves', async () => {
      const res = await request(app)
        .get(`/api/courses/${testCourseId}/reserves`)
        .set('Authorization', `Bearer ${studentToken}`);
      expect(res.status).toBe(200);
      expect(res.body.reserves.length).toBeGreaterThanOrEqual(1);

      const reserve = res.body.reserves.find((r: any) => r.id === reserveId);
      expect(reserve).toBeDefined();
      expect(reserve.title).toBe('Analytics Test Book');
      expect(reserve.requirement_level).toBe('REQUIRED');
    });

    it('3. Lecturer can remove item from course reserves', async () => {
      const res = await request(app)
        .delete(`/api/courses/${testCourseId}/reserves/${reserveId}`)
        .set('Authorization', `Bearer ${lecturerToken}`);
      expect(res.status).toBe(200);

      const check = await request(app)
        .get(`/api/courses/${testCourseId}/reserves`)
        .set('Authorization', `Bearer ${studentToken}`);
      const reserve = check.body.reserves.find((r: any) => r.id === reserveId);
      expect(reserve).toBeUndefined();
    });
  });
});
