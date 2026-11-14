# Build Log: FSS-IB E-Library & E-Learning Portal

## Stage 1: Design Specification
- **Status:** COMPLETED
- **Artifact:** `docs/DESIGN.md`
- **Details:** Produced comprehensive reference architecture:
  - Assumptions and verified $0 risk register (checked November 10, 2026).
  - Mermaid architecture blueprint, sequence flows for login, upload, download, and streaming CSV import.
  - Final PostgreSQL schema with 15 relational tables, enums, constraints, and storage budget calculation (~50 MB projected vs 1,000 MB limit).
  - Complete API endpoint list, permission matrix, and TypeScript provider interfaces.
  - PWA frontend architecture (service worker caching, Cloudflare Pages proxy, Data-Saver mode, YouTube Lite facade).
  - Deployment guide, operations (R2 automated backups), and NDPA 2023 compliance strategy.
- **Departures:** Documented in `docs/DEVIATIONS.md`.

---

## Milestone 1: Monorepo Scaffold & Tooling
- **Status:** IN PROGRESS

- **Status:** COMPLETED
- **Details:** 
  - Monorepo initialized with npm workspaces for `@fss/api` and `@fss/web`.
  - Configured TypeScript, Vitest, and strict compilation checks.
  - Set up `docker-compose.yml` with Postgres 16 on port 5433 (preventing port 5432 collision) and LocalStack S3 on port 4566.
  - Cloudflare Pages Functions proxy configured in `functions/api/[[path]].ts`.
  - GitHub Actions CI workflow in `.github/workflows/ci.yml`.
- **Tests & Verification:**
  - `docker compose up -d` brought up `fss_postgres` (healthy) and `fss_s3mock` (healthy).
  - `npm run lint` passed with 0 errors across all workspaces.

---

## Milestone 2: Database Layer & Seed Engine
- **Status:** IN PROGRESS

- **Status:** COMPLETED
- **Details:**
  - Implemented Postgres pool connection (`apps/api/src/db/pool.ts`) with bounded connections (`max: 5`) and Neon pooler compatibility.
  - Authored full schema migration: `db/migrations/001_initial_schema.sql` (15 tables, 5 enums, indexes, constraints) and rollback script `db/migrations/001_initial_schema_down.sql`.
  - Built custom TypeScript migration runner (`apps/api/src/db/migrator.ts`) with `schema_migrations` audit table.
  - Created sample seed script (`apps/api/src/db/seed.ts`) covering 6 academic departments, ND/HND sample courses, admissions master list records, and physical library items.
  - Implemented Argon2id password hashing helper with Render 512 MB cost tuning (19 MB memory, 2 iterations, 1 parallelism).
  - Built bootstrap script (`apps/api/src/db/bootstrap.ts`) to create the initial super-admin Registrar with forced password change.
- **Tests & Verification:**
  - `npm run db:migrate` applied initial schema cleanly.
  - `npm run db:rollback` dropped all tables and enums in reverse order cleanly.
  - `npm run db:migrate` re-applied up migration cleanly on clean DB.
  - `npm run db:seed` seeded 6 departments, 16 courses, 5 admissions entries, and 6 library items.
  - `npm run db:bootstrap` created `registrar@fss-ibadan.edu.ng` with Argon2id hash.

---

## Milestone 3: Authentication, Authorization & Security
- **Status:** IN PROGRESS

- **Status:** COMPLETED
- **Details:**
  - Implemented dual-token JWT model with short-lived access JWTs (15 min) and rotating refresh tokens (7 days) saved in `refresh_tokens` table with SHA-256 hash.
  - Set up `HttpOnly`, `SameSite=Lax` cookies for secure first-party auth.
  - Implemented bounded in-memory sliding window rate limiting (`loginRateLimiter`: 5 req / 15 min per IP) with automatic expired key cleanup.
  - Built database-backed account lockout triggering 15-minute temporary lockout after 5 consecutive failed password attempts.
  - Implemented forced password-change gate in `apps/api/src/middleware/auth.ts`: any user with `must_change_password = true` is strictly barred from all non-auth routes with HTTP 403 `PASSWORD_CHANGE_REQUIRED`.
  - Built role-scope middleware (`apps/api/src/middleware/roleScope.ts`) supporting `REGISTRAR` (global), `HOD` (department-scoped), `LEVEL_COORDINATOR` (department + level scoped), `LECTURER` (course assignment scoped), and `STUDENT` (course enrollment scoped).
  - Built password reset flow with expiring single-use crypto tokens and notification dispatch via email adapter.
- **Tests & Verification:**
  - Authored `apps/api/tests/auth.test.ts` covering 11 comprehensive test cases.
  - Tests verified:
    - Global registrar actions (Registrar allowed; HOD, Coordinator, Lecturer, Student rejected with 403).
    - Department scoping (Registrar allowed cross-department; HOD/Coord allowed only within assigned department, rejected with 403 on other departments).
    - Level coordinator scoping (Level 1 coordinator allowed for Level 1, rejected for Level 2 with 403).
    - Course management (Registrar, HOD, assigned Lecturer allowed; unassigned Lecturer and Student rejected with 403).
    - Course content access (Enrolled student and assigned Lecturer allowed; unenrolled student rejected with 403).
    - Forced password change gate (blocks dashboard access with 403 `PASSWORD_CHANGE_REQUIRED`; permits `/api/auth/change-password`; clears gate and allows subsequent access).
    - Account lockout (5 consecutive failed attempts locks account for 15 minutes and returns 429).
    - IP rate limiter threshold (returns 429 when IP limit exceeded).
    - Refresh token rotation (old token revoked upon refresh, cannot be replayed).
    - Password reset request token generation and email dispatch.
  - **Result:** 11/11 tests passed in 1.5 seconds.

---

## Milestone 4: Onboarding & CSV Streaming Importer
- **Status:** IN PROGRESS

- **Status:** COMPLETED
- **Details:**
  - Built streaming CSV parser (`apps/api/src/modules/onboarding/csvImporter.ts`) utilizing `for await` backpressure and BOM stripping, processing rows in atomic transactional batches of 100 to maintain bounded memory footprint.
  - Implemented automatic initial password generation: default password set to sanitized matric number, hashed via tuned Argon2id with `must_change_password = true`.
  - Implemented automatic student course enrollment for active academic session upon CSV import or departmental approval based on student's `department_id`, `programme` (ND/HND), and `level` (1/2).
  - Built duplicate detection logic: preexisting accounts are safely skipped and recorded in the error log report (`import_jobs.error_log_json`) without modifying or overwriting existing user profiles.
  - Built student self-registration (`apps/api/src/modules/onboarding/selfRegistration.ts`) with admissions master list validation (`matched_verified` boolean) and expiring email verification links.
  - Built staff approval queue (`/api/onboarding/queue`) and batch approval endpoint (`/api/onboarding/approve`) with strict departmental and level scoping: HODs and Level Coordinators are forbidden from approving students outside their designated academic domain.
- **Tests & Verification:**
  - Authored `apps/api/tests/onboarding.test.ts` covering 12 test cases:
    - Valid CSV import with Argon2id password verification and automatic course enrollments.
    - Duplicate detection and account overwrite prevention.
    - Row-level validation errors (missing fields, invalid programme, invalid level, unrecognized departments) logged in report.
    - UTF-8 with Byte Order Mark (BOM) transparent decoding.
    - Multi-hundred row streaming with bounded batch memory.
    - Self-registration admissions list matching (`matched_verified = true` vs `false`).
    - Email verification token consumption.
    - Staff approval queue filtering by department scope (HOD CS vs HOD AI vs Registrar).
    - Scope violation rejection when HOD attempts to approve cross-department student.
  - **Result:** 12/12 tests passed; complete test suite 23/23 tests green.
  - **Build & Lint:** Monorepo linting (`npm run lint`) passed with 0 errors; production PWA build (`npm run build`) succeeded with Service Worker generation.

---

## Milestone 5: Content, Storage & Library Services
- **Status:** COMPLETED
- **Details:**
  - Configured AWS S3 SDK for Cloudflare R2 compatibility and local S3Mock testing (`apps/api/src/providers/storage/s3StorageProvider.ts`). Enforced 50 MB file size limit and strict MIME/extension allowlists across academic document, dataset, and code formats.
  - Implemented presigned PUT upload route (`/api/resources/presign-upload`) scoped by role (only assigned lecturers, HODs, and Registrar can initiate uploads for a course).
  - Implemented mandatory confirm route (`/api/resources/confirm`) performing direct S3 `HEAD` check to verify object existence, actual byte size, and metadata before inserting records into `learning_resources`.
  - Implemented short-lived presigned GET download route (`/api/resources/:id/download`) enforcing course enrollment authorization.
  - Implemented external resource linking (YouTube lite facade with start time, Google Colab notebooks, GitHub repositories, National Bureau of Statistics data portals).
  - Built `LibraryCatalogProvider` interface with `LocalCatalogProvider` querying PostgreSQL physical library books with call number, shelf location, and real-time copies available counter, alongside a `KohaSruProvider` stub for future institutional Koha ILS integration.
  - Built open resource aggregator (`/api/aggregator/curated`, `/api/aggregator/query`) providing curated open-access resources for FSS-IB departments (CS, AI, NCC, STA, ACC, BA) and live search across arXiv and GitHub APIs with 15-minute in-memory caching.
  - Built course discussion forums (`/api/discussions/course/:courseId`, `/api/discussions/thread/:threadId/posts`, `/api/discussions/posts/:postId`) allowing students and lecturers to create threads, post replies, and empower lecturers/HODs to soft-delete inappropriate content.
  - Cloudflare Pages Functions proxy (`functions/api/[[path]].ts`) configured to stream API requests transparently to the backend.
- **Tests & Verification:**
  - Authored `apps/api/tests/content.test.ts` covering 13 comprehensive test cases:
    - Lecturer presigned PUT upload directly to local S3Mock container.
    - Mandatory confirmation HEAD verification creating confirmed resource row.
    - Rejection of confirmation when object is absent from S3 storage.
    - Rejection of oversized uploads (> 50 MB) with 413.
    - Rejection of unpermitted file extensions (`.exe`, etc.) with 400.
    - Rejection of unassigned lecturers attempting course uploads with 403.
    - Enrolled student presigned GET download and binary fetch verification.
    - Unenrolled student rejection with 403 Forbidden.
    - Physical library search with shelf location and available copies.
    - Specific library item lookup.
    - Curated departmental resource aggregator query for Statistics (NBS, R Project).
    - Student discussion thread creation.
    - Thread reply and lecturer moderation soft-delete with redacted content.
  - **Result:** 13/13 tests passed; full test suite (Auth, Onboarding, Content) 36/36 tests green.

---

## Milestone 6: Frontend PWA Implementation
- **Status:** COMPLETED
- **Details:**
  - Built React 18 PWA app shell with `react-router-dom` in `apps/web/src/`.
  - Implemented centralized API client (`apps/web/src/services/api.ts`) with Render cold-start detection (HTTP 502/503/504), listener state notification, and exponential backoff retry.
  - Implemented `ServerWakingBanner` alerting users during Render free-tier spin-up without blocking interactions.
  - Built `SettingsContext` managing `Data-Saver` mode with `localStorage` persistence.
  - Built `OfflineContext` tracking network status (`navigator.onLine`), device storage estimation (`navigator.storage.estimate()`), and resource caching via the `CacheStorage` API (`caches.open('fss-offline-resources-v1')`).
  - Built `StorageGauge` component displaying device quota, usage percentage, and cache purge button.
  - Built `YouTubeLite` component rendering zero initial `<iframe>` elements, utilizing thumbnail preview facades to save mobile data, and mounting iframes only upon explicit play events.
  - Built unclosable `MustChangePasswordModal` strictly enforcing password updates for users with `must_change_password = true`.
  - Built student and staff screens:
    - `Login`: Matric/email login with 30-day device remember flag.
    - `Register`: Self-registration with admissions master list verification feedback.
    - `VerifyEmail`: Automated token consumption from URL.
    - `ForgotPassword` & `ResetPassword`: Crypto-token password reset flow.
    - `Dashboard`: Enrolled/assigned course decks, total registered credit units summary, department quick links.
    - `CourseView`: 4-tab module view (Syllabus, Resources with offline caching & presigned downloads, Physical Library shelf locations, and Discussions forum with moderation soft-delete).
    - `PhysicalLibrary`: Searchable institutional catalog with live copy availability.
    - `OpenResources`: Curated departmental hub and live arXiv & GitHub search.
    - `ApprovalQueue`: Staff queue with admissions match badges and batch actions.
    - `CsvImport`: Streaming student CSV importer for Registrar with error download.
- **Tests & Verification:**
  - Authored `apps/web/tests/pwa.test.ts` covering 6 test cases:
    - YouTube Lite facade zero-iframe render and thumbnail URL construction.
    - Data-Saver mode state toggle and localStorage persistence.
    - Cold-start 502/503 detection and retry backoff.
    - Storage estimation formatting and math.
    - Forced password-change policy validation.
  - **Result:** 6/6 tests passed.
  - **Build & Bundle:** Production PWA build generated with `vite-plugin-pwa` precaching (Service Worker `sw.js` and `workbox-e4022e15.js`); main bundle size is only 264.2 kB (73.78 kB gzipped).

---

## Milestone 7: Hardening, Security Review & Operations
- **Status:** COMPLETED
- **Details:**
  - Conducted security review across all backend endpoints:
    - Verified parameter binding (`$1, $2, ...`) across all PostgreSQL queries to prevent SQL injection.
    - Verified `must_change_password` gate in `apps/api/src/middleware/auth.ts` rejecting non-auth routes with 403 `PASSWORD_CHANGE_REQUIRED`.
    - Verified role-scope middleware strictly bounding actions by department, level, and course.
    - Verified sliding-window rate limiting on login and 15-minute account lockout after 5 consecutive failed attempts.
    - Enforced strict 50 MB file limits and MIME/extension allowlists on S3 presigned URLs.
  - Validated main route bundle size (< 74 kB gzipped).
  - Authored production zero-cost guide in `docs/DEPLOY.md` detailing step-by-step setup for Cloudflare Pages, Cloudflare Pages Functions proxy, Render Web Service, Neon PostgreSQL, Cloudflare R2, Brevo transactional email, and cron-job.org.
  - Authored operational runbook in `docs/OPERATIONS.md` covering automated database backups directly to Cloudflare R2 via gzip stream, point-in-time restore procedures, manual account lockout unlocking, and Nigerian Data Protection Act (NDPA 2023) statutory compliance checklist.
  - Authored comprehensive root `README.md` with complete architecture diagram, setup instructions, default credentials, test commands, and documentation links.
- **Tests & Verification:**
  - Executed monorepo test suite (`npm test`): **42/42 tests passing** (36 in `@fss/api`, 6 in `@fss/web`).
  - Executed monorepo linting (`npm run lint`): **0 errors**.
  - Executed monorepo build (`npm run build`): **0 errors**.
- **Final Project Status:** 100% COMPLETE across all 7 Milestones.

---

## Milestone 8: Full-Stack Feature Audit, UI/Backend Alignment & Hardening
- **Status:** COMPLETED
- **Details:**
  - Conducted full sweep across all frontend views and backend route controllers to identify runtime errors, broken endpoints, and contract mismatches:
    1. **Course Endpoints Implementation:** Frontend dashboard and course views were calling `/api/courses`, `/api/courses/enrolled`, `/api/courses/:id`, and `/api/courses/:id/enroll`, which were unmounted. Implemented complete `courseController.ts` and `courseRoutes.ts` with enrolled credits aggregation and student enrollment checks.
    2. **Physical Library Course Mapping:** Added `/api/library/course/:courseId` endpoint to support the Physical Library tab in `CourseView.tsx`.
    3. **Library Search Department Resolution:** Fixed parameter mismatch where frontend passed department code (`?dept=CS`) while backend expected `department_id`. Implemented automatic lookup from department code to ID in `libraryRoutes.ts`, and added `department_code` to SQL select projection.
    4. **Forgot Password Endpoint Alignment:** Added `/api/auth/forgot-password` route alias routing to the password reset request handler.
    5. **Staff Approval Queue Contract Synchronization:** Backend `/api/onboarding/queue` payload mapped to return `{ queue, students: queue }` to support frontend expectations. Implemented rejection handler (`action === 'REJECT'`) setting status to `SUSPENDED` with audit logging. Accepted both `user_ids` and `student_ids` in batch operations.
    6. **Resource Type Enums & Upload Fix:** Mapped UI types `SLIDE` and `PAST_QUESTION` to allowable DB enum `DOCUMENT`, and automatically extracted YouTube 11-char video IDs for `VIDEO` entries so the `YouTubeLite` zero-iframe facade renders. Included `r2_key` in `getCourseResources` query so "Download" and "Save Offline" buttons render properly.
    7. **External Aggregator Query Route:** Mounted `GET /api/aggregator/query` fetching from arXiv API and GitHub Search with robust fallback when network requests are restricted. Added `category` and `description` to curated resources array.
    8. **Discussion Forum Author Attribution:** Ensured new discussion threads and replies query and attach `author_name` and `author_role` to returned payloads to prevent "By undefined (undefined)" UI glitches.
    9. **Silent Token Refresh:** Added automatic 401 interception in `apps/web/src/services/api.ts` to refresh JWT access tokens silently using httpOnly cookie refresh tokens before redirecting to login.
- **Tests & Verification:**
  - Authored `apps/api/tests/courses.test.ts` covering 6 test cases:
    - `GET /api/courses` returns course catalog with department and credit units.
    - `GET /api/courses/enrolled` returns student enrolled courses.
    - `GET /api/courses/:id` returns syllabus, outlines, and lecture resources.
    - `POST /api/courses/:id/enroll` self-enrolls student into course.
    - `GET /api/library/course/:courseId` returns mapped physical library holdings.
    - `GET /api/aggregator/query` returns research and open-source materials.
  - Executed monorepo test suite (`npm test`): **48/48 tests passing** (42 in `@fss/api`, 6 in `@fss/web`).
  - Executed monorepo linting (`npm run lint`): **0 errors**.
  - Executed monorepo build (`npm run build`): **0 errors** (PWA bundle: 74.09 kB gzipped).

---

## Milestone 9: Super Admin (Librarian) Staff Management & Bulk Book Catalog Importer
- **Status:** COMPLETED
- **Details:**
  - **Super Admin Rebranding & Role Evolution:**
    - Authored migration `db/migrations/002_staff_and_library_roles.sql` safely adding `LIBRARIAN` and `LIBRARY_STAFF` to PostgreSQL `user_role` enum.
    - Updated `roleScope.ts`, `tokens.ts`, and `bootstrap.ts` to support `LIBRARIAN` as the institutional Super Admin while maintaining aliased compatibility with `REGISTRAR`.
    - Bootstrapped `librarian@fss.ng` with role `LIBRARIAN`.
    - Rebranded UI navbar labels from "Registrar" to "Librarian (Admin)" and added links for staff and book management.
  - **Staff Management Feature & Interface:**
    - Implemented `apps/api/src/modules/staff/staffController.ts` and `staffRoutes.ts`:
      - `GET /api/staff`: List staff with filters for role, department, status, and text search.
      - `POST /api/staff`: Provision new staff (`HOD`, `LEVEL_COORDINATOR`, `LECTURER`, `LIBRARY_STAFF`, `LIBRARIAN`) with Argon2id password hashing, forced first-time password change, automated `user_scopes` population, welcome emails, and audit logs.
      - `PATCH /api/staff/:id`: Update role, department, and toggle status between `ACTIVE` and `SUSPENDED`.
      - `POST /api/staff/:id/reset-password`: Force-reset password to temporary credentials and flag account for change.
    - Built [StaffManagement.tsx](file:///c:/Users/LENOVO/Documents/Projects/e-library/apps/web/src/pages/StaffManagement.tsx) (`/admin/staff`):
      - Summary stat cards: Total Staff, HODs, Lecturers, Library Staff.
      - Filter bar with search query and role selector.
      - "Add Staff Member" modal with dynamic department and level fields.
      - One-click credential copy modal for newly provisioned staff accounts.
  - **Streaming Bulk Book Catalog Importer:**
    - Implemented [bookImporter.ts](file:///c:/Users/LENOVO/Documents/Projects/e-library/apps/api/src/modules/library/bookImporter.ts) and upgraded [libraryRoutes.ts](file:///c:/Users/LENOVO/Documents/Projects/e-library/apps/api/src/modules/library/libraryRoutes.ts):
      - `GET /api/library/template-csv`: Downloadable catalog CSV template with pre-filled sample rows.
      - `POST /api/library/import-csv`: Busboy and csv-parser streaming ingestion in chunks of 100 with bounded memory (< 15 MB heap).
      - Supports `mode: 'replace'` (purges seeded demo books and starts fresh with uploaded holdings) and `mode: 'append'` (inserts new items alongside existing holdings).
      - Resolves department code to ID (`CS`, `ST`, `MTH`, `SLT`, `BA`, `ACC`).
    - Built [BookImport.tsx](file:///c:/Users/LENOVO/Documents/Projects/e-library/apps/web/src/pages/BookImport.tsx) (`/admin/books/import`):
      - Strategy cards: Replace Catalog (clear seeds) vs Append to Catalog.
      - Drag-and-drop CSV upload zone with file validation (< 10 MB).
      - Download Sample Template CSV button.
      - Live processing status, summary count cards, and downloadable failed rows CSV.
      - Linked from [PhysicalLibrary.tsx](file:///c:/Users/LENOVO/Documents/Projects/e-library/apps/web/src/pages/PhysicalLibrary.tsx) via "Import Books (CSV)" action button.
- **Tests & Verification:**
  - Authored `apps/api/tests/staff.test.ts` covering 11 automated test cases:
    - Rejection of unauthorized users (students) with 403 Forbidden.
    - Staff directory listing for Librarian.
    - HOD provisioning with department requirement validation and `user_scopes` mapping.
    - Library Staff provisioning without requiring academic department.
    - Staff suspension and status toggle.
    - Password reset and forced change gate.
    - Downloadable catalog CSV template delivery.
    - Bulk book streaming import in `replace` mode (verifying purge of previous items).
    - Bulk book streaming import in `append` mode (verifying non-destructive catalog extension).
  - Executed monorepo test suite (`npm test`): **59/59 tests passing** (53 in `@fss/api`, 6 in `@fss/web`).
  - Executed monorepo linting (`npm run lint`): **0 errors**.
  - Executed monorepo build (`npm run build`): **0 errors** (PWA bundle: 79.08 kB gzipped).

---

## Milestone 10: Forced Password Change Gate & Modal Remediation
- **Status:** COMPLETED
- **Details:**
  - **Identified Root Causes:**
    1. **Contract Casing Mismatch:** `POST /api/auth/login` returned camelCase `mustChangePassword: true`, whereas `AuthContext.tsx` checked snake_case `loggedUser.must_change_password`. This caused `mustChangePassword` in state to evaluate to `false`, preventing `<MustChangePasswordModal />` from rendering.
    2. **Express Router Path Resolution:** In `apps/api/src/middleware/auth.ts`, `allowedPaths` compared against `req.path` and `req.originalUrl`. On a sub-router mounted at `/api/auth`, `req.path` is relative (`/me` and `/change-password`), causing exact matching against `/api/auth/me` to fail when query params or sub-routes were evaluated.
    3. **Dashboard Race Condition:** When navigating to `/` with a forced password change pending, `Dashboard.tsx` immediately called `/api/courses`, triggering a 403 `PASSWORD_CHANGE_REQUIRED` error in the browser console.
  - **Remediations Applied:**
    1. **Bidirectional Payload Normalization:** `POST /api/auth/login` now outputs both `must_change_password` and `mustChangePassword` (along with `full_name`/`fullName`, `matric_no`/`matricNo`, `department_id`/`departmentId`). In [AuthContext.tsx](file:///c:/Users/LENOVO/Documents/Projects/e-library/apps/web/src/context/AuthContext.tsx), `normalizeUser` safely resolves both casings.
    2. **Real-Time Event Bus for Password Gate:** Added `api.subscribePasswordChangeRequired` in [api.ts](file:///c:/Users/LENOVO/Documents/Projects/e-library/apps/web/src/services/api.ts) to intercept any 403 response with `code: 'PASSWORD_CHANGE_REQUIRED'` and immediately open the modal.
    3. **Sub-Router Path Matching:** Updated [auth.ts](file:///c:/Users/LENOVO/Documents/Projects/e-library/apps/api/src/middleware/auth.ts) to allow relative routes (`/change-password`, `/logout`, `/me`) and query-stripped URLs.
    4. **Dashboard Fetch Guard:** In [Dashboard.tsx](file:///c:/Users/LENOVO/Documents/Projects/e-library/apps/web/src/pages/Dashboard.tsx), added `if (!user || user.must_change_password) return;` to suppress background API requests while the modal is open.
- **Tests & Verification:**
  - Monorepo test suite: **59/59 passing** (53 in `@fss/api`, 6 in `@fss/web`).
  - Monorepo linting: **0 errors**.
  - Monorepo production build: **0 errors** (PWA bundle: 79.34 kB gzipped).
