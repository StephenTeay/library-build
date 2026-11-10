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

## Checkpoint Status (Stop Point: Milestone 4)
- **Status:** STOPPED AT CHECKPOINT 4
- **Next Step:** Awaiting reviewer confirmation to continue with Milestone 5 (Content & Storage).
