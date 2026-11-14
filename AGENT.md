# AGENT.md — Autonomous Engineering Constitution
**Project:** Federal School of Statistics, Ibadan (FSS-IB) E-Learning Platform & Digital Library  
**Operating Budget:** $0.00 (Strict Perpetual Free-Tier Architecture)  
**Target Audience:** ND & HND Students, Lecturers, HODs, and Registry Admins in Ibadan, Nigeria  

This document is the binding architectural constitution for all AI agents and human contributors working in this repository. Any code commit, schema migration, UI component, dependency addition, or test modification that violates these laws is invalid and must be rejected or refactored immediately.

---

## 1. Project Identity & Mission

The **FSS-IB E-Learning Platform** is a centralized digital repository, course hub, and library bridge built specifically for the **Federal School of Statistics, Ibadan**. 

* **Academic Scope:** Supports National Diploma (ND) and Higher National Diploma (HND) curricula across six core departments:
  1. **Computer Science** (Code blocks, Git links, programming lab boilerplates)
  2. **Artificial Intelligence** (Google Colab/Kaggle notebooks, model cards, benchmark datasets)
  3. **Networking & Cloud Computing** (Topology diagrams, Packet Tracer/GNS3 lab workbooks, cloud docs)
  4. **Statistics** (R, Python, SPSS, Stata syntax; `.csv`/`.sav`/`.dta` datasets; NBS data portals)
  5. **Accountancy** (Financial statement tables, Excel templates, IFRS/GAAP study guides)
  6. **Business Administration** (Case studies, structured discussion boards, business plan templates)
* **Operational Mandate:** Deliver high reliability, offline resilience, and fast mobile performance across unstable 3G/4G networks on a **$0/month cloud budget**.

---

## 2. Tech Stack & Infrastructure Topology

Every component runs on decoupled, perpetual free-tier infrastructure. Paid add-ons, expiring trials (e.g., standard Railway tiers), and auto-purging databases (e.g., Render's 30-day free PostgreSQL) are prohibited.

| Layer | Service Provider | Hard Resource Ceiling | Operational Strategy |
| :--- | :--- | :--- | :--- |
| **Frontend (PWA)** | **Cloudflare Pages** (or Vercel) | Unlimited bandwidth (CF Pages), static edge delivery | Installable PWA (Next.js App Router or Vite + React) with aggressive service worker caching. |
| **Backend API** | **Render Web Service** (Free) | **512 MB RAM**, 0.1 CPU, spins down after 15m idle | Stateless Node.js (Express/NestJS) or Python (FastAPI). Ping `GET /api/health` every 10m (07:00–22:00 WAT) via UptimeRobot/Cron-job.org. |
| **Database** | **Neon** or **Supabase** (Free) | **500 MB Storage**, shared compute | Serverless PostgreSQL. Must use transaction connection pooling (`pgbouncer`) to prevent connection exhaustion. |
| **Object Storage** | **Cloudflare R2** (Free) | **10 GB Storage**, **0 Egress Fees** | Stores all PDFs, slides, and past questions. Uploads must use client-side Presigned PUT URLs. |
| **Email Service** | **Resend** or **Brevo** (Free) | 3,000–9,000 emails/month | Used strictly for account approval alerts, password resets, and critical registry notices. |

---

## 3. Non-Negotiable Architectural Rules ("The Golden Rules")

1. **NO Paid Infrastructure or Heavy Workers:** Never introduce dedicated Redis instances, Celery/BullMQ worker dynos, or Elasticsearch clusters. Use lightweight in-memory LRU caching (capped at < 30 MB RAM) and PostgreSQL `tsvector` full-text search.
2. **NO Server-Side File Buffering:** Never route binary uploads (lecture PDFs, slides, datasets) through the Render backend. Generate short-lived **Cloudflare R2 Presigned PUT URLs** so browsers upload directly to R2.
3. **NO Full-File Memory Reads:** On the backend, `fs.readFileSync` or loading entire CSV files into memory is **strictly banned**. All bulk CSV imports must use Node.js Streams or Python Generators processed in batches of **100 rows**.
4. **NO Raw YouTube `<iframe>` Tags:** Never render standard YouTube iframes on initial page load (~1.2 MB overhead per video). Store only the 11-character `video_id` and start timestamp (`t`) in PostgreSQL, and render using lightweight click-to-load facade components (< 15 KB).
5. **NO Ephemeral Disk Reliance:** Render's local filesystem resets on every deploy or spin-down. Never save uploaded files, logs, or SQLite databases to local disk.

---

## 4. Authentication, RBAC & Data Privacy Laws

### Credential Normalization & Security
* **Primary Identifier:** `email` — always normalized via `.trim().toLowerCase()` with a unique database index.
* **Initial Password (Bulk Import):** Student's `matric_no` — normalized via `.trim().toUpperCase()` before hashing.
* **Hashing Law:** Matric numbers and user passwords MUST be hashed with **Argon2id** (or `bcrypt` cost ≥ 12) before database insertion. Plaintext storage or printing of matric numbers/passwords in server logs is a critical security violation.
* **Session Tokens:** Issue short-lived JWTs stored in `HttpOnly`, `Secure`, `SameSite=Strict` cookies.

### Onboarding Workflows
1. **Path A — Bulk CSV Import (Registrar / Admin Panel):**
   * Expected CSV columns: `matric_no,email,full_name,department,level,entry_session`
   * Imported accounts are created with `status = 'ACTIVE'` and `must_change_password = true`.
   * On first login using their matric number, middleware must trap all navigation and redirect the user to `/change-password` until updated.
2. **Path B — Self-Registration & Admin Approval Queue:**
   * Self-registered students enter with `status = 'PENDING_APPROVAL'` and `must_change_password = false`.
   * Pending accounts cannot access course materials, R2 download links, or library search endpoints.
   * **Departmental RBAC:** Departmental Admins (HODs/Coordinators) see and approve only students registered under their own department. Super Admins (Registry) have global visibility.
   * **Registry Auto-Match:** If a self-registering matric number matches a pre-uploaded admissions master list, flag the row as `MATCHED_VERIFIED` for one-click batch approval.

---

## 5. UI/UX Design Principles & Low-Bandwidth Standards

### Institutional & Grounded UI Mandate ("No Odd UI")
* **Familiar Academic Mental Models:** The interface must look and behave like a clean, modern, trustworthy higher-education portal—not an experimental design showcase. Use standard top/left navigation, clear hierarchical breadcrumbs (`Department > Level > Course > Resource`), clean white/light-neutral surfaces, legible sans-serif typography (Inter/System UI), and a cohesive academic accent color palette (e.g., Deep Forest Green & Slate).
* **Banned Anti-Patterns:** Do NOT use neon/cyberpunk dark themes, floating radial menus, horizontal scroll-jacking, gratuitous micro-animations, ambiguous icon-only buttons without labels, or non-standard form controls. Every button and link must clearly state what it does.

### Low-Bandwidth & Mobile-First Nigerian UX
* **Android-First Ergonomics:** Design first for 360px–412px mobile viewports on mid/low-tier Android devices. Minimum touch target size: `44x44px`.
* **Offline PWA Resilience:** Maintain a valid `manifest.json` and Service Worker (`Workbox`) caching the app shell, viewed course outlines, and syllabus metadata so students can browse previously opened materials offline.
* **Global Data-Saver Mode:** Provide a persistent **"Data-Saver Mode"** toggle in the top header (`isDataSaverEnabled` in local storage). When active:
  * Suppress YouTube thumbnail facades and decorative images, displaying compact text/audio links and file size badges (e.g., `PDF • 1.4 MB`) instead.
  * Disable background prefetching.

---

## 6. Testing & Functional Integrity Mandate

### Zero-Discard Policy for Failing Tests
* **Strict Prohibition:** Deleting, skipping (`.skip`, `xit`, `@pytest.mark.skip`), commenting out, or weakening assertions on a failing unit, integration, or end-to-end test to achieve a green CI build is **strictly forbidden**.
* **Root-Cause Protocol:** When a test fails, you must trace the failure to its root cause in the application code (or update genuinely stale test fixtures when an intentional schema change occurred), fix the underlying defect, and re-run the full suite until all tests pass legitimately.

### End-to-End Functional Completeness
* **Zero Stubs or Dead Controls:** Every rendered button, search bar, filter dropdown, pagination control, CSV importer, R2 uploader, and approval action must work end-to-end against real database state.
* **Definition of Done:** A feature is complete only when:
  1. Happy path works from UI input to PostgreSQL persistence and back.
  2. Validation errors, empty states, and RBAC `403 Forbidden` boundaries render clear user feedback.
  3. All unit, integration, and E2E tests pass with zero skipped assertions.

---

## 7. Database Schema & Migration Protocol

* **Storage Conservation (500 MB Ceiling):** Use appropriate column types (`VARCHAR(120)` instead of unbounded `TEXT` where applicable, `SMALLINT` for levels/semesters, `JSONB` sparingly for external resource metadata). Never store `BYTEA` binary blobs in PostgreSQL.
* **Mandatory Core Tables & Indexes:**
  * `users` (`id`, `matric_no` UNIQUE, `email` UNIQUE, `password_hash`, `full_name`, `department`, `level`, `role`, `status`, `must_change_password`, `created_at`) — Index on `(department, status)` for fast HOD approval queues.
  * `courses` (`id`, `code` UNIQUE, `title`, `department`, `level`, `semester`, `syllabus_r2_key`) — Index on `(department, level)`.
  * `enrollments` (`id`, `user_id`, `course_id`, `academic_session`) — Composite unique index on `(user_id, course_id, academic_session)`.
  * `learning_resources` (`id`, `course_id`, `title`, `resource_type`, `resource_identifier`, `file_size_bytes`, `metadata_json`, `created_by`, `created_at`) — GIN index on `to_tsvector('english', title)` for instant search.
  * `audit_logs` (`id`, `actor_id`, `action`, `target_id`, `created_at`) — Prune logs older than 180 days via lightweight scheduled cleanup to preserve free DB space.
* **Migration Safety:** All schema changes must be written as idempotent, forward-only SQL migration files.

---

## 8. Decision Framework for New Features

Before adding any new library, API endpoint, database table, or UI widget, evaluate it against this 5-point gate:

1. **Cost Check:** Does this operate 100% within Render, Neon/Supabase, Cloudflare Pages, Cloudflare R2, and Resend free tiers without requiring a credit card or paid tier? *(If NO → Reject)*
2. **RAM Check:** Will this keep peak backend memory usage safely below **350 MB** (leaving headroom under Render's 512 MB hard limit)? *(If NO → Stream or offload to client)*
3. **Bandwidth Check:** Does this degrade gracefully on a 2G/3G mobile connection and respect `isDataSaverEnabled`? *(If NO → Add Data-Saver fallback)*
4. **Clarity Check:** Is the UI pattern immediately intuitive to a first-year student or lecturer without instructions? *(If NO → Simplify to standard UI conventions)*
5. **Verification Check:** Have automated tests been written and passed without skipping or weakening existing tests? *(If NO → Do not merge)*

---

## 9. Code Quality, Error Handling & Git Workflow

* **Log Redaction:** Never log `password`, `matric_no`, `Authorization` headers, or presigned URL query signatures. Mask emails in error logs (`a***@gmail.com`).
* **External Integration Resilience:** Calls to external endpoints—such as the school's **OPAC (Koha/SRU/REST) library catalog**, **National Bureau of Statistics (NBS)**, or **YouTube oEmbed**—must enforce a strict **5-second timeout**. If an external institutional server is offline, catch the timeout gracefully and display cached results or a clean *"Library catalog temporarily unreachable — try again later"* banner without crashing the page.
* **Commit Conventions:** Use Conventional Commits (`feat:`, `fix:`, `chore:`, `test:`, `refactor:`). Every `fix:` commit must include a regression test proving the bug cannot reoccur.

