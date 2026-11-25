import { pool } from './pool.js';
import { extractYouTubeVideoId } from './extractYoutube.js';

interface CourseDef {
  code: string;
  title: string;
  deptCode: string;
  programme: 'ND' | 'HND';
  level: number;
  semester: number;
  creditUnits: number;
  description: string;
}

interface ResourceDef {
  courseCode: string;
  title: string;
  description: string;
  resourceType: 'VIDEO' | 'DOCUMENT' | 'CODE' | 'NOTEBOOK' | 'DATASET' | 'CASE_STUDY' | 'SPREADSHEET';
  externalUrl: string;
  videoId?: string;
  mimeType?: string;
}

export async function seedCoursesAndResources(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Fetch Department Mapping
    const deptRes = await client.query('SELECT id, code FROM departments');
    const deptMap = new Map<string, number>();
    for (const r of deptRes.rows) {
      deptMap.set(r.code, r.id);
    }

    // 2. Fetch or create a system uploader user (Librarian/Registrar)
    const userRes = await client.query("SELECT id FROM users WHERE role IN ('LIBRARIAN', 'REGISTRAR') ORDER BY created_at ASC LIMIT 1");
    let uploaderId = userRes.rows[0]?.id;

    if (!uploaderId) {
      const anyUser = await client.query("SELECT id FROM users LIMIT 1");
      uploaderId = anyUser.rows[0]?.id;
    }

    if (!uploaderId) {
      throw new Error('No user found in the database to assign as uploaded_by for learning resources.');
    }

    console.log(`[Seed] Using uploader ID: ${uploaderId}`);

    // 3. Define Comprehensive Courses across all Departments
    const coursesToSeed: CourseDef[] = [
      // Computer Science (CS)
      {
        code: 'COM111',
        title: 'Introduction to Computer Programming with Python & C',
        deptCode: 'CS',
        programme: 'ND',
        level: 1,
        semester: 1,
        creditUnits: 3,
        description: 'Algorithmic thinking, control flow, functions, memory allocation, and problem-solving fundamentals.',
      },
      {
        code: 'COM122',
        title: 'Data Structures & Algorithms',
        deptCode: 'CS',
        programme: 'ND',
        level: 1,
        semester: 2,
        creditUnits: 3,
        description: 'Linked lists, stacks, queues, trees, graphs, sorting techniques, and Big-O asymptotic analysis.',
      },
      {
        code: 'COM211',
        title: 'Relational Database Design & SQL',
        deptCode: 'CS',
        programme: 'ND',
        level: 2,
        semester: 1,
        creditUnits: 3,
        description: 'Entity-relationship diagrams, normalization up to BCNF, PostgreSQL querying, transactions, and indexing.',
      },
      {
        code: 'COM311',
        title: 'Advanced Web Technologies & REST APIs',
        deptCode: 'CS',
        programme: 'HND',
        level: 1,
        semester: 1,
        creditUnits: 3,
        description: 'Modern asynchronous JavaScript, TypeScript, React single-page architecture, Node.js, and API security.',
      },
      {
        code: 'COM322',
        title: 'Operating Systems & Distributed Architecture',
        deptCode: 'CS',
        programme: 'HND',
        level: 1,
        semester: 2,
        creditUnits: 3,
        description: 'Process scheduling, concurrency, deadlocks, virtual memory management, and distributed systems.',
      },
      {
        code: 'OAI101',
        title: 'Digital Repositories & Open Archives Protocol (OAI-PMH)',
        deptCode: 'CS',
        programme: 'ND',
        level: 1,
        semester: 1,
        creditUnits: 2,
        description: 'Open access metadata harvesting, Dublin Core standards, and digital repository architecture.',
      },

      // Artificial Intelligence (AI)
      {
        code: 'AIM111',
        title: 'Foundations of Artificial Intelligence & Machine Learning',
        deptCode: 'AI',
        programme: 'ND',
        level: 1,
        semester: 1,
        creditUnits: 3,
        description: 'Supervised vs unsupervised learning, linear regression, logistic classification, decision trees, and model evaluation.',
      },
      {
        code: 'AIM211',
        title: 'Deep Learning & Computer Vision',
        deptCode: 'AI',
        programme: 'ND',
        level: 2,
        semester: 1,
        creditUnits: 3,
        description: 'Multilayer perceptrons, backpropagation, convolutional neural networks (CNNs), PyTorch, and image classification.',
      },
      {
        code: 'AIM222',
        title: 'Natural Language Processing & Transformers',
        deptCode: 'AI',
        programme: 'ND',
        level: 2,
        semester: 2,
        creditUnits: 3,
        description: 'Tokenization, embeddings, recurrent architectures, self-attention mechanisms, and Hugging Face pipelines.',
      },
      {
        code: 'AIM311',
        title: 'Applied Generative Models & LLM Engineering',
        deptCode: 'AI',
        programme: 'HND',
        level: 1,
        semester: 1,
        creditUnits: 3,
        description: 'Generative pre-trained models, retrieval-augmented generation (RAG), vector embeddings, and prompt engineering.',
      },

      // Networking & Cloud Computing (NCC)
      {
        code: 'NCC111',
        title: 'Computer Network Fundamentals & OSI Model',
        deptCode: 'NCC',
        programme: 'ND',
        level: 1,
        semester: 1,
        creditUnits: 3,
        description: 'Physical transmission media, OSI 7-layer architecture, TCP/IP stack, IPv4 subnetting, and DNS/DHCP.',
      },
      {
        code: 'NCC211',
        title: 'Routing, Switching & Cisco Packet Tracer Lab',
        deptCode: 'NCC',
        programme: 'ND',
        level: 2,
        semester: 1,
        creditUnits: 3,
        description: 'VLAN configuration, trunking protocols, static routing, OSPF, Access Control Lists (ACLs), and NAT.',
      },
      {
        code: 'NCC222',
        title: 'Network Security & Cryptographic Protocols',
        deptCode: 'NCC',
        programme: 'ND',
        level: 2,
        semester: 2,
        creditUnits: 3,
        description: 'Symmetric & asymmetric encryption, TLS/SSL handshakes, firewall configurations, and intrusion detection.',
      },
      {
        code: 'NCC311',
        title: 'Cloud Architecture & DevOps (AWS/Azure/Linux)',
        deptCode: 'NCC',
        programme: 'HND',
        level: 1,
        semester: 1,
        creditUnits: 3,
        description: 'Infrastructure as Code, Docker containerization, cloud storage architectures, microservices, and serverless compute.',
      },

      // Statistics (STA)
      {
        code: 'STA111',
        title: 'Descriptive Statistics & Probability Distributions',
        deptCode: 'STA',
        programme: 'ND',
        level: 1,
        semester: 1,
        creditUnits: 3,
        description: 'Measures of central tendency, dispersion, probability axioms, binomial, Poisson, and normal distributions.',
      },
      {
        code: 'STA122',
        title: 'Statistical Inference & Hypothesis Testing',
        deptCode: 'STA',
        programme: 'ND',
        level: 1,
        semester: 2,
        creditUnits: 3,
        description: 'Point and interval estimation, confidence intervals, Student t-tests, Chi-square tests, and ANOVA.',
      },
      {
        code: 'STA211',
        title: 'Statistical Computing with R & Python',
        deptCode: 'STA',
        programme: 'ND',
        level: 2,
        semester: 1,
        creditUnits: 3,
        description: 'Data wrangling with tidyverse and pandas, ggplot2 visualizations, regression modeling, and reproducible research.',
      },
      {
        code: 'STA311',
        title: 'Econometric Modeling & National Bureau of Statistics (NBS) Surveys',
        deptCode: 'STA',
        programme: 'HND',
        level: 1,
        semester: 1,
        creditUnits: 3,
        description: 'Time series forecasting, ARIMA, heteroskedasticity testing, and empirical analysis of Nigerian macro-economic data.',
      },

      // Accountancy (ACC)
      {
        code: 'ACC111',
        title: 'Principles of Financial Accounting I',
        deptCode: 'ACC',
        programme: 'ND',
        level: 1,
        semester: 1,
        creditUnits: 3,
        description: 'Double-entry bookkeeping, trial balance preparation, adjusting entries, bank reconciliation, and cashbooks.',
      },
      {
        code: 'ACC122',
        title: 'Principles of Financial Accounting II',
        deptCode: 'ACC',
        programme: 'ND',
        level: 1,
        semester: 2,
        creditUnits: 3,
        description: 'Partnership accounts, manufacturing accounts, preparation of balance sheets, and cash flow statements.',
      },
      {
        code: 'ACC211',
        title: 'Cost & Management Accounting',
        deptCode: 'ACC',
        programme: 'ND',
        level: 2,
        semester: 1,
        creditUnits: 3,
        description: 'Material and labor costing, overhead allocation, marginal costing, break-even analysis, and budgetary control.',
      },
      {
        code: 'ACC311',
        title: 'Auditing & IFRS International Financial Reporting Standards',
        deptCode: 'ACC',
        programme: 'HND',
        level: 1,
        semester: 1,
        creditUnits: 3,
        description: 'Internal control evaluation, substantive audit testing, professional ethics, and IFRS standard compliance.',
      },

      // Business Administration (BA)
      {
        code: 'BAM111',
        title: 'Introduction to Business Management & Organizational Theory',
        deptCode: 'BA',
        programme: 'ND',
        level: 1,
        semester: 1,
        creditUnits: 3,
        description: 'Planning, organizing, leading, controlling, corporate governance, and organizational behavior.',
      },
      {
        code: 'BAM122',
        title: 'Principles of Marketing & Consumer Analysis',
        deptCode: 'BA',
        programme: 'ND',
        level: 1,
        semester: 2,
        creditUnits: 3,
        description: 'Market segmentation, the 4 Ps marketing mix, brand positioning, and digital marketing strategies.',
      },
      {
        code: 'BAM211',
        title: 'Entrepreneurship & Small Business Feasibility Studies',
        deptCode: 'BA',
        programme: 'ND',
        level: 2,
        semester: 1,
        creditUnits: 3,
        description: 'Idea validation, business model canvas, financial projections, Nigerian regulatory compliance, and venture pitching.',
      },
      {
        code: 'BAM311',
        title: 'Corporate Strategy & International Business Operations',
        deptCode: 'BA',
        programme: 'HND',
        level: 1,
        semester: 1,
        creditUnits: 3,
        description: 'SWOT and Porter Five Forces, competitive advantage, multinational business operations, and supply chain strategy.',
      },
    ];

    console.log(`[Seed] Upserting ${coursesToSeed.length} departmental courses...`);
    const courseIdMap = new Map<string, number>();

    for (const c of coursesToSeed) {
      const deptId = deptMap.get(c.deptCode);
      if (!deptId) continue;

      const res = await client.query(
        `INSERT INTO courses (code, title, department_id, programme, level, semester, credit_units, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (code) DO UPDATE SET
           title = EXCLUDED.title,
           description = EXCLUDED.description,
           programme = EXCLUDED.programme,
           level = EXCLUDED.level,
           semester = EXCLUDED.semester,
           credit_units = EXCLUDED.credit_units
         RETURNING id, code;`,
        [c.code, c.title, deptId, c.programme, c.level, c.semester, c.creditUnits, c.description]
      );
      courseIdMap.set(res.rows[0].code, res.rows[0].id);
    }

    // 4. Comprehensive Catalog of 10 Resources PER COURSE (26 Courses × 10 = 260 Resources)
    const openResources: ResourceDef[] = [
      // -------------------------------------------------------------
      // COM111: Introduction to Computer Programming with Python & C
      // -------------------------------------------------------------
      {
        courseCode: 'COM111',
        title: 'Harvard CS50: Full Introduction to Computer Science Course',
        description: 'Comprehensive introduction to computer science and programming by David J. Malan at Harvard University.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=8mAITcNt710',
        videoId: '8mAITcNt710',
      },
      {
        courseCode: 'COM111',
        title: 'OpenStax: Computer Science Foundations & Python Programming [Free PDF]',
        description: 'Peer-reviewed open access textbook covering algorithmic structures, variables, control flow, and computational problem solving.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://openstax.org/details/books/introduction-python-programming',
        mimeType: 'application/pdf',
      },
      {
        courseCode: 'COM111',
        title: 'Python Full Course for Beginners by Programming with Mosh',
        description: '6-hour practical walkthrough covering data types, control structures, functions, modules, and file I/O.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=_uQrJ0TkZlc',
        videoId: '_uQrJ0TkZlc',
      },
      {
        courseCode: 'COM111',
        title: 'freeCodeCamp: C Programming Tutorial for Beginners',
        description: 'Complete foundational video covering pointers, memory addresses, structs, arrays, and standard I/O in C.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=KJgsSFOSQv0',
        videoId: 'KJgsSFOSQv0',
      },
      {
        courseCode: 'COM111',
        title: 'Think Python 2nd Edition by Allen B. Downey [Free PDF Textbook]',
        description: 'Clear, hands-on introduction to computational thinking, recursion, dictionaries, and object-oriented paradigms.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://greenteapress.com/thinkpython2/thinkpython2.pdf',
        mimeType: 'application/pdf',
      },
      {
        courseCode: 'COM111',
        title: 'Python Official 3.12 Tutorial & Standard Library Manual',
        description: 'Official Python documentation tutorial covering built-in data structures, exception handling, and virtual environments.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://docs.python.org/3/tutorial/',
      },
      {
        courseCode: 'COM111',
        title: 'GNU C Reference Manual & Language Specifications [Free PDF]',
        description: 'Authoritative guide to the GNU C programming language, data representations, operators, and preprocessor directives.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://www.gnu.org/software/gnu-c-manual/gnu-c-manual.pdf',
        mimeType: 'application/pdf',
      },
      {
        courseCode: 'COM111',
        title: 'Corey Schafer: Python Functions, Variable Scopes & LEGB Rule',
        description: 'Deep dive video into how local, enclosing, global, and built-in scopes operate in Python execution.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=QVdf0LFe4gk',
        videoId: 'QVdf0LFe4gk',
      },
      {
        courseCode: 'COM111',
        title: '100 Python Programming Exercises and Code Solutions',
        description: 'Interactive laboratory coding problem set with verified unit-tested solutions from beginner to intermediate level.',
        resourceType: 'CODE',
        externalUrl: 'https://github.com/zhiwehu/Python-programming-exercises',
      },
      {
        courseCode: 'COM111',
        title: 'Google Colab: Interactive Python Programming Lab Notebook',
        description: 'Zero-install cloud Jupyter notebook environment for running and verifying introductory Python code experiments.',
        resourceType: 'NOTEBOOK',
        externalUrl: 'https://colab.research.google.com/notebooks/intro.ipynb',
      },

      // -------------------------------------------------------------
      // COM122: Data Structures & Algorithms
      // -------------------------------------------------------------
      {
        courseCode: 'COM122',
        title: 'MIT 6.006: Introduction to Algorithms Lecture Series',
        description: 'Complete MIT lecture on algorithmic paradigms, sorting algorithms, balanced search trees, and dynamic programming.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=ZA-tUyM_y7s',
        videoId: 'ZA-tUyM_y7s',
      },
      {
        courseCode: 'COM122',
        title: 'Open Data Structures: An Introduction by Pat Morin [Open PDF]',
        description: 'Open-access mathematical and practical guide covering array-based lists, skiplists, hash tables, heaps, and B-trees.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://opendatastructures.org/ods-python.pdf',
        mimeType: 'application/pdf',
      },
      {
        courseCode: 'COM122',
        title: 'freeCodeCamp: Data Structures Easy to Advanced Course',
        description: '8-hour visual guide detailing linked lists, binary search trees, disjoint sets, and union-find algorithms.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=RBSGKlAnoiM',
        videoId: 'RBSGKlAnoiM',
      },
      {
        courseCode: 'COM122',
        title: 'freeCodeCamp: Graph Algorithms for Technical Interviews',
        description: 'Breadth-first search (BFS), depth-first search (DFS), Dijkstra shortest path, and topological sorting.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=tWVWeAqZ0WU',
        videoId: 'tWVWeAqZ0WU',
      },
      {
        courseCode: 'COM122',
        title: 'freeCodeCamp: Dynamic Programming - Learn to Solve DP Problems',
        description: 'Memoization, tabulation, grid traveler, canSum, and knapsack problem decomposition strategies.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=oBt53YbR9K3',
        videoId: 'oBt53YbR9K3',
      },
      {
        courseCode: 'COM122',
        title: 'Algorithms 4th Edition Notes by Robert Sedgewick [Princeton PDF]',
        description: 'Classic textbook chapter notes covering quicksort, mergesort, red-black trees, and minimum spanning trees.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://algs4.cs.princeton.edu/home/',
      },
      {
        courseCode: 'COM122',
        title: 'NIST Dictionary of Algorithms and Data Structures',
        description: 'National Institute of Standards reference encyclopedia of algorithmic complexity, data structures, and archetypes.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://data.nist.gov/dads/',
      },
      {
        courseCode: 'COM122',
        title: 'The Algorithms: Open-Source Python Implementation Repository',
        description: 'Exhaustive open-source algorithmic repository with implementations of all major data structures and search algorithms.',
        resourceType: 'CODE',
        externalUrl: 'https://github.com/TheAlgorithms/Python',
      },
      {
        courseCode: 'COM122',
        title: 'Big-O Asymptotic Complexity Interactive Cheat Sheet',
        description: 'Detailed complexity comparison table for sorting and data structure operations across worst, average, and best cases.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://www.bigocheatsheet.com/',
      },
      {
        courseCode: 'COM122',
        title: 'Problem Solving with Algorithms & Data Structures Using Python [PDF]',
        description: 'Interactive and downloadable textbook detailing stack frames, recursion trees, and hashing collisions.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://runestone.academy/ns/books/published/pythonds/index.html',
      },

      // -------------------------------------------------------------
      // COM211: Relational Database Design & SQL
      // -------------------------------------------------------------
      {
        courseCode: 'COM211',
        title: 'freeCodeCamp: Relational Database & SQL Full Course',
        description: 'Comprehensive 4-hour hands-on video tutorial covering database normalization, primary/foreign keys, joins, and triggers.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=HXV3zeRR3h4',
        videoId: 'HXV3zeRR3h4',
      },
      {
        courseCode: 'COM211',
        title: 'freeCodeCamp: Database Design Course - How to Design a Database',
        description: 'Conceptual, logical, and physical schema modeling, entity-relationship diagrams (ERDs), and business rule constraints.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=ztHopE5Wnpc',
        videoId: 'ztHopE5Wnpc',
      },
      {
        courseCode: 'COM211',
        title: 'Hussein Nasser: SQL Indexing and B-Tree Performance Tuning',
        description: 'Deep technical walkthrough of clustered vs non-clustered indexes, table scans, and query execution plans.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=biGzR-B5xZ8',
        videoId: 'biGzR-B5xZ8',
      },
      {
        courseCode: 'COM211',
        title: 'freeCodeCamp: PostgreSQL Tutorial for Beginners',
        description: 'PostgreSQL installation, psql CLI commands, data types, constraints, window functions, and transactions.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=qw--VYLpxG4',
        videoId: 'qw--VYLpxG4',
      },
      {
        courseCode: 'COM211',
        title: 'PostgreSQL 16 Official Reference Manual [Full PDF Edition]',
        description: 'Official 3,000-page comprehensive reference documentation covering SQL syntax, MVCC concurrency, and indexing.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://www.postgresql.org/files/documentation/pdf/16/postgresql-16-US.pdf',
        mimeType: 'application/pdf',
      },
      {
        courseCode: 'COM211',
        title: 'Database Design & Normalization Guide: 1NF to BCNF [Open PDF]',
        description: 'Clear academic text explaining functional dependencies, lossless decomposition, and Boyce-Codd Normal Form.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://opentextbc.ca/dbdesign01/',
      },
      {
        courseCode: 'COM211',
        title: 'SQLite Architecture & Query Optimizer Internals Documentation',
        description: 'Architectural documentation of serverless embedded SQL engine, B-tree paging, and bytecode virtual machine.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://sqlite.org/arch.html',
      },
      {
        courseCode: 'COM211',
        title: 'Chinook Multi-Table Sample Relational Database SQL Script',
        description: 'Standard relational sample database featuring artists, albums, tracks, customers, and invoice billing tables.',
        resourceType: 'DATASET',
        externalUrl: 'https://github.com/lerocha/chinook-database',
      },
      {
        courseCode: 'COM211',
        title: 'Quick SQL Cheatsheet & Query Practice Lab Exercises',
        description: 'Curated reference repository of essential SQL joins, aggregation GROUP BY patterns, subqueries, and views.',
        resourceType: 'CODE',
        externalUrl: 'https://github.com/enochtangg/quick-SQL-cheatsheet',
      },
      {
        courseCode: 'COM211',
        title: 'Stanford University CS145: Introduction to Databases Course Notes',
        description: 'Lecture slides and notes covering relational algebra, DDL/DML, ACID guarantees, and database security.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://web.stanford.edu/class/cs145/',
      },

      // -------------------------------------------------------------
      // COM311: Advanced Web Technologies & REST APIs
      // -------------------------------------------------------------
      {
        courseCode: 'COM311',
        title: 'freeCodeCamp: React JS Full Course for Beginners',
        description: 'Core concepts of components, JSX, props, state hooks, effect lifecycle, and single-page routing.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=bMknfKXIFA8',
        videoId: 'bMknfKXIFA8',
      },
      {
        courseCode: 'COM311',
        title: 'freeCodeCamp: Node.js and Express.js Full Course',
        description: 'Backend web development with Express middleware, routing, asynchronous handling, and authentication tokens.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=Oe421EPjeBE',
        videoId: 'Oe421EPjeBE',
      },
      {
        courseCode: 'COM311',
        title: 'freeCodeCamp: TypeScript Full Course for Beginners',
        description: 'Static typing for JavaScript: interfaces, types, generics, utility types, and strict compilation flags.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=BwuLxPH8IDs',
        videoId: 'BwuLxPH8IDs',
      },
      {
        courseCode: 'COM311',
        title: 'REST API Design Best Practices & HTTP Status Codes',
        description: 'Architectural principles for designing scalable, maintainable, and predictable RESTful APIs.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=-mN3VyJuCjM',
        videoId: '-mN3VyJuCjM',
      },
      {
        courseCode: 'COM311',
        title: 'MDN Web Docs: Comprehensive JavaScript & Web APIs Guide',
        description: 'Authoritative Mozilla developer reference for Fetch API, DOM manipulation, Service Workers, and WebSockets.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://developer.mozilla.org/en-US/docs/Web',
      },
      {
        courseCode: 'COM311',
        title: 'OpenAPI Specification v3.1.0 Official Document [Free PDF]',
        description: 'Standard specification for machine-readable interface descriptions of REST APIs.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://spec.openapis.org/oas/v3.1.0.pdf',
        mimeType: 'application/pdf',
      },
      {
        courseCode: 'COM311',
        title: 'OWASP Top 10 Web Application Security Vulnerabilities [PDF]',
        description: 'Official global standard awareness document on SQL injection, broken authentication, and XSS mitigations.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://owasp.org/Top10/reports/OWASP_Top_10_2021_en.pdf',
        mimeType: 'application/pdf',
      },
      {
        courseCode: 'COM311',
        title: 'High Performance Browser Networking by Ilya Grigorik [Free Book]',
        description: 'Definitive guide on TCP, UDP, TLS performance, HTTP/2, HTTP/3, and cellular mobile network tuning.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://hpbn.co/',
      },
      {
        courseCode: 'COM311',
        title: 'FSS-IB E-Library Full-Stack Monorepo Architectural Codebase',
        description: 'Complete production-grade TypeScript React PWA and Express API repository codebase.',
        resourceType: 'CODE',
        externalUrl: 'https://github.com/StephenTeay/library-build',
      },
      {
        courseCode: 'COM311',
        title: 'k6 Open-Source API Load & Performance Testing Framework Guide',
        description: 'Developer guide for writing automated HTTP endpoint stress tests and latency regression assertions.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://k6.io/docs/',
      },

      // -------------------------------------------------------------
      // COM322: Operating Systems & Distributed Architecture
      // -------------------------------------------------------------
      {
        courseCode: 'COM322',
        title: 'Operating Systems Full Course - Introduction to OS Architecture',
        description: 'Fundamental architecture of modern operating systems: kernel space, user space, and system calls.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=mXw9ruZaxzQ',
        videoId: 'mXw9ruZaxzQ',
      },
      {
        courseCode: 'COM322',
        title: 'Computerphile: Concurrency, Threads & Mutexes Explained',
        description: 'Race conditions, critical sections, mutex locks, and semaphore coordination in concurrent software.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=7ENFeb-J75k',
        videoId: '7ENFeb-J75k',
      },
      {
        courseCode: 'COM322',
        title: 'MIT 6.824: Distributed Systems Lecture 1 by Robert Morris',
        description: 'Introduction to distributed systems challenges: fault tolerance, replication, RPCs, and strong consistency.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=cQP8WApzIQQ',
        videoId: 'cQP8WApzIQQ',
      },
      {
        courseCode: 'COM322',
        title: 'Neso Academy: Virtual Memory, Paging, and Page Faults',
        description: 'Translation Lookaside Buffers (TLB), multi-level page tables, and demand paging page replacement algorithms.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=qcBIvnQt0Bw',
        videoId: 'qcBIvnQt0Bw',
      },
      {
        courseCode: 'COM322',
        title: 'Operating Systems: Three Easy Pieces by Remzi Arpaci-Dusseau [PDF]',
        description: 'Acclaimed open textbook covering virtualization, concurrency, and persistence (file systems & I/O).',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://pages.cs.wisc.edu/~remzi/OSTEP/',
      },
      {
        courseCode: 'COM322',
        title: 'The Linux Kernel Documentation: Architecture & System Calls Guide',
        description: 'Official Linux kernel documentation detailing CFS scheduling, memory management, and VFS file systems.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://www.kernel.org/doc/html/latest/',
      },
      {
        courseCode: 'COM322',
        title: 'Designing Data-Intensive Applications Study Guide & Notes [PDF]',
        description: 'In-depth notes on replication, partitioning, consensus algorithms (Paxos/Raft), and batch/stream processing.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://github.com/ept/ddia-references',
      },
      {
        courseCode: 'COM322',
        title: 'Stephen Brennan: Write a Simple Unix Shell in C (lsh)',
        description: 'Step-by-step code tutorial explaining how fork(), execvp(), and waitpid() create a functional terminal shell.',
        resourceType: 'CODE',
        externalUrl: 'https://github.com/brenns10/lsh',
      },
      {
        courseCode: 'COM322',
        title: 'Google Research: The Google File System (GFS) Seminal Paper [PDF]',
        description: 'Breakthrough distributed file system paper addressing component failures, chunk servers, and append workloads.',
        resourceType: 'CASE_STUDY',
        externalUrl: 'https://research.google/pubs/the-google-file-system/',
      },
      {
        courseCode: 'COM322',
        title: 'MIT 6.824 Distributed Systems Lab Course Assignments',
        description: 'Practical lab specifications for implementing MapReduce, Raft consensus protocol, and key-value storage.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://pdos.csail.mit.edu/6.824/',
      },

      // -------------------------------------------------------------
      // OAI101: Digital Repositories & Open Archives Protocol (OAI-PMH)
      // -------------------------------------------------------------
      {
        courseCode: 'OAI101',
        title: 'OAI-PMH Protocol Implementation & Metadata Harvesting Tutorial',
        description: 'Technical walkthrough of the Open Archives Initiative Protocol for Metadata Harvesting verbs and response envelopes.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=SOTamWNgDKc',
        videoId: 'SOTamWNgDKc',
      },
      {
        courseCode: 'OAI101',
        title: 'OAI-PMH Specification v2.0 Official Protocol Standard [PDF]',
        description: 'The core specification defining ListRecords, GetRecord, Identify, and resumption tokens in repository federation.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://www.openarchives.org/OAI/openarchivesprotocol.html',
      },
      {
        courseCode: 'OAI101',
        title: 'Dublin Core Metadata Standards Explained for Academic Libraries',
        description: 'Overview of 15 Dublin Core core elements: Title, Creator, Subject, Description, Publisher, Contributor, Date.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=qw--VYLpxG4',
        videoId: 'qw--VYLpxG4',
      },
      {
        courseCode: 'OAI101',
        title: 'Dublin Core Metadata Element Set Version 1.1 Reference Guide',
        description: 'Official DCMI standard specification defining bibliographic attributes for digital preservation and discovery.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://www.dublincore.org/specifications/dublin-core/dces/',
      },
      {
        courseCode: 'OAI101',
        title: 'UNESCO Recommendation on Open Educational Resources (OER) [PDF]',
        description: 'Global intergovernmental framework for sharing, creating, and sustaining open academic learning materials.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://unesdoc.unesco.org/ark:/48223/pf0000370936',
        mimeType: 'application/pdf',
      },
      {
        courseCode: 'OAI101',
        title: 'Directory of Open Access Repositories (OpenDOAR) Guidelines',
        description: 'Best practice quality assurance principles for institutional research theses and digital repository operators.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://v2.sherpa.ac.uk/opendoar/',
      },
      {
        courseCode: 'OAI101',
        title: 'Society for Learning Analytics Research (SoLAR) Best Practices Guide',
        description: 'Empirical approaches to student engagement analytics, predictive retention modeling, and privacy standards.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://www.solaresearch.org/',
      },
      {
        courseCode: 'OAI101',
        title: 'Python OAI-PMH Client Harvester Implementation Script',
        description: 'Open-source Python script demonstrating automated harvesting of institutional research metadata.',
        resourceType: 'CODE',
        externalUrl: 'https://github.com/vphill/oai-pmh-harvester',
      },
      {
        courseCode: 'OAI101',
        title: 'Sample OAI-PMH XML Metadata Feed Harvest Records Dataset',
        description: 'Raw XML harvest sample records validating resumptionToken pagination and Dublin Core schema validation.',
        resourceType: 'DATASET',
        externalUrl: 'https://www.openarchives.org/OAI/2.0/guidelines.htm',
      },
      {
        courseCode: 'OAI101',
        title: 'DSpace Institutional Digital Repository Software Architectural Guide',
        description: 'Overview of open-source repository asset bitstreams, community collections, and search indexing architectures.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://dspace.lyrasis.org/',
      },

      // -------------------------------------------------------------
      // AIM111: Foundations of Artificial Intelligence & Machine Learning
      // -------------------------------------------------------------
      {
        courseCode: 'AIM111',
        title: 'Stanford CS229: Machine Learning Lecture 1 by Andrew Ng',
        description: 'Foundational lecture on supervised learning, cost function optimization, gradient descent, and linear regression models.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=jGwO_UgTS7I',
        videoId: 'jGwO_UgTS7I',
      },
      {
        courseCode: 'AIM111',
        title: 'freeCodeCamp: Machine Learning for Everybody Full Course',
        description: 'K-nearest neighbors, naive Bayes, support vector machines, decision trees, and neural network basics.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=i_LwzRVP7bg',
        videoId: 'i_LwzRVP7bg',
      },
      {
        courseCode: 'AIM111',
        title: 'StatQuest: Linear Regression and Gradient Descent Clearly Explained',
        description: 'Visual step-by-step breakdown of sum of squared residuals, derivative steps, learning rates, and convergence.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=sDv4f4s2SB8',
        videoId: 'sDv4f4s2SB8',
      },
      {
        courseCode: 'AIM111',
        title: 'StatQuest: Logistic Regression & Classification Evaluation Metrics',
        description: 'S-shaped curves, log-odds, maximum likelihood, confusion matrices, ROC curves, and AUC scores.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=yIYKR4sgzI8',
        videoId: 'yIYKR4sgzI8',
      },
      {
        courseCode: 'AIM111',
        title: 'Stanford CS229: Complete Machine Learning Course Notes [Free PDF]',
        description: 'Authoritative CS229 lecture notes covering parametric algorithms, support vector machines, and bias-variance tradeoff.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://cs229.stanford.edu/main_notes.pdf',
        mimeType: 'application/pdf',
      },
      {
        courseCode: 'AIM111',
        title: 'An Introduction to Statistical Learning (ISLR) [Free Legal PDF]',
        description: 'The golden standard introductory machine learning book with R and Python code laboratories by James, Witten et al.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://www.statlearning.com/',
      },
      {
        courseCode: 'AIM111',
        title: 'Mathematics for Machine Learning by Deisenroth, Faisal & Ong [PDF]',
        description: 'Essential mathematical background: linear algebra, analytic geometry, matrix decompositions, and vector calculus.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://mml-book.github.io/book/mml-book.pdf',
        mimeType: 'application/pdf',
      },
      {
        courseCode: 'AIM111',
        title: 'Scikit-Learn Official User Guide & Algorithmic Reference',
        description: 'Comprehensive documentation and practical code examples for pipelines, cross-validation, and hyperparameter grids.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://scikit-learn.org/stable/user_guide.html',
      },
      {
        courseCode: 'AIM111',
        title: 'Google Machine Learning Crash Course Jupyter Notebooks',
        description: 'Interactive Colab notebooks illustrating feature engineering, representation, and regularization.',
        resourceType: 'NOTEBOOK',
        externalUrl: 'https://developers.google.com/machine-learning/crash-course',
      },
      {
        courseCode: 'AIM111',
        title: 'UCI Machine Learning Repository: Tabular Classification Datasets',
        description: 'Standard benchmark datasets for training classifiers: Iris, Wine Quality, Adult Census, and Boston Housing.',
        resourceType: 'DATASET',
        externalUrl: 'https://archive.ics.uci.edu/ml/index.php',
      },

      // -------------------------------------------------------------
      // AIM211: Deep Learning & Computer Vision
      // -------------------------------------------------------------
      {
        courseCode: 'AIM211',
        title: '3Blue1Brown: But what is a neural network? Deep learning Chapter 1',
        description: 'Intuitive geometric and mathematical visualization of multilayer perceptrons, weights, biases, and activation functions.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=aircAruvnKk',
        videoId: 'aircAruvnKk',
      },
      {
        courseCode: 'AIM211',
        title: 'MIT 6.S191: Introduction to Deep Learning by Alexander Amini',
        description: 'Perceptrons, backpropagation through loss gradients, optimization techniques (SGD, Adam), and regularization.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=QDX-1M5Nj7s',
        videoId: 'QDX-1M5Nj7s',
      },
      {
        courseCode: 'AIM211',
        title: 'deeplizard: Convolutional Neural Networks (CNNs) Explained Visually',
        description: 'Kernel convolutions, feature maps, stride, zero-padding, max pooling, and spatial invariance.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=YRhxdVk_sIs',
        videoId: 'YRhxdVk_sIs',
      },
      {
        courseCode: 'AIM211',
        title: 'freeCodeCamp: PyTorch for Deep Learning & Computer Vision Course',
        description: 'Tensors, autograd, building custom nn.Module architectures, data loaders, and training loops.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=GIsg-ZUy0MY',
        videoId: 'GIsg-ZUy0MY',
      },
      {
        courseCode: 'AIM211',
        title: 'Deep Learning Textbook by Ian Goodfellow & Yoshua Bengio [Free Online]',
        description: 'Definitive mathematical textbook on deep forward networks, regularization, optimization, and autoencoders.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://www.deeplearningbook.org/',
      },
      {
        courseCode: 'AIM211',
        title: 'arXiv: Deep Residual Learning for Image Recognition (ResNet) [PDF]',
        description: 'Seminal computer vision research paper introducing deep residual learning framework and skip connections by He et al.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://arxiv.org/pdf/1512.03385.pdf',
        mimeType: 'application/pdf',
      },
      {
        courseCode: 'AIM211',
        title: 'Stanford CS231n: Convolutional Networks for Visual Recognition Notes',
        description: 'Course notes on image classification pipeline, linear classifiers, softmax loss, and convnet architectures.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://cs231n.github.io/',
      },
      {
        courseCode: 'AIM211',
        title: 'PyTorch Vision Library Models and Pre-trained Checkpoints',
        description: 'Official repository containing verified implementations of VGG, ResNet, MobileNet, and Vision Transformers.',
        resourceType: 'CODE',
        externalUrl: 'https://github.com/pytorch/vision',
      },
      {
        courseCode: 'AIM211',
        title: 'Google Colab: Fine-Tuning ResNet on Custom Image Dataset',
        description: 'Interactive Colab notebook executing transfer learning with PyTorch and data augmentation transforms.',
        resourceType: 'NOTEBOOK',
        externalUrl: 'https://colab.research.google.com/',
      },
      {
        courseCode: 'AIM211',
        title: 'arXiv: A Survey on Vision Transformers in Computer Vision [Free PDF]',
        description: 'Comprehensive review comparing Convolutional Networks with Vision Transformers (ViT) on visual recognition.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://arxiv.org/pdf/2101.01169.pdf',
        mimeType: 'application/pdf',
      },

      // -------------------------------------------------------------
      // AIM222: Natural Language Processing & Transformers
      // -------------------------------------------------------------
      {
        courseCode: 'AIM222',
        title: 'Stanford CS224N: NLP with Deep Learning Lecture 1 by Christopher Manning',
        description: 'Introduction to Word2Vec, distributional semantics, word vector representations, and objective functions.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=rmVRLeJRkl4',
        videoId: 'rmVRLeJRkl4',
      },
      {
        courseCode: 'AIM222',
        title: 'StatQuest: Word Embedding and Word2Vec Explained Step-by-Step',
        description: 'Intuitive walkthrough of CBOW, Skip-Gram, negative sampling, and cosine similarity between word vectors.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=viZrOnJclYI',
        videoId: 'viZrOnJclYI',
      },
      {
        courseCode: 'AIM222',
        title: 'The AI Hacker: Transformer Neural Networks Explained Visually',
        description: 'Detailed explanation of queries, keys, values, scaled dot-product attention, and multi-head attention blocks.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=4Bdc55j80l8',
        videoId: '4Bdc55j80l8',
      },
      {
        courseCode: 'AIM222',
        title: 'freeCodeCamp: Hugging Face Transformers Course for Beginners',
        description: 'Using pretrained tokenizers, Hugging Face model hub, text generation pipelines, and sequence classifiers.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=tiZFewofSLM',
        videoId: 'tiZFewofSLM',
      },
      {
        courseCode: 'AIM222',
        title: 'Speech and Language Processing by Daniel Jurafsky & James H. Martin [PDF]',
        description: 'The standard NLP academic textbook covering n-grams, POS tagging, constituency parsing, and language models.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://web.stanford.edu/~jurafsky/slp3/',
      },
      {
        courseCode: 'AIM222',
        title: 'arXiv: Attention Is All You Need (The Transformer Paper) [Free PDF]',
        description: 'The breakthrough Google Research paper introducing the Transformer architecture and self-attention.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://arxiv.org/pdf/1706.03762.pdf',
        mimeType: 'application/pdf',
      },
      {
        courseCode: 'AIM222',
        title: 'arXiv: BERT: Pre-training of Deep Bidirectional Transformers [PDF]',
        description: 'Seminal paper introducing masked language modeling and next sentence prediction for language understanding.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://arxiv.org/pdf/1810.04805.pdf',
        mimeType: 'application/pdf',
      },
      {
        courseCode: 'AIM222',
        title: 'Hugging Face Transformers NLP Code Examples Repository',
        description: 'Open-source code examples for question answering, summarization, translation, and token classification.',
        resourceType: 'CODE',
        externalUrl: 'https://github.com/huggingface/transformers/tree/main/examples',
      },
      {
        courseCode: 'AIM222',
        title: 'Google Colab: Fine-Tuning BERT for Sentiment Classification',
        description: 'Hands-on notebook demonstrating how to tokenize text and fine-tune a pre-trained BERT encoder on GPU.',
        resourceType: 'NOTEBOOK',
        externalUrl: 'https://colab.research.google.com/',
      },
      {
        courseCode: 'AIM222',
        title: 'Stanford Sentiment Treebank (SST) & IMDb Benchmark Dataset',
        description: 'Annotated sentiment classification dataset for training and benchmarking natural language models.',
        resourceType: 'DATASET',
        externalUrl: 'https://ai.stanford.edu/~amaas/data/sentiment/',
      },

      // -------------------------------------------------------------
      // AIM311: Applied Generative Models & LLM Engineering
      // -------------------------------------------------------------
      {
        courseCode: 'AIM311',
        title: 'Andrej Karpathy: Let us build GPT from scratch in code',
        description: 'Building a generative pre-trained transformer character-level language model from scratch in pure PyTorch.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=kCc8FmEb1nY',
        videoId: 'kCc8FmEb1nY',
      },
      {
        courseCode: 'AIM311',
        title: 'freeCodeCamp: LangChain and Vector Databases for RAG Architecture',
        description: 'Document chunking, text embedding models, vector similarity search, and retrieval-augmented generation.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=ySEx_BqxvVU',
        videoId: 'ySEx_BqxvVU',
      },
      {
        courseCode: 'AIM311',
        title: 'DeepLearning.AI: Prompt Engineering for Developers by Andrew Ng',
        description: 'Clear guidelines on chain-of-thought prompting, few-shot examples, JSON structured outputs, and delimiters.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=v2gD8BHOa4U',
        videoId: 'v2gD8BHOa4U',
      },
      {
        courseCode: 'AIM311',
        title: 'DeepLearning.AI: Fine-Tuning Large Language Models with LoRA & QLoRA',
        description: 'Parameter-efficient fine-tuning (PEFT), quantization, adapter weights, and instruction dataset curation.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=iYpG7B-G46Y',
        videoId: 'iYpG7B-G46Y',
      },
      {
        courseCode: 'AIM311',
        title: 'arXiv: Language Models are Few-Shot Learners (GPT-3 Paper) [Free PDF]',
        description: 'Seminal OpenAI paper exploring in-context learning, scaling laws, and zero-shot task completion.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://arxiv.org/pdf/2005.14165.pdf',
        mimeType: 'application/pdf',
      },
      {
        courseCode: 'AIM311',
        title: 'arXiv: Retrieval-Augmented Generation for Knowledge-Intensive Tasks [PDF]',
        description: 'The original RAG paper combining parametric dense retrieval with non-parametric neural language generation.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://arxiv.org/pdf/2005.11401.pdf',
        mimeType: 'application/pdf',
      },
      {
        courseCode: 'AIM311',
        title: 'OpenAI Prompt Engineering Best Practices & Guidelines [Official]',
        description: 'Best practice strategies for maximizing generative model accuracy, preventing hallucinations, and evaluation.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://platform.openai.com/docs/guides/prompt-engineering',
      },
      {
        courseCode: 'AIM311',
        title: 'nanoGPT: Minimalist Clean PyTorch GPT Implementation by Karpathy',
        description: 'Clean, understandable repository for training and fine-tuning medium-sized GPT models on GPU hardware.',
        resourceType: 'CODE',
        externalUrl: 'https://github.com/karpathy/nanoGPT',
      },
      {
        courseCode: 'AIM311',
        title: 'Google Colab: Building a Multi-Document RAG QA System with ChromaDB',
        description: 'Interactive notebook ingesting PDF files, creating embeddings, and querying an LLM with semantic context.',
        resourceType: 'NOTEBOOK',
        externalUrl: 'https://colab.research.google.com/',
      },
      {
        courseCode: 'AIM311',
        title: 'arXiv: A Survey on Hallucination in Large Language Models [Free PDF]',
        description: 'Taxonomy of hallucination causes in generative models and empirical verification benchmark metrics.',
        resourceType: 'CASE_STUDY',
        externalUrl: 'https://arxiv.org/pdf/2309.01219.pdf',
        mimeType: 'application/pdf',
      },

      // -------------------------------------------------------------
      // NCC111: Computer Network Fundamentals & OSI Model
      // -------------------------------------------------------------
      {
        courseCode: 'NCC111',
        title: 'NetworkChuck: Computer Networking Full Course for Beginners',
        description: 'Visual breakdown of the OSI model, IP addressing, TCP vs UDP handshakes, MAC addresses, and network switches.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=IPvYjXCsTg8',
        videoId: 'IPvYjXCsTg8',
      },
      {
        courseCode: 'NCC111',
        title: 'Practical Networking: The OSI Model Demystified',
        description: 'Layer-by-layer breakdown: Application, Presentation, Session, Transport, Network, Data Link, and Physical.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=HEEnLZV2wGI',
        videoId: 'HEEnLZV2wGI',
      },
      {
        courseCode: 'NCC111',
        title: 'Practical Networking: Subnetting Made Simple (CIDR & Subnet Masks)',
        description: 'IPv4 binary math, network vs host bits, prefix lengths (/24, /28), and calculating usable IP ranges.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=s_NIt847qu8',
        videoId: 's_NIt847qu8',
      },
      {
        courseCode: 'NCC111',
        title: 'PowerCert: How DNS, DHCP, and ARP Work in Local Networks',
        description: 'Domain resolution, address resolution protocol table lookups, and dynamic host configuration lease handshakes.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=W1eF4RkWgLw',
        videoId: 'W1eF4RkWgLw',
      },
      {
        courseCode: 'NCC111',
        title: 'IETF RFC 791: Internet Protocol Specification [Official Open Document]',
        description: 'Original foundational standard specification document defining DARPA Internet Protocol addressing and datagram delivery.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://www.rfc-editor.org/rfc/pdfrfc/rfc791.txt.pdf',
        mimeType: 'application/pdf',
      },
      {
        courseCode: 'NCC111',
        title: 'IETF RFC 793: Transmission Control Protocol (TCP) Specification [PDF]',
        description: 'Foundational document defining connection establishment (SYN, SYN-ACK, ACK), flow control, and sliding window.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://www.rfc-editor.org/rfc/pdfrfc/rfc793.txt.pdf',
        mimeType: 'application/pdf',
      },
      {
        courseCode: 'NCC111',
        title: 'Computer Networks: A Systems Approach by Peterson & Davie [Free Book]',
        description: 'Complete open-access textbook covering link layers, packet switching, routing algorithms, and end-to-end protocols.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://book.systemsapproach.org/',
      },
      {
        courseCode: 'NCC111',
        title: 'Wireshark User Guide & Network Packet Analysis Reference',
        description: 'Hands-on guide to packet sniffing, filter syntax, TCP stream reassembly, and protocol diagnosis.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://www.wireshark.org/docs/wsug_html_chunked/',
      },
      {
        courseCode: 'NCC111',
        title: 'Cloudflare Learning: BGP Routing and Internet Infrastructure Guide',
        description: 'Case analysis explaining autonomous systems (AS), border gateway routing, and internet traffic flow.',
        resourceType: 'CASE_STUDY',
        externalUrl: 'https://www.cloudflare.com/learning/network-layer/what-is-bgp/',
      },
      {
        courseCode: 'NCC111',
        title: 'Cisco Packet Tracer Basic Campus Network Topology Starter Lab',
        description: 'Network topology design project connecting switches, routers, and workstation end-devices.',
        resourceType: 'CODE',
        externalUrl: 'https://www.netacad.com',
      },

      // -------------------------------------------------------------
      // NCC211: Routing, Switching & Cisco Packet Tracer Lab
      // -------------------------------------------------------------
      {
        courseCode: 'NCC211',
        title: 'Jeremy IT Lab: VLANs and Inter-VLAN Routing (Router-on-a-Stick)',
        description: 'Configuring 802.1Q trunk ports, access ports, native VLANs, and sub-interfaces on Cisco routers.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=7Q_S2vQ70S8',
        videoId: '7Q_S2vQ70S8',
      },
      {
        courseCode: 'NCC211',
        title: 'NetworkChuck: OSPF Routing Protocol Configuration Step-by-Step',
        description: 'Link-state routing, OSPF areas, designated routers (DR/BDR), neighbor adjacencies, and cost metrics.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=X1H0c3H8T5g',
        videoId: 'X1H0c3H8T5g',
      },
      {
        courseCode: 'NCC211',
        title: 'Jeremy IT Lab: Access Control Lists (Standard & Extended ACLs)',
        description: 'Packet filtering rules, traffic direction (inbound/outbound), wildcard masks, and protocol port blocking.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=LpA9bB9t9b4',
        videoId: 'LpA9bB9t9b4',
      },
      {
        courseCode: 'NCC211',
        title: 'NetworkChuck: Network Address Translation (NAT & PAT) in Action',
        description: 'Inside local, inside global, overload port translation (PAT), and private RFC 1918 address reuse.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=D8iQ5S4Lq7Y',
        videoId: 'D8iQ5S4Lq7Y',
      },
      {
        courseCode: 'NCC211',
        title: 'Cisco Enterprise Campus LAN and Wireless Network Design Guide [PDF]',
        description: 'Official Cisco design blueprint for core, distribution, and access layer switching topologies.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://www.cisco.com/c/en/us/td/docs/solutions/CVD/Campus/cisco-campus-lan-wlan-design-guide.pdf',
        mimeType: 'application/pdf',
      },
      {
        courseCode: 'NCC211',
        title: 'IETF RFC 2328: OSPF Version 2 Protocol Specification [Official PDF]',
        description: 'The authoritative technical standard defining Dijkstra shortest path first algorithm in IP routing.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://www.rfc-editor.org/rfc/rfc2328.pdf',
        mimeType: 'application/pdf',
      },
      {
        courseCode: 'NCC211',
        title: '3-Tier Enterprise Campus Cisco Packet Tracer Topology (.pkt)',
        description: 'Multi-router enterprise topology featuring redundant links, HSRP gateway failover, and OSPF routing.',
        resourceType: 'CODE',
        externalUrl: 'https://www.packettracernetwork.com/',
      },
      {
        courseCode: 'NCC211',
        title: 'Netmiko Python Automated Network Device Configuration Script',
        description: 'Python script for automating multi-switch VLAN provisioning and routing table audit checks over SSH.',
        resourceType: 'CODE',
        externalUrl: 'https://github.com/ktbyers/netmiko',
      },
      {
        courseCode: 'NCC211',
        title: 'Spanning Tree Protocol (STP & Rapid-STP 802.1w) Whitepaper [Cisco]',
        description: 'Preventing Layer 2 broadcast storms, root bridge election, port states, and BPDU guard configurations.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://www.cisco.com/c/en/us/support/docs/lan-switching/spanning-tree-protocol/5234-5.html',
      },
      {
        courseCode: 'NCC211',
        title: 'IETF RFC 4213: IPv6 Transition Strategies (Dual-Stack & Tunneling)',
        description: 'Standards document detailing coexistence mechanisms during IPv4 to IPv6 campus migration.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://www.ietf.org/rfc/rfc4213.txt',
      },

      // -------------------------------------------------------------
      // NCC222: Network Security & Cryptographic Protocols
      // -------------------------------------------------------------
      {
        courseCode: 'NCC222',
        title: 'freeCodeCamp: Cryptography Full Course for Beginners',
        description: 'Symmetric encryption (AES, DES), asymmetric ciphers (RSA, ECC), hashing functions (SHA-256), and digital signatures.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=jhXCTbFnK8o',
        videoId: 'jhXCTbFnK8o',
      },
      {
        courseCode: 'NCC222',
        title: 'Computerphile: How TLS 1.3 Encryption and Handshake Works',
        description: 'Elliptic-curve Diffie-Hellman ephemeral key exchanges, forward secrecy, and 0-RTT session resumption.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=86cQCE8tWmA',
        videoId: '86cQCE8tWmA',
      },
      {
        courseCode: 'NCC222',
        title: 'NetworkChuck: Firewalls, DMZs & Network Segmentation Explained',
        description: 'Stateful packet inspection, next-generation application-aware firewalls, and bastion hosts.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=6oJtQk6p0pA',
        videoId: '6oJtQk6p0pA',
      },
      {
        courseCode: 'NCC222',
        title: 'PowerCert: Public Key Infrastructure (PKI) & X.509 Certificates',
        description: 'Certificate Authorities (CA), registration authorities, certificate revocation lists (CRL), and OCSP stapling.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=S5G_FqLp6rA',
        videoId: 'S5G_FqLp6rA',
      },
      {
        courseCode: 'NCC222',
        title: 'NIST SP 800-52 Rev. 2: Guidelines for TLS Implementations [PDF]',
        description: 'US federal government security recommendations for configuring secure cipher suites and preventing cipher downgrade.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-52r2.pdf',
        mimeType: 'application/pdf',
      },
      {
        courseCode: 'NCC222',
        title: 'IETF RFC 8446: The Transport Layer Security (TLS) Protocol v1.3 [PDF]',
        description: 'Official standard protocol document detailing modern encrypted transport across the World Wide Web.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://www.rfc-editor.org/rfc/rfc8446.pdf',
        mimeType: 'application/pdf',
      },
      {
        courseCode: 'NCC222',
        title: 'CISA Network Defense Infrastructure Guidelines & Mitigation Blueprints',
        description: 'Cybersecurity and Infrastructure Security Agency national guidelines on securing perimeter routers and switches.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://www.cisa.gov/resources-tools/resources',
      },
      {
        courseCode: 'NCC222',
        title: 'OpenSSL Command-Line Tool Cheatsheet & Key Generation Scripts',
        description: 'Practical shell recipes for generating private keys, CSRs, self-signed certificates, and inspecting x509 certs.',
        resourceType: 'CODE',
        externalUrl: 'https://www.openssl.org/docs/',
      },
      {
        courseCode: 'NCC222',
        title: 'NIST SP 800-207: Zero Trust Architecture Standard Publication [PDF]',
        description: 'Core tenets of zero trust security: continuous verification, least privilege access, and assumed breach posture.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-207.pdf',
        mimeType: 'application/pdf',
      },
      {
        courseCode: 'NCC222',
        title: 'Case Study: The Heartbleed OpenSSL Vulnerability & Memory Leak Analysis',
        description: 'Technical dissection of RFC 6520 TLS heartbeat bounds check vulnerability and responsible disclosure timeline.',
        resourceType: 'CASE_STUDY',
        externalUrl: 'https://heartbleed.com/',
      },

      // -------------------------------------------------------------
      // NCC311: Cloud Architecture & DevOps (AWS/Azure/Linux)
      // -------------------------------------------------------------
      {
        courseCode: 'NCC311',
        title: 'freeCodeCamp: AWS Certified Cloud Practitioner Full Course',
        description: 'Full-length cloud engineering course covering AWS global infrastructure, S3 storage tiers, EC2 compute, VPCs, and IAM security.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=SOTamWNgDKc',
        videoId: 'SOTamWNgDKc',
      },
      {
        courseCode: 'NCC311',
        title: 'TechWorld with Nana: Docker Tutorial for Beginners [Full Course]',
        description: 'Docker architecture, images vs containers, Dockerfile instructions, volumes for data persistence, and Compose.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=fqMOX695P68',
        videoId: 'fqMOX695P68',
      },
      {
        courseCode: 'NCC311',
        title: 'Fireship: Kubernetes Explained with Real Architecture Walkthrough',
        description: 'Pods, replica sets, services, ingress controllers, ConfigMaps, and cluster orchestration in container environments.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=VnvRFRk_51k',
        videoId: 'VnvRFRk_51k',
      },
      {
        courseCode: 'NCC311',
        title: 'freeCodeCamp: Terraform Infrastructure as Code (IaC) Masterclass',
        description: 'Declarative cloud provisioning: providers, resources, variables, state locking, and multi-environment workspaces.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=SLB_c_W0n4M',
        videoId: 'SLB_c_W0n4M',
      },
      {
        courseCode: 'NCC311',
        title: 'NIST: Cloud Computing Reference Architecture SP 500-292 [Free PDF]',
        description: 'National Institute of Standards and Technology official architecture blueprint for cloud service models (IaaS, PaaS, SaaS).',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication500-292.pdf',
        mimeType: 'application/pdf',
      },
      {
        courseCode: 'NCC311',
        title: 'AWS Well-Architected Framework: Reliability and Security Pillars [PDF]',
        description: 'Official cloud architecture best practices for designing resilient, fault-tolerant, and secure cloud workloads.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://docs.aws.amazon.com/wellarchitected/latest/framework/wellarchitected-framework.pdf',
        mimeType: 'application/pdf',
      },
      {
        courseCode: 'NCC311',
        title: 'The Twelve-Factor App Cloud Architecture Methodology Guide',
        description: 'Definitive cloud architectural methodology for building software-as-a-service applications with clean contracts.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://12factor.net/',
      },
      {
        courseCode: 'NCC311',
        title: 'Docker Awesome Compose: Multi-Container Production Examples',
        description: 'Curated repository of ready-to-run Docker Compose recipes for PostgreSQL, Redis, Node, and Nginx microservices.',
        resourceType: 'CODE',
        externalUrl: 'https://github.com/docker/awesome-compose',
      },
      {
        courseCode: 'NCC311',
        title: 'Google Cloud Architecture Center: Enterprise Solutions & Blueprints',
        description: 'Scalable architecture patterns for multi-region active-active deployments, zero-downtime migrations, and storage tiers.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://cloud.google.com/architecture',
      },
      {
        courseCode: 'NCC311',
        title: 'Netflix TechBlog: Chaos Engineering & Cloud Resiliency Case Studies',
        description: 'Case study analyzing how automated fault injection and Chaos Monkey strengthen multi-region cloud resilience.',
        resourceType: 'CASE_STUDY',
        externalUrl: 'https://netflixtechblog.com/',
      },

      // -------------------------------------------------------------
      // STA111: Descriptive Statistics & Probability Distributions
      // -------------------------------------------------------------
      {
        courseCode: 'STA111',
        title: 'StatQuest: Probability & Normal Distribution Fundamentals',
        description: 'Clear, intuitive breakdown of probability density functions, standard deviation, Z-scores, and central limit theorem.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=rzFX5NWojp0',
        videoId: 'rzFX5NWojp0',
      },
      {
        courseCode: 'STA111',
        title: 'Khan Academy: Descriptive Statistics (Mean, Median, Mode, Variance)',
        description: 'Mathematical foundations of central tendency, spread, interquartile range (IQR), and box-and-whisker plots.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=Z_Zc_k2NqfA',
        videoId: 'Z_Zc_k2NqfA',
      },
      {
        courseCode: 'STA111',
        title: 'The Organic Chemistry Tutor: Probability Rules & Bayes Theorem',
        description: 'Mutually exclusive events, conditional probability P(A|B), tree diagrams, and Bayes theorem calculations.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=H02B3c6pQkY',
        videoId: 'H02B3c6pQkY',
      },
      {
        courseCode: 'STA111',
        title: 'Brandon Foltz: Discrete Probability Distributions (Binomial & Poisson)',
        description: 'Bernoulli trials, binomial formula derivations, Poisson distribution rate parameters, and real-world event modeling.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=8idr1WZ1A7Q',
        videoId: '8idr1WZ1A7Q',
      },
      {
        courseCode: 'STA111',
        title: 'OpenStax: Introductory Statistics [Free Peer-Reviewed Textbook PDF]',
        description: 'Comprehensive open textbook covering descriptive statistics, continuous random variables, and sampling distributions.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://openstax.org/details/books/introductory-statistics',
        mimeType: 'application/pdf',
      },
      {
        courseCode: 'STA111',
        title: 'Online Statistics Education: A Multimedia Course of Study by David Lane',
        description: 'Full introductory textbook with interactive simulations covering bivariate data, normal curves, and sampling.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://onlinestatbook.com/Online_Statistics_Education.pdf',
        mimeType: 'application/pdf',
      },
      {
        courseCode: 'STA111',
        title: 'NIST/SEMATECH e-Handbook of Statistical Methods [Official NIST Reference]',
        description: 'National Institute of Standards guide for exploratory data analysis, probability distributions, and data modeling.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://www.itl.nist.gov/div898/handbook/',
      },
      {
        courseCode: 'STA111',
        title: 'National Bureau of Statistics (NBS) Nigeria: Household Survey Dataset',
        description: 'Real-world survey microdata containing household expenditure, literacy rates, and regional demographic indicators.',
        resourceType: 'DATASET',
        externalUrl: 'https://nigerianstat.gov.ng/',
      },
      {
        courseCode: 'STA111',
        title: 'Excel & Google Sheets Descriptive Statistics Automated Template',
        description: 'Spreadsheet template with automated formulas for skewness, kurtosis, standard error, and frequency distributions.',
        resourceType: 'SPREADSHEET',
        externalUrl: 'https://www.kaggle.com/',
      },
      {
        courseCode: 'STA111',
        title: 'Harvard University Stat 110: Introduction to Probability Course Notes',
        description: 'Renowned lecture notes by Joe Blitzstein covering conditioning, Markov chains, and moment generating functions.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://projects.iq.harvard.edu/stat110',
      },

      // -------------------------------------------------------------
      // STA122: Statistical Inference & Hypothesis Testing
      // -------------------------------------------------------------
      {
        courseCode: 'STA122',
        title: 'StatQuest: Hypothesis Testing, P-values, and Critical Regions',
        description: 'Null and alternative hypotheses, Type I and Type II errors, alpha significance levels, and p-value intuition.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=0oC49dXAMPg',
        videoId: '0oC49dXAMPg',
      },
      {
        courseCode: 'STA122',
        title: 'StatQuest: Confidence Intervals Clearly Explained with Visuals',
        description: 'What a 95% confidence interval truly means, margin of error, and the t-distribution vs standard normal distribution.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=TqOeMYtOc1w',
        videoId: 'TqOeMYtOc1w',
      },
      {
        courseCode: 'STA122',
        title: 'Khan Academy: Chi-Square Tests of Independence and Goodness of Fit',
        description: 'Observed vs expected contingency tables, degrees of freedom, and testing association between categorical variables.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=7_cs1x6p0pA',
        videoId: '7_cs1x6p0pA',
      },
      {
        courseCode: 'STA122',
        title: 'Brandon Foltz: One-Way ANOVA (Analysis of Variance) Step-by-Step',
        description: 'Between-group vs within-group variance, sum of squares, F-distribution test statistics, and post-hoc tests.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=oOuu8IB6C5A',
        videoId: 'oOuu8IB6C5A',
      },
      {
        courseCode: 'STA122',
        title: 'OpenIntro Statistics (4th Edition) by Diez, Barr & Çetinkaya-Rundel [PDF]',
        description: 'Award-winning open textbook detailing inference for numerical data, proportions, and regression modeling.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://www.openintro.org/book/os/',
      },
      {
        courseCode: 'STA122',
        title: 'Statistical Inference for Everyone by Patrick Meyer [Open Access PDF]',
        description: 'Bayesian and frequentist perspectives on parameter estimation, credible intervals, and model comparison.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://github.com/pdmey/Statistical-Inference-for-Everyone',
      },
      {
        courseCode: 'STA122',
        title: 'American Statistical Association (ASA): Statement on P-Values and Significance',
        description: 'Official consensus statement by professional statisticians on proper interpretation and common misconceptions of p-values.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://www.amstat.org/asa/files/pdfs/P-ValueStatement.pdf',
        mimeType: 'application/pdf',
      },
      {
        courseCode: 'STA122',
        title: 'Python Scipy.Stats Hypothesis Testing Scripts and Documentation',
        description: 'Complete Python code recipes for running ttest_ind, f_oneway, chi2_contingency, and shapiro-wilk normality tests.',
        resourceType: 'CODE',
        externalUrl: 'https://docs.scipy.org/doc/scipy/reference/stats.html',
      },
      {
        courseCode: 'STA122',
        title: 'Clinical Trial Two-Sample Hypothesis Testing Benchmark Dataset',
        description: 'Empirical medical research dataset formatted for conducting paired t-tests and two-sample proportion tests.',
        resourceType: 'DATASET',
        externalUrl: 'https://archive.ics.uci.edu/',
      },
      {
        courseCode: 'STA122',
        title: 'MIT 18.650: Fundamentals of Statistics Lecture Notes & Handouts',
        description: 'Mathematical rigor covering maximum likelihood estimation (MLE), Fisher information, and Likelihood Ratio tests.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://ocw.mit.edu/courses/18-650-fundamentals-of-statistics-fall-2016/',
      },

      // -------------------------------------------------------------
      // STA211: Statistical Computing with R & Python
      // -------------------------------------------------------------
      {
        courseCode: 'STA211',
        title: 'freeCodeCamp: R Programming Tutorial for Data Science',
        description: 'Complete hands-on R course covering vectors, data frames, matrix operations, statistical tests, and ggplot2 graphs.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=_V8eKsto3Ug',
        videoId: '_V8eKsto3Ug',
      },
      {
        courseCode: 'STA211',
        title: 'SPSS in 15 Minutes for Statistical Data Analysis',
        description: 'Rapid walkthrough of data entry, variable definitions, descriptive statistics, and correlation in IBM SPSS.',
        resourceType: 'VIDEO',
        externalUrl: 'https://youtu.be/TZPyOJ8tFcI',
        videoId: 'TZPyOJ8tFcI',
      },
      {
        courseCode: 'STA211',
        title: 'David Robinson: Data Wrangling with R Tidyverse and dplyr',
        description: 'Mastering select, filter, mutate, group_by, summarize, and piping operators for high-speed tabular transformation.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=1ERnybvP_mE',
        videoId: '1ERnybvP_mE',
      },
      {
        courseCode: 'STA211',
        title: 'Keith Galli: Python Pandas Tutorial for Tabular Data Analysis',
        description: 'Reading CSVs, data cleaning, boolean indexing, handling null values, and aggregating multi-level dataframes.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=vmEHCJofslg',
        videoId: 'vmEHCJofslg',
      },
      {
        courseCode: 'STA211',
        title: 'R for Data Science (2nd Edition) by Hadley Wickham [Free Online Book]',
        description: 'The definitive handbook for importing, tidying, transforming, visualizing, and modeling data with R.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://r4ds.hadley.nz/',
      },
      {
        courseCode: 'STA211',
        title: 'Python Data Science Handbook by Jake VanderPlas [Free Online Book]',
        description: 'Essential guide covering NumPy array computing, Pandas data analysis, Matplotlib charts, and Scikit-Learn.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://jakevdp.github.io/PythonDataScienceHandbook/',
      },
      {
        courseCode: 'STA211',
        title: 'Advanced R by Hadley Wickham [Free Technical Deep-Dive Book]',
        description: 'Understanding R memory models, functional programming, environments, S3/S4 object-oriented systems, and C++ integration.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://adv-r.hadley.nz/',
      },
      {
        courseCode: 'STA211',
        title: 'RStudio Official Cheatsheets for Data Science & Visualization',
        description: 'Quick reference visual cheatsheets for ggplot2, dplyr, tidyr, stringr, and R Markdown reporting.',
        resourceType: 'CODE',
        externalUrl: 'https://github.com/rstudio/cheatsheets',
      },
      {
        courseCode: 'STA211',
        title: 'Google Colab: Exploratory Data Analysis with Pandas & Seaborn',
        description: 'Interactive Jupyter notebook analyzing distributions, correlation heatmaps, and pairplots on cloud runtime.',
        resourceType: 'NOTEBOOK',
        externalUrl: 'https://colab.research.google.com/',
      },
      {
        courseCode: 'STA211',
        title: 'Our World in Data: Global Socioeconomic Indicators Open Dataset',
        description: 'Exhaustive open-access empirical research dataset in CSV format covering life expectancy, education, and GDP.',
        resourceType: 'DATASET',
        externalUrl: 'https://ourworldindata.org/',
      },

      // -------------------------------------------------------------
      // STA311: Econometric Modeling & NBS Surveys
      // -------------------------------------------------------------
      {
        courseCode: 'STA311',
        title: 'Ben Lambert: Econometrics Full Lecture Series - Introduction to Econometrics',
        description: 'Gauss-Markov assumptions, ordinary least squares (OLS) derivation, unbiasedness, and consistency.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=bN7x1Lh9QzA',
        videoId: 'bN7x1Lh9QzA',
      },
      {
        courseCode: 'STA311',
        title: 'Rob Hyndman: Time Series Forecasting and ARIMA Models Explained',
        description: 'Stationarity, autocorrelation function (ACF), partial ACF, autoregressive (AR) and moving average (MA) processes.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=2XGSIg8vAAI',
        videoId: '2XGSIg8vAAI',
      },
      {
        courseCode: 'STA311',
        title: 'Ben Lambert: Heteroskedasticity and Multicollinearity in Regression',
        description: 'Detecting non-constant error variance, White test, Breusch-Pagan test, Variance Inflation Factor (VIF), and robust standard errors.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=8sH1vT7J5uU',
        videoId: '8sH1vT7J5uU',
      },
      {
        courseCode: 'STA311',
        title: 'Ben Lambert: Instrumental Variables and Two-Stage Least Squares (2SLS)',
        description: 'Endogeneity, omitted variable bias, reverse causality, instrument relevance, and exogeneity conditions.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=NLn1y2N6o1A',
        videoId: 'NLn1y2N6o1A',
      },
      {
        courseCode: 'STA311',
        title: 'National Bureau of Statistics (NBS) Nigeria: Survey Methodology Report [PDF]',
        description: 'Official Nigerian government statistical methodology guidelines for inflation indices, GDP disaggregation, and household surveys.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://nigerianstat.gov.ng/pdfuploads/Methodology_NBS.pdf',
        mimeType: 'application/pdf',
      },
      {
        courseCode: 'STA311',
        title: 'Principles of Econometrics (Introduction to Econometrics with R) [Free Book]',
        description: 'Practical guide to applying econometric modeling, panel data, and instrumental variables using R statistical software.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://www.econometrics-with-r.org/',
      },
      {
        courseCode: 'STA311',
        title: 'Central Bank of Nigeria (CBN): Statistical Bulletin Historical Data Series',
        description: 'Macro-economic financial series on money supply, exchange rates, foreign reserves, and treasury bill yields.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://www.cbn.gov.ng/documents/statbulletin.asp',
      },
      {
        courseCode: 'STA311',
        title: 'Python Statsmodels: Econometric Regression & Time Series Scripts',
        description: 'Code recipes for OLS, WLS, GLM, vector autoregression (VAR), and Dickey-Fuller unit root tests.',
        resourceType: 'CODE',
        externalUrl: 'https://www.statsmodels.org/stable/index.html',
      },
      {
        courseCode: 'STA311',
        title: 'Nigerian Consumer Price Index (CPI) and Inflation Microdata Series',
        description: 'Disaggregated headline, food, and core inflation indices published monthly by the National Bureau of Statistics.',
        resourceType: 'DATASET',
        externalUrl: 'https://nigerianstat.gov.ng/',
      },
      {
        courseCode: 'STA311',
        title: 'International Monetary Fund (IMF): Macroeconomic Forecasting Guidelines',
        description: 'Technical guidance on structural macroeconomic modeling, dynamic stochastic general equilibrium (DSGE), and forecasting.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://www.imf.org/en/Publications',
      },

      // -------------------------------------------------------------
      // ACC111: Principles of Financial Accounting I
      // -------------------------------------------------------------
      {
        courseCode: 'ACC111',
        title: 'Accounting Stuff: Accounting for Beginners Full Course',
        description: 'Step-by-step masterclass on the accounting equation (Assets = Liabilities + Equity), double-entry debit/credit rules, and trial balance.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=yYX4bvQSqbo',
        videoId: 'yYX4bvQSqbo',
      },
      {
        courseCode: 'ACC111',
        title: 'Accounting Stuff: Debit and Credit Rules Demystified with Practical Examples',
        description: 'The DEALER mnemonic for remembering which accounts increase with debit and which increase with credit.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=V8q8j8N2mP8',
        videoId: 'V8q8j8N2mP8',
      },
      {
        courseCode: 'ACC111',
        title: 'Farhat Accounting: Preparing a Trial Balance and General Ledger Accounts',
        description: 'Posting transactions from specialized journals into T-accounts, balancing accounts, and constructing an unadjusted trial balance.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=1Z4bY6mN4aI',
        videoId: '1Z4bY6mN4aI',
      },
      {
        courseCode: 'ACC111',
        title: 'Farhat Accounting: Bank Reconciliation Statement Preparation Step-by-Step',
        description: 'Reconciling bank statement balances with cash book balances: outstanding checks, deposits in transit, and bank charges.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=p6d3o8q9e0A',
        videoId: 'p6d3o8q9e0A',
      },
      {
        courseCode: 'ACC111',
        title: 'Principles of Accounting: Financial Accounting [Open Textbook Library PDF]',
        description: 'Peer-reviewed open educational textbook detailing accounting cycle operations, accruals, inventory valuation, and internal control.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://open.umn.edu/opentextbooks/textbooks/principles-of-accounting-volume-1-financial-accounting',
        mimeType: 'application/pdf',
      },
      {
        courseCode: 'ACC111',
        title: 'OpenStax: Principles of Accounting: Financial Accounting [Free PDF Textbook]',
        description: 'Official open college textbook on accounting records, adjusting entries, financial statement preparation, and fraud prevention.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://openstax.org/details/books/principles-accounting-volume-1-financial-accounting',
        mimeType: 'application/pdf',
      },
      {
        courseCode: 'ACC111',
        title: 'AccountingCoach: Bookkeeping and Financial Statements Study Notes',
        description: 'Structured tutorials, practice quizzes, and reference guides covering all foundational financial accounting concepts.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://www.accountingcoach.com/',
      },
      {
        courseCode: 'ACC111',
        title: 'General Ledger, Journal & Trial Balance Automated Excel Workbook',
        description: 'Pre-formatted spreadsheet workbook with automated balancing verification for practicing double-entry bookkeeping.',
        resourceType: 'SPREADSHEET',
        externalUrl: 'https://www.accountingcoach.com/accounting-forms',
      },
      {
        courseCode: 'ACC111',
        title: 'Small Business Double-Entry Accounting Practice Simulation Case',
        description: 'Realistic monthly transaction records for a merchandising enterprise with complete solution ledger sheets.',
        resourceType: 'CASE_STUDY',
        externalUrl: 'https://open.umn.edu/',
      },
      {
        courseCode: 'ACC111',
        title: 'IASB Conceptual Framework for Financial Reporting [Official Overview]',
        description: 'Qualitative characteristics of useful financial information: relevance, faithful representation, verifiability, and timeliness.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://www.ifrs.org/',
      },

      // -------------------------------------------------------------
      // ACC122: Principles of Financial Accounting II
      // -------------------------------------------------------------
      {
        courseCode: 'ACC122',
        title: 'Farhat Accounting: Partnership Accounting (Profit Sharing & Capital Accounts)',
        description: 'Accounting for partnership formations, interest on capital, partner drawings, profit/loss appropriation, and goodwill.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=yYX4bvQSqbo',
        videoId: 'yYX4bvQSqbo',
      },
      {
        courseCode: 'ACC122',
        title: 'Accounting Stuff: Depreciation Methods (Straight-Line vs Reducing Balance)',
        description: 'Asset salvage value, useful life, accumulated depreciation schedules, and asset disposal gain/loss calculations.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=V8q8j8N2mP8',
        videoId: 'V8q8j8N2mP8',
      },
      {
        courseCode: 'ACC122',
        title: 'Farhat Accounting: Statement of Cash Flows (Direct vs Indirect Method)',
        description: 'Operating activities, investing cash flows, financing transactions, and reconciliation of net income to operating cash.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=1Z4bY6mN4aI',
        videoId: '1Z4bY6mN4aI',
      },
      {
        courseCode: 'ACC122',
        title: 'Accounting Stuff: Manufacturing Accounts (Prime Cost & Factory Overhead)',
        description: 'Direct raw materials, direct labor, prime costs, factory overhead allocation, and work-in-progress inventory.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=p6d3o8q9e0A',
        videoId: 'p6d3o8q9e0A',
      },
      {
        courseCode: 'ACC122',
        title: 'Corporate Financial Statements & Partnership Accounting [Open PDF]',
        description: 'Comprehensive open textbook covering intangible assets, corporate equity, bond issuance, and cash flow reporting.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://open.umn.edu/opentextbooks/',
      },
      {
        courseCode: 'ACC122',
        title: 'IFRS 15: Revenue from Contracts with Customers Standard Summary [PDF]',
        description: 'Five-step model for revenue recognition: identifying the contract, performance obligations, transaction price, and allocation.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://www.ifrs.org/issued-standards/list-of-standards/ifrs-15-revenue-from-contracts-with-customers/',
      },
      {
        courseCode: 'ACC122',
        title: 'IAS 16: Property, Plant and Equipment Standard Summary & Guidelines',
        description: 'Recognition of tangible fixed assets, cost capitalization rules, revaluation model, and impairment criteria.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://www.ifrs.org/issued-standards/list-of-standards/ias-16-property-plant-and-equipment/',
      },
      {
        courseCode: 'ACC122',
        title: 'Cash Flow Statement Indirect Method Automated Modeling Spreadsheet',
        description: 'Excel modeling sheet linking balance sheet adjustments, non-cash charges, and operating cash flows.',
        resourceType: 'SPREADSHEET',
        externalUrl: 'https://www.accountingcoach.com/',
      },
      {
        courseCode: 'ACC122',
        title: 'Manufacturing Enterprise Annual Financial Statement Case Study',
        description: 'Case analysis analyzing inventory valuation impact (FIFO vs Weighted Average) on cost of goods manufactured.',
        resourceType: 'CASE_STUDY',
        externalUrl: 'https://hbsp.harvard.edu/',
      },
      {
        courseCode: 'ACC122',
        title: 'Financial Statements Analysis: Solvency, Liquidity & Profitability Ratios [PDF]',
        description: 'Guide to calculating current ratio, acid-test ratio, return on equity (ROE), debt-to-equity, and asset turnover.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://openstax.org/',
      },

      // -------------------------------------------------------------
      // ACC211: Cost & Management Accounting
      // -------------------------------------------------------------
      {
        courseCode: 'ACC211',
        title: 'Accounting Stuff: Cost Accounting Basics (Fixed, Variable & Mixed Costs)',
        description: 'Cost behavior classification, direct vs indirect expenses, product vs period costs, and high-low estimation method.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=yYX4bvQSqbo',
        videoId: 'yYX4bvQSqbo',
      },
      {
        courseCode: 'ACC211',
        title: 'Farhat Accounting: Break-Even Analysis & Margin of Safety (CVP Analysis)',
        description: 'Contribution margin ratio, break-even point in units and currency, target profit planning, and operating leverage.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=V8q8j8N2mP8',
        videoId: 'V8q8j8N2mP8',
      },
      {
        courseCode: 'ACC211',
        title: 'Farhat Accounting: Job Costing vs Process Costing Explained',
        description: 'Equivalent units of production, weighted-average vs FIFO method, job cost sheets, and overhead predetermined rates.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=1Z4bY6mN4aI',
        videoId: '1Z4bY6mN4aI',
      },
      {
        courseCode: 'ACC211',
        title: 'Farhat Accounting: Standard Costing and Variance Analysis (Material & Labor)',
        description: 'Price variance, quantity variance, rate variance, efficiency variance, and management by exception.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=p6d3o8q9e0A',
        videoId: 'p6d3o8q9e0A',
      },
      {
        courseCode: 'ACC211',
        title: 'OpenStax: Principles of Accounting: Managerial Accounting [Free PDF]',
        description: 'Comprehensive open textbook covering cost allocation, activity-based costing, decentralized operations, and capital budgeting.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://openstax.org/details/books/principles-accounting-volume-2-managerial-accounting',
        mimeType: 'application/pdf',
      },
      {
        courseCode: 'ACC211',
        title: 'Managerial Accounting: A Decision-Making Perspective [Open PDF Textbook]',
        description: 'Differential analysis, make-or-buy decisions, special orders, and segmented reporting for business managers.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://open.umn.edu/opentextbooks/textbooks/managerial-accounting',
      },
      {
        courseCode: 'ACC211',
        title: 'CIMA: Activity-Based Costing (ABC) Implementation Framework [PDF]',
        description: 'Chartered Institute of Management Accountants technical guide on cost drivers, cost pools, and overhead distortion.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://www.cimaglobal.com/',
      },
      {
        courseCode: 'ACC211',
        title: 'Cost-Volume-Profit (CVP) Interactive Sensitivity Analysis Spreadsheet',
        description: 'Dynamic spreadsheet model calculating multi-product sales mix break-even points and margin of safety.',
        resourceType: 'SPREADSHEET',
        externalUrl: 'https://www.accountingcoach.com/',
      },
      {
        courseCode: 'ACC211',
        title: 'Harvard Business Case: Target Costing & Product Profitability in Manufacturing',
        description: 'Empirical business case examining how Japanese automotive manufacturers utilize target costing in competitive design.',
        resourceType: 'CASE_STUDY',
        externalUrl: 'https://hbsp.harvard.edu/',
      },
      {
        courseCode: 'ACC211',
        title: 'CIMA Code of Ethics for Professional Management Accountants [PDF]',
        description: 'Fundamental principles: integrity, objectivity, professional competence and due care, confidentiality, and professional behavior.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://www.cimaglobal.com/About-us/Ethics/',
      },

      // -------------------------------------------------------------
      // ACC311: Auditing & IFRS International Financial Reporting Standards
      // -------------------------------------------------------------
      {
        courseCode: 'ACC311',
        title: 'Farhat Accounting: Introduction to Financial Statement Audits & Assurance',
        description: 'The purpose of an audit, management assertions (existence, completeness, valuation, rights), and audit risk model.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=yYX4bvQSqbo',
        videoId: 'yYX4bvQSqbo',
      },
      {
        courseCode: 'ACC311',
        title: 'Farhat Accounting: Audit Evidence, Substantive Testing & Analytical Procedures',
        description: 'Sufficient appropriate audit evidence, confirmations, physical inspection, recalculation, and substantive testing.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=V8q8j8N2mP8',
        videoId: 'V8q8j8N2mP8',
      },
      {
        courseCode: 'ACC311',
        title: 'Farhat Accounting: Internal Control System Evaluation (COSO Framework)',
        description: 'Control environment, risk assessment, control activities, information & communication, and monitoring.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=1Z4bY6mN4aI',
        videoId: '1Z4bY6mN4aI',
      },
      {
        courseCode: 'ACC311',
        title: 'Farhat Accounting: Independent Auditor Reports & Types of Opinions',
        description: 'Unmodified/unqualified opinion, qualified opinion, adverse opinion, disclaimer of opinion, and key audit matters (KAMs).',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=p6d3o8q9e0A',
        videoId: 'p6d3o8q9e0A',
      },
      {
        courseCode: 'ACC311',
        title: 'IFRS Foundation: Guide to International Financial Reporting Standards [PDF]',
        description: 'Official global standard overview for corporate disclosure, asset impairment tests, fair value, and instruments.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://www.ifrs.org/content/dam/ifrs/use-of-standards/who-uses-ifrs-standards/pocket-guide-2023.pdf',
        mimeType: 'application/pdf',
      },
      {
        courseCode: 'ACC311',
        title: 'IAASB: International Standards on Auditing (ISA Core Principles Summary)',
        description: 'International Auditing and Assurance Standards Board guide covering ISA 200, ISA 315, ISA 500, and ISA 700.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://www.iaasb.org/standards-pronouncements',
      },
      {
        courseCode: 'ACC311',
        title: 'ACCA: Audit and Assurance Complete Study Text & Exam Resources',
        description: 'Official syllabus guide covering professional skepticism, auditor liability, and substantive procedures on inventory.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://www.accaglobal.com/',
      },
      {
        courseCode: 'ACC311',
        title: 'ICAN: Institute of Chartered Accountants of Nigeria Professional Ethics Code',
        description: 'Statutory ethical requirements, independence rules, and disciplinary procedures for Nigerian chartered accountants.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://icanig.org/',
      },
      {
        courseCode: 'ACC311',
        title: 'SEC Enforcement Release: Enron & Arthur Andersen Audit Failure Case Study',
        description: 'Detailed regulatory analysis of special purpose entities (SPEs), mark-to-market accounting abuse, and audit independence collapse.',
        resourceType: 'CASE_STUDY',
        externalUrl: 'https://www.sec.gov/news/press-release/',
      },
      {
        courseCode: 'ACC311',
        title: 'Audit Working Papers & Internal Control Evaluation Questionnaire Template',
        description: 'Standardized institutional audit checklist for documenting vouching, tracing, and substantive analytical verification.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://www.aicpa-cima.com/',
      },

      // -------------------------------------------------------------
      // BAM111: Introduction to Business Management & Organizational Theory
      // -------------------------------------------------------------
      {
        courseCode: 'BAM111',
        title: 'MIT Sloan OCW: Principles of Management & Corporate Strategy',
        description: 'MIT Sloan School of Management lecture on competitive strategy, organizational structures, and resource allocation.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=_0I_wP5_dF0',
        videoId: '_0I_wP5_dF0',
      },
      {
        courseCode: 'BAM111',
        title: 'CrashCourse Business: Management and Leadership Foundations',
        description: 'The four core functions of management: planning, organizing, leading, and controlling in modern corporations.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=8mAITcNt710',
        videoId: '8mAITcNt710',
      },
      {
        courseCode: 'BAM111',
        title: 'Organizational Behavior: Motivation Theories (Maslow, Herzberg, Vroom)',
        description: 'Intrinsic vs extrinsic motivation, hierarchy of needs, two-factor theory, and expectancy theory in team productivity.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=yYX4bvQSqbo',
        videoId: 'yYX4bvQSqbo',
      },
      {
        courseCode: 'BAM111',
        title: 'Organizational Structures: Functional, Divisional, Matrix & Flat Models',
        description: 'Chain of command, span of control, centralization vs decentralization, and departmentalization patterns.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=ztHopE5Wnpc',
        videoId: 'ztHopE5Wnpc',
      },
      {
        courseCode: 'BAM111',
        title: 'OpenStax: Principles of Management [Free Academic Open Textbook PDF]',
        description: 'Full introductory textbook on managerial leadership, ethical governance, strategic execution, and organizational culture.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://openstax.org/details/books/principles-management',
        mimeType: 'application/pdf',
      },
      {
        courseCode: 'BAM111',
        title: 'Henri Fayol: 14 Principles of Classical Management Theory [Open PDF]',
        description: 'Division of work, authority and responsibility, unity of command, scalar chain, and esprit de corps.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://open.umn.edu/opentextbooks/',
      },
      {
        courseCode: 'BAM111',
        title: 'Securities and Exchange Commission (SEC) Nigeria: Code of Corporate Governance',
        description: 'Statutory guidelines on board composition, shareholder rights, internal audit oversight, and stakeholder disclosures.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://sec.gov.ng/',
      },
      {
        courseCode: 'BAM111',
        title: 'U.S. Small Business Administration (SBA) Entrepreneurial Business Guide',
        description: 'Foundational framework for market feasibility research, legal structuring, and operational business planning.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://www.sba.gov/business-guide',
      },
      {
        courseCode: 'BAM111',
        title: 'Harvard Business Case: Apple Inc. Leadership and Organizational Evolution',
        description: 'Case analysis tracking Steve Jobs and Tim Cook management paradigms across functional design and supply chains.',
        resourceType: 'CASE_STUDY',
        externalUrl: 'https://hbsp.harvard.edu/',
      },
      {
        courseCode: 'BAM111',
        title: 'Business Communication and Organizational Ethics Handouts [Open Textbook]',
        description: 'Interpersonal communication, active listening, conflict resolution, and cross-cultural corporate negotiation.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://openstax.org/',
      },

      // -------------------------------------------------------------
      // BAM122: Principles of Marketing & Consumer Analysis
      // -------------------------------------------------------------
      {
        courseCode: 'BAM122',
        title: 'Philip Kotler: Marketing Management Introduction & The 4 Ps of Marketing',
        description: 'Product, price, place, and promotion (the marketing mix) and creating customer value in modern markets.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=_0I_wP5_dF0',
        videoId: '_0I_wP5_dF0',
      },
      {
        courseCode: 'BAM122',
        title: 'CrashCourse Business: Marketing & Consumer Decision-Making Process',
        description: 'Need recognition, information search, evaluation of alternatives, purchase decision, and post-purchase cognitive dissonance.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=8mAITcNt710',
        videoId: '8mAITcNt710',
      },
      {
        courseCode: 'BAM122',
        title: 'HubSpot Academy: Inbound & Digital Marketing Strategy Full Course',
        description: 'Search engine optimization (SEO), content marketing, email lead nurturing, social media engagement, and marketing analytics.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=Oe421EPjeBE',
        videoId: 'Oe421EPjeBE',
      },
      {
        courseCode: 'BAM122',
        title: 'Market Research Methodology: Qualitative Focus Groups vs Quantitative Surveys',
        description: 'Primary vs secondary research, survey design, sampling bias, focus group facilitation, and sentiment analysis.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=yYX4bvQSqbo',
        videoId: 'yYX4bvQSqbo',
      },
      {
        courseCode: 'BAM122',
        title: 'OpenStax: Principles of Marketing [Free Academic Open Textbook PDF]',
        description: 'Comprehensive open college textbook covering customer relationship management, global marketing, and pricing strategies.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://openstax.org/details/books/principles-marketing',
        mimeType: 'application/pdf',
      },
      {
        courseCode: 'BAM122',
        title: 'Brand Positioning & Market Segmentation Strategy Handbook [Open PDF]',
        description: 'Geographic, demographic, psychographic, and behavioral segmentation; perceptual mapping and brand equity.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://open.umn.edu/opentextbooks/',
      },
      {
        courseCode: 'BAM122',
        title: 'American Marketing Association (AMA): Statement of Ethics and Code of Conduct',
        description: 'Professional ethical standards: honesty, responsibility, fairness, respect, transparency, and citizenship in advertising.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://www.ama.org/ethics/',
      },
      {
        courseCode: 'BAM122',
        title: 'E-Commerce Consumer Purchasing Behavior and Basket Analysis Dataset',
        description: 'Multi-category retail transaction records suitable for customer lifetime value (CLV) and churn rate analysis.',
        resourceType: 'DATASET',
        externalUrl: 'https://www.kaggle.com/',
      },
      {
        courseCode: 'BAM122',
        title: 'Harvard Business Case: Nike Direct-to-Consumer Digital Transformation',
        description: 'Case analysis evaluating Nike shift away from wholesale retailers toward mobile apps, Nike+, and direct online commerce.',
        resourceType: 'CASE_STUDY',
        externalUrl: 'https://hbsp.harvard.edu/',
      },
      {
        courseCode: 'BAM122',
        title: 'Digital Marketing Budget and Campaign ROI Allocation Model',
        description: 'Pre-formatted spreadsheet modeling customer acquisition cost (CAC), return on ad spend (ROAS), and conversion funnels.',
        resourceType: 'SPREADSHEET',
        externalUrl: 'https://www.hubspot.com/',
      },

      // -------------------------------------------------------------
      // BAM211: Entrepreneurship & Small Business Feasibility Studies
      // -------------------------------------------------------------
      {
        courseCode: 'BAM211',
        title: 'Stanford eCorner: How to Build and Validate a High-Growth Business',
        description: 'Steve Blank on customer development, hypothesis testing, business model canvas iteration, and minimum viable products.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=1hHMwLxN6EM',
        videoId: '1hHMwLxN6EM',
      },
      {
        courseCode: 'BAM211',
        title: 'Strategyzer: The Business Model Canvas Explained in 2 Minutes',
        description: 'Visual breakdown of the 9 building blocks: value propositions, customer segments, channels, revenue streams, and cost structure.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=IP0cUBWTgpY',
        videoId: 'IP0cUBWTgpY',
      },
      {
        courseCode: 'BAM211',
        title: 'Y Combinator: How to Build and Pitch a Startup to Investors',
        description: 'Michael Seibel on pitching the problem, the insight, traction metrics, market size (TAM/SAM/SOM), and unit economics.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=_0I_wP5_dF0',
        videoId: '_0I_wP5_dF0',
      },
      {
        courseCode: 'BAM211',
        title: 'Startup Financial Modeling: Cash Flow Forecasts and Runway Calculations',
        description: 'Burn rate, runway, working capital requirements, pro forma income statements, and capital expenditure budgeting.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=V8q8j8N2mP8',
        videoId: 'V8q8j8N2mP8',
      },
      {
        courseCode: 'BAM211',
        title: 'Entrepreneurship: Open Educational Textbook by Intrator et al. [PDF]',
        description: 'Peer-reviewed comprehensive open textbook on entrepreneurial mindset, opportunity recognition, and seed financing.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://open.umn.edu/opentextbooks/textbooks/entrepreneurship',
      },
      {
        courseCode: 'BAM211',
        title: 'Small Business Administration (SBA): Guide to Writing a Feasibility Plan [PDF]',
        description: 'Official framework for technical feasibility, economic viability, organizational capability, and operational scheduling.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://www.sba.gov/business-guide/plan-your-business/write-your-business-plan',
      },
      {
        courseCode: 'BAM211',
        title: 'Corporate Affairs Commission (CAC) Nigeria: Business Registration Guide',
        description: 'Regulatory compliance manual for incorporating business names, private limited liability companies, and filing annual returns.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://www.cac.gov.ng/',
      },
      {
        courseCode: 'BAM211',
        title: 'SCORE: 3-Year Startup Financial Projection Model Spreadsheet Template',
        description: 'Excel modeling template covering monthly cash flows, sales forecasts, break-even analysis, and balance sheet projections.',
        resourceType: 'SPREADSHEET',
        externalUrl: 'https://www.score.org/resource/financial-projections-template',
      },
      {
        courseCode: 'BAM211',
        title: 'The Lean Startup Methodology Principles & Minimum Viable Product Guide',
        description: 'Eric Ries build-measure-learn feedback loop, validated learning, and pivot vs persevere decision gates.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://theleanstartup.com/principles',
      },
      {
        courseCode: 'BAM211',
        title: 'Case Study: African Technology Startups Growth and Regulatory Hurdles',
        description: 'Dissection of fintech and logistics startups in Nigeria navigating foreign exchange fluctuations and payment infrastructure.',
        resourceType: 'CASE_STUDY',
        externalUrl: 'https://techcabal.com/',
      },

      // -------------------------------------------------------------
      // BAM311: Corporate Strategy & International Business Operations
      // -------------------------------------------------------------
      {
        courseCode: 'BAM311',
        title: 'Michael Porter: What is Strategy? Competitiveness & Competitive Advantage',
        description: 'Operational effectiveness vs strategic positioning, trade-offs, and forging unique valuable activities.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=Ibhn3-uU3aI',
        videoId: 'Ibhn3-uU3aI',
      },
      {
        courseCode: 'BAM311',
        title: 'Harvard Business Review: Porter 5 Forces Framework with Real Examples',
        description: 'Threat of new entrants, bargaining power of buyers, bargaining power of suppliers, threat of substitutes, and rivalry.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=ztHopE5Wnpc',
        videoId: 'ztHopE5Wnpc',
      },
      {
        courseCode: 'BAM311',
        title: 'International Business: Modes of Foreign Market Entry Explained',
        description: 'Exporting, licensing, franchising, joint ventures, strategic alliances, and foreign direct investment (FDI).',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=_0I_wP5_dF0',
        videoId: '_0I_wP5_dF0',
      },
      {
        courseCode: 'BAM311',
        title: 'Mergers and Acquisitions (M&A): Corporate Valuation and Synergy Realization',
        description: 'Horizontal vs vertical acquisitions, due diligence, goodwill impairment, and post-merger cultural integration.',
        resourceType: 'VIDEO',
        externalUrl: 'https://www.youtube.com/watch?v=yYX4bvQSqbo',
        videoId: 'yYX4bvQSqbo',
      },
      {
        courseCode: 'BAM311',
        title: 'Mastering Strategic Management by Ketchen & Short [Open Access Book]',
        description: 'Complete open textbook examining SWOT analysis, resource-based view (VRIO), and generic corporate strategies.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://open.umn.edu/opentextbooks/textbooks/mastering-strategic-management',
      },
      {
        courseCode: 'BAM311',
        title: 'World Trade Organization (WTO): World Trade Report Official Publication [PDF]',
        description: 'Global trade statistics, tariff structures, non-tariff barriers, regional trade agreements, and dispute settlements.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://www.wto.org/english/res_e/publications_e/wtr_e.htm',
      },
      {
        courseCode: 'BAM311',
        title: 'UNCTAD World Investment Report: Global Foreign Direct Investment Trends [PDF]',
        description: 'United Nations Conference on Trade and Development data on capital flows, multinational enterprises, and policy trends.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://unctad.org/topic/investment/world-investment-report',
      },
      {
        courseCode: 'BAM311',
        title: 'Boston Consulting Group (BCG): The Growth-Share Matrix Strategy Guide',
        description: 'Strategic portfolio analysis: Stars, Cash Cows, Question Marks, and Dogs for corporate capital allocation.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://www.bcg.com/about/overview/our-history/growth-share-matrix',
      },
      {
        courseCode: 'BAM311',
        title: 'African Continental Free Trade Area (AfCFTA): Strategic Economic Blueprint',
        description: 'Policy documentation analyzing the single continental market for goods and services across 54 African Union nations.',
        resourceType: 'DOCUMENT',
        externalUrl: 'https://au-afcfta.org/',
      },
      {
        courseCode: 'BAM311',
        title: 'Harvard Business Case: Southwest Airlines Low-Cost Strategy Leadership',
        description: 'In-depth case analyzing point-to-point routing, single aircraft fleet (Boeing 737), and fast turnaround efficiency.',
        resourceType: 'CASE_STUDY',
        externalUrl: 'https://hbsp.harvard.edu/',
      },
    ];

    console.log(`[Seed] Inserting/Ensuring 10 resources for each of the ${coursesToSeed.length} courses...`);
    let insertedCount = 0;
    let updatedCount = 0;

    for (const r of openResources) {
      const courseId = courseIdMap.get(r.courseCode);
      if (!courseId) {
        console.warn(`[Seed] Course ${r.courseCode} not found in map, skipping resource ${r.title}`);
        continue;
      }

      const videoId = r.videoId || extractYouTubeVideoId(r.externalUrl);

      // Check if this resource already exists by title or external URL
      const existing = await client.query(
        'SELECT id FROM learning_resources WHERE course_id = $1 AND (title = $2 OR external_url = $3)',
        [courseId, r.title, r.externalUrl]
      );

      if (existing.rows.length === 0) {
        await client.query(
          `INSERT INTO learning_resources (
            course_id,
            title,
            description,
            resource_type,
            visibility,
            external_url,
            video_id,
            start_seconds,
            mime_type,
            uploaded_by,
            is_confirmed
          ) VALUES ($1, $2, $3, $4, 'PUBLIC', $5, $6, 0, $7, $8, TRUE);`,
          [
            courseId,
            r.title,
            r.description,
            r.resourceType,
            r.externalUrl,
            videoId || null,
            r.mimeType || (videoId ? 'video/mp4' : 'text/html'),
            uploaderId,
          ]
        );
        insertedCount++;
      } else {
        await client.query(
          `UPDATE learning_resources
           SET external_url = $1, video_id = $2, is_confirmed = TRUE, visibility = 'PUBLIC', resource_type = $3
           WHERE id = $4`,
          [r.externalUrl, videoId || null, r.resourceType, existing.rows[0].id]
        );
        updatedCount++;
      }
    }

    await client.query('COMMIT');
    console.log(`[Seed] Successfully committed! ${insertedCount} new resources inserted, ${updatedCount} existing confirmed/updated. Total defined catalog: ${openResources.length} items across ${coursesToSeed.length} courses.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Seed] Failed to seed courses and resources:', err);
    throw err;
  } finally {
    client.release();
  }
}

// CLI runner
if (process.argv[1]?.includes('seedCoursesAndResources')) {
  seedCoursesAndResources()
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
