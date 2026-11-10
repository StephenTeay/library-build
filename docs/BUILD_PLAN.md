# FSS-IB E-Library & E-Learning Portal: Build Plan

**Build Scope:** `checkpoint`  
**Checkpoint After:** Milestone 4  
**Current Status:** IN PROGRESS  

---

## Milestones Overview

- [x] **Stage 1: Reference Architecture & Design**
  - Assumptions & $0 Risk Register
  - Architecture Blueprint & Data Flows
  - Database Schema & 500 MB Budget Proof
  - API & Module Contracts (Permission Matrix, Interfaces)
  - PWA & Frontend Architecture
  - Deployment, Operations & NDPA Compliance Guide

- [x] **Milestone 1: Monorepo Scaffold & Tooling**
  - Status: COMPLETED
  - Monorepo structure (`apps/api`, `apps/web`, `functions/api`, `db/migrations`, `db/seed`)
  - Tooling (TypeScript, ESLint, Prettier, package scripts)
  - Docker Compose (Postgres 16 + LocalStack S3 stand-in)
  - `.env.example` blueprint
  - GitHub Actions CI workflow (`.github/workflows/ci.yml`)
  - **Gate:** Docker Compose brings up services cleanly, CI workflow validates (PASSED).

- [x] **Milestone 2: Database Layer & Seed Engine**
  - Status: COMPLETED
  - Migration scripts (Enums, tables, indexes, constraints)
  - Migration runner (`tsx src/db/migrator.ts up/down`)
  - Seed scripts (Departments, courses, dummy staff/students, bootstrap Registrar)
  - **Gate:** Migrations run up/down cleanly on fresh DB; seed successfully populates DB (PASSED).

- [x] **Milestone 3: Authentication, Authorization & Security**
  - Status: COMPLETED
  - Sessions / JWT + rotating refresh tokens with HttpOnly cookies
  - Argon2id password hashing with tuned memory parameters
  - CSRF protection, rate limiting & login lockout
  - Forced password change gate (`must_change_password`)
  - Password reset token handling
  - Role-Scope authorization middleware
  - **Gate:** Tests for every cell of permission matrix, lockout, and rate limiting pass (PASSED: 11/11 tests).

- [x] **Milestone 4: Onboarding & CSV Streaming Importer**
  - Status: COMPLETED
  - Streaming CSV batch importer (100 rows buffer, bounded memory)
  - Error reporting & `import_jobs` logging
  - Self-registration with email verification token
  - Admissions master list matching (`matched_verified`)
  - Staff approval queue with scoped batch actions
  - Email notification adapter (Brevo API + Dev file transport)
  - **Gate:** Streaming CSV importer tests (valid, duplicates, bad rows, BOM/encoding) & approval scope tests pass (PASSED: 12/12 tests, 23/23 total suite).

---

### Checkpoint Reached (BUILD_SCOPE = checkpoint, CHECKPOINT_AFTER = 4)
- Current State: Milestones 1 to 4 completed and fully verified with green tests and clean builds.
- Remaining Milestones: Deferred awaiting review per Section 9.9.
  - Streaming CSV batch importer (100 rows buffer, bounded memory)
  - Error reporting & `import_jobs` logging
  - Self-registration with email verification token
  - Admissions master list matching (`matched_verified`)
  - Staff approval queue with scoped batch actions
  - Email notification adapter (Brevo API + Dev file transport)
  - **Gate:** Streaming CSV importer tests (valid, duplicates, bad rows, BOM/encoding) & approval scope tests pass.

---

### Deferred Milestones (BUILD_SCOPE = checkpoint, checkpoint = 4)
- [ ] **Milestone 5: Content, Storage & Library Services**
  - Status: NOT STARTED (deferred by run settings)
  - Courses, enrollments, and learning resources
  - R2 presigned PUT/GET and confirmation HEAD checks
  - File type and size enforcement
  - LibraryCatalogProvider (LocalCatalogProvider + Koha stub)
  - Open resource aggregator & discussion forums
  - **Gate:** Presigned URL flow tests, storage limits, and library provider tests pass.

- [ ] **Milestone 6: Frontend PWA Implementation**
  - Status: NOT STARTED (deferred by run settings)
  - React 18 PWA app shell and routing
  - Auth, forced password change & dashboard screens
  - Course module viewer with syllabus, resources, and library tabs
  - YouTube Lite facade & Data-Saver mode engine
  - Offline resource caching with storage quota gauge
  - Admin approval queue & CSV upload UIs
  - **Gate:** Component/integration tests pass, production PWA build succeeds.

- [ ] **Milestone 7: Hardening, Security Review & Operations**
  - Status: NOT STARTED (deferred by run settings)
  - Full authorization audit pass & input sanitization check
  - Bundle size validation on main route
  - Final `docs/DEPLOY.md` and `docs/OPERATIONS.md`
  - Final root `README.md`
  - **Gate:** Security audit passes, test suite green, deployment docs complete.
