import { pool } from './pool.js';

export async function seedDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    console.log('[Seed] Seeding sample academic departments...');
    await client.query('BEGIN');

    // 1. Departments (6 departments specified in Context)
    const departments = [
      { code: 'CS', name: 'Computer Science', description: 'Department of Computer Science (ND & HND)' },
      { code: 'AI', name: 'Artificial Intelligence', description: 'Department of Artificial Intelligence & Machine Learning' },
      { code: 'NCC', name: 'Networking & Cloud Computing', description: 'Department of Networking and Cloud Computing' },
      { code: 'STA', name: 'Statistics', description: 'Department of Statistics (Foundational discipline at FSS-IB)' },
      { code: 'ACC', name: 'Accountancy', description: 'Department of Accountancy & Financial Studies' },
      { code: 'BA', name: 'Business Administration', description: 'Department of Business Administration & Management' },
    ];

    const deptMap = new Map<string, number>();

    for (const d of departments) {
      const res = await client.query(
        `INSERT INTO departments (code, name, description)
         VALUES ($1, $2, $3)
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
         RETURNING id, code;`,
        [d.code, d.name, d.description]
      );
      deptMap.set(res.rows[0].code, res.rows[0].id);
    }

    // 2. Sample Courses (Clearly labelled as [SAMPLE] to prevent inventing institutional facts)
    console.log('[Seed] Seeding sample courses...');
    const courses = [
      // CS
      { code: 'COM111', title: '[SAMPLE] Introduction to Computer Programming', dept: 'CS', prog: 'ND', lvl: 1, sem: 1, units: 3 },
      { code: 'COM122', title: '[SAMPLE] Data Structures & Algorithms', dept: 'CS', prog: 'ND', lvl: 1, sem: 2, units: 3 },
      { code: 'COM311', title: '[SAMPLE] Advanced Web Technologies & APIs', dept: 'CS', prog: 'HND', lvl: 1, sem: 1, units: 3 },
      // AI
      { code: 'AIM111', title: '[SAMPLE] Foundations of AI & Machine Learning', dept: 'AI', prog: 'ND', lvl: 1, sem: 1, units: 3 },
      { code: 'AIM211', title: '[SAMPLE] Deep Learning & Computer Vision', dept: 'AI', prog: 'ND', lvl: 2, sem: 1, units: 3 },
      { code: 'AIM311', title: '[SAMPLE] Applied Generative Models & LLMs', dept: 'AI', prog: 'HND', lvl: 1, sem: 1, units: 3 },
      // NCC
      { code: 'NCC111', title: '[SAMPLE] Computer Network Fundamentals', dept: 'NCC', prog: 'ND', lvl: 1, sem: 1, units: 3 },
      { code: 'NCC211', title: '[SAMPLE] Routing, Switching & Packet Tracer Labs', dept: 'NCC', prog: 'ND', lvl: 2, sem: 1, units: 3 },
      { code: 'NCC311', title: '[SAMPLE] Cloud Architecture (AWS/Azure/GCP)', dept: 'NCC', prog: 'HND', lvl: 1, sem: 1, units: 3 },
      // STA
      { code: 'STA111', title: '[SAMPLE] Descriptive Statistics & Probability', dept: 'STA', prog: 'ND', lvl: 1, sem: 1, units: 3 },
      { code: 'STA211', title: '[SAMPLE] Statistical Computing with R & Python', dept: 'STA', prog: 'ND', lvl: 2, sem: 1, units: 3 },
      { code: 'STA311', title: '[SAMPLE] Econometric Analysis & NBS Data Modeling', dept: 'STA', prog: 'HND', lvl: 1, sem: 1, units: 3 },
      // ACC
      { code: 'ACC111', title: '[SAMPLE] Principles of Financial Accounting I', dept: 'ACC', prog: 'ND', lvl: 1, sem: 1, units: 3 },
      { code: 'ACC211', title: '[SAMPLE] Auditing & IFRS Reporting Standards', dept: 'ACC', prog: 'ND', lvl: 2, sem: 1, units: 3 },
      // BA
      { code: 'BAM111', title: '[SAMPLE] Introduction to Business Management', dept: 'BA', prog: 'ND', lvl: 1, sem: 1, units: 3 },
      { code: 'BAM211', title: '[SAMPLE] Entrepreneurship & Feasibility Case Studies', dept: 'BA', prog: 'ND', lvl: 2, sem: 1, units: 3 },
    ];

    for (const c of courses) {
      await client.query(
        `INSERT INTO courses (code, title, department_id, programme, level, semester, credit_units)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (code) DO UPDATE SET title = EXCLUDED.title;`,
        [c.code, c.title, deptMap.get(c.dept), c.prog, c.lvl, c.sem, c.units]
      );
    }

    // 3. Admissions Master List (Clearly labelled fake sample records for matching verification)
    console.log('[Seed] Seeding sample admissions master list...');
    const admissions = [
      { matric: 'FSS/ND/CS/2025/001', email: 'sample.student1@fss-ibadan.edu.ng', name: 'Sample Student One', dept: 'CS', prog: 'ND', lvl: 1, sess: '2025/2026' },
      { matric: 'FSS/ND/CS/2025/002', email: 'sample.student2@fss-ibadan.edu.ng', name: 'Sample Student Two', dept: 'CS', prog: 'ND', lvl: 1, sess: '2025/2026' },
      { matric: 'FSS/ND/AI/2025/001', email: 'sample.student3@fss-ibadan.edu.ng', name: 'Sample Student Three', dept: 'AI', prog: 'ND', lvl: 1, sess: '2025/2026' },
      { matric: 'FSS/HND/STA/2025/001', email: 'sample.student4@fss-ibadan.edu.ng', name: 'Sample Student Four', dept: 'STA', prog: 'HND', lvl: 1, sess: '2025/2026' },
      { matric: 'FSS/ND/ACC/2025/001', email: 'sample.student5@fss-ibadan.edu.ng', name: 'Sample Student Five', dept: 'ACC', prog: 'ND', lvl: 1, sess: '2025/2026' },
    ];

    for (const a of admissions) {
      await client.query(
        `INSERT INTO admissions_master_list (matric_no, email, full_name, department_id, programme, level, entry_session)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (matric_no) DO NOTHING;`,
        [a.matric, a.email, a.name, deptMap.get(a.dept), a.prog, a.lvl, a.sess]
      );
    }

    // 4. Physical Library Catalog Items
    console.log('[Seed] Seeding sample physical library catalog items...');
    const libraryItems = [
      { title: '[SAMPLE] Modern Operating Systems', author: 'Andrew S. Tanenbaum', isbn: '978-0133591620', call: 'QA76.76.O63 T35', shelf: 'Shelf B-04, CompSci Wing', copies_tot: 4, copies_avail: 3, dept: 'CS' },
      { title: '[SAMPLE] Artificial Intelligence: A Modern Approach', author: 'Stuart Russell & Peter Norvig', isbn: '978-0136042594', call: 'Q335 .R86', shelf: 'Shelf C-01, AI Section', copies_tot: 3, copies_avail: 2, dept: 'AI' },
      { title: '[SAMPLE] Computer Networks', author: 'Larry L. Peterson & Bruce S. Davie', isbn: '978-0123850591', call: 'TK5105.5 .P47', shelf: 'Shelf B-08, Networking Wing', copies_tot: 5, copies_avail: 5, dept: 'NCC' },
      { title: '[SAMPLE] Mathematical Statistics with Applications', author: 'Dennis Wackerly', isbn: '978-0495110811', call: 'QA276 .W28', shelf: 'Shelf A-02, Statistics Main', copies_tot: 8, copies_avail: 6, dept: 'STA' },
      { title: '[SAMPLE] Financial & Managerial Accounting', author: 'Jan Williams & Mark Bettner', isbn: '978-1259692406', call: 'HF5635 .W69', shelf: 'Shelf D-03, Accountancy Section', copies_tot: 6, copies_avail: 4, dept: 'ACC' },
      { title: '[SAMPLE] Contemporary Management', author: 'Gareth Jones & Jennifer George', isbn: '978-1260076721', call: 'HD31 .J62', shelf: 'Shelf E-01, Management Wing', copies_tot: 4, copies_avail: 2, dept: 'BA' },
    ];

    for (const item of libraryItems) {
      await client.query(
        `INSERT INTO library_items (title, author, isbn, call_number, shelf_location, copies_total, copies_available, department_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
        [item.title, item.author, item.isbn, item.call, item.shelf, item.copies_tot, item.copies_avail, deptMap.get(item.dept)]
      );
    }

    await client.query('COMMIT');
    console.log('[Seed] Database seed completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Seed] Database seed failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

// CLI runner
if (process.argv[1]?.includes('seed')) {
  seedDatabase()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error(err);
      await pool.end();
      process.exit(1);
    });
}

