# Reference Architecture: FSS-IB Zero-Cost E-Learning Portal & Digital Library

**Institution:** Federal School of Statistics, Ibadan (FSS-IB), Nigeria  
**Document:** System Architecture & Technical Design Specification (Stage 1 Reference)  
**Date Checked / Verified:** November 10, 2026  
**Status:** Approved Reference Design  

---

## 1. Assumptions & $0 Risk Register

### 1.1 Assumptions
1. **Backend Framework:** Node.js with Express 4.x / 5.x is selected over NestJS to minimize idle memory (< 45 MB baseline vs ~130 MB for NestJS) and guarantee fast boot under Render's 512 MB RAM limit.
2. **Session / Token Strategy:** Dual-token model using short-lived access JWTs (15-minute expiration) and rotating refresh tokens (7-day sliding expiration) stored in `HttpOnly`, `Secure`, `SameSite=Lax` cookies, with active session records tracked in Postgres (`refresh_tokens`) for instantaneous revocation.
3. **Database Drivers & Pooling:** Neon serverless PostgreSQL connection string with PgBouncer connection pooling (`-pooler` endpoint) utilizing the Node `pg` client with bounded connection pool (`max: 5`) to prevent connection exhaustion.
4. **Password Hashing Cost Parameters:** Argon2id with `memoryCost: 19456` (19 MiB), `timeCost: 2` iterations, and `parallelism: 1`, ensuring hashing finishes in < 75 ms per call while staying strictly below 30 MB heap overhead.
5. **CSV Batch Streaming & Max Payload:** Multipart streaming parser using `fast-csv` / `csv-parser` chunked into 100-row transactional database batches, with an enforced 10 MB maximum upload limit (`maxFileSize: 10 * 1024 * 1024`).
6. **Enrollment Model:** Auto-enrollment model based on a student's `department_id`, `programme` (ND or HND), and `level` (1 or 2) upon active session initialization, with manual exception handling (add/drop/carryover) managed by lecturers and HODs in `enrollments`.
7. **ND to HND Progression Model:** Retains the original student account record (`user_id` and email), updates `programme` to `'HND'`, resets `level` to 1, sets new `entry_session`, logs an audit entry in `audit_logs`, and preserves full ND academic transcript and historical enrollment records.
8. **Object Storage Direct Access:** Private Cloudflare R2 bucket accessed exclusively via AWS SDK v3 S3 client presigned URLs (15-minute validity for PUT, 15-minute validity for GET); the backend never buffers or proxies multi-megabyte user files.
9. **Offline Asset Caching Key:** Service Worker caches verified resources using the persistent API resource URL or CacheStorage indexed by `resource_id` upon explicit user action ("Save for Offline"), bypassing ephemeral R2 presigned URLs.
10. **Device Storage Quota:** Frontend queries `navigator.storage.estimate()` to dynamically report storage usage and prevent mobile browser storage eviction on mid/low-tier devices.
11. **Dev / Test Environment Substitution:** Local Docker Compose environment running PostgreSQL 16/18 and MinIO (S3-compatible R2 stand-in), alongside a Brevo email adapter that writes to stdout and appends to `logs/dev-emails.log`.

---

### 1.2 $0 Risk Register (Verified Free-Tier Limits)

All free tiers verified against provider documentation as of **November 10, 2026**.

| Service | Free Tier Quota / Specifications | Constraints & Failure Modes | Mitigation Strategy |
|---|---|---|---|
| **Render Web Service** (Backend) | 512 MB RAM, fractional CPU (0.1–0.5 vCPU), 750 free instance hours/month, 5 GB outbound bandwidth/month | Spins down after 15 minutes of inactivity; cold starts take 50–60 seconds; stateless (no persistent disk) | Health check ping (`GET /api/health`) every 10 min during active hours (07:00–22:00 WAT). Frontend displays "Server waking up" indicator with automatic exponential backoff retries. |
| **Neon Serverless Postgres** | 1.0 GB storage per project, 100 Compute Unit (CU) hours/month, autoscaling 0.25–2 CU, 5 GB egress/month | Compute suspends after 5 minutes of inactivity (wake-up takes 1–3s). Storage never auto-deletes. If CU-hours exhausted, compute pauses until next billing month. | Connection pooling via Neon `-pooler` endpoint. Total data schema sized under 45 MB for 3,000 active students. Cold start wake-up handled gracefully via query retry loops. |
| **Cloudflare Pages & Functions** | Unlimited static bandwidth, 100,000 Function requests/day, 10 ms CPU time per request, 500 builds/month | Daily request quota reset at midnight UTC. 10 ms CPU limit strictly covers execution, not network I/O wait. | Pages Functions act purely as a lightweight streaming proxy (`fetch` pipe) passing headers and cookies without CPU-heavy transformation. Static assets served from Cloudflare CDN edge without consuming Function quota. |
| **Cloudflare R2** (Private Bucket) | 10 GB standard storage/month, 1,000,000 Class A operations/month (writes/lists), 10,000,000 Class B operations/month (reads), $0 egress | Bucket requires an initial Cloudflare account setup. Presigned PUT/GET links require clock synchronization. | Client direct-to-R2 presigned PUT/GET bypasses backend memory. Confirm step checks object presence via single `HEAD` request. No public bucket access. |
| **Brevo** (Transactional Email) | 300 emails/day, single-sender address verification, 100,000 contact storage | Strict daily sending quota (300/day). Free emails include Brevo footer. Custom domain not required (verified sender email). | Bulk CSV student imports do NOT send emails by default (`send_welcome_email=false`). Emails strictly reserved for self-registration verification and password resets. |
| **cron-job.org / UptimeRobot** | cron-job.org: 1-minute execution intervals, 30s timeout, 64 KB response limit. UptimeRobot: 50 monitors at 5-min intervals. | Cron execution failure if cold start > 30s on initial wake. | Health endpoint `GET /api/health` returns immediate 200 OK (`{"status":"ok"}`) with zero DB query overhead to prevent 30s timeouts. Scheduled to ping every 10 minutes between 07:00 and 22:00 WAT. |

#### Specific Provider Exclusions
- **Supabase:** Explicitly excluded because projects on the free tier enter automatic pause after 7 days of inactivity, requiring manual admin unpausing in the web dashboard.
- **Resend:** Explicitly excluded because it enforces custom domain verification (DKIM/SPF DNS records) to send emails to arbitrary student inboxes, which violates the zero-cost, no-custom-domain requirement.

---

## 2. Architecture Blueprint

### 2.1 System Component Diagram

```mermaid
flowchart TD
    subgraph Client["Student / Staff Device (Mobile PWA & Desktop)"]
        UI["React 18 PWA (Vite + vite-plugin-pwa)"]
        SW["Service Worker (CacheStorage + Offline Queue)"]
        DS["Data-Saver Engine (Local State)"]
    end

    subgraph Edge["Cloudflare Edge Network (*.pages.dev)"]
        CDN["Cloudflare Pages (Static Shell & Assets)"]
        Proxy["Pages Functions Proxy (/api/*)"]
    end

    subgraph Backend["Render Cloud (*.onrender.com)"]
        API["Node.js Express API (< 512 MB RAM)"]
        AuthM["Auth & Role-Scope Guard"]
        RateL["Rate Limiter & Lockout Cache"]
        StreamP["Streaming CSV Importer"]
        R2Signer["S3 Presign & Confirm Service"]
    end

    subgraph Data["Persistent Cloud Storage ($0)"]
        Neon[("Neon Postgres Serverless (< 1 GB)")]
        R2[("Cloudflare R2 Private Bucket (10 GB)")]
    end

    subgraph External["External Integrations"]
        Brevo["Brevo Email API (300/day)"]
        CronJob["cron-job.org (WAT Keep-Alive)"]
        ExtAPIs["arXiv / GitHub APIs / Curated Links"]
    end

    UI -->|Static Shell| CDN
    UI <-->|App & Offline Sync| SW
    UI -->|API Requests with Cookie| Proxy
    Proxy -->|Same-Origin Forward with Auth Header| API
    CronJob -->|GET /api/health| API

    API --> AuthM
    AuthM --> RateL
    API --> StreamP
    API --> R2Signer

    API <-->|Pooled SQL Queries| Neon
    R2Signer -->|Issue Presigned PUT/GET & HEAD Check| R2
    UI <-->|Direct Presigned PUT/GET| R2
    API -->|Send Verification & Resets| Brevo
    API <-->|Cached External Queries| ExtAPIs
```

---

### 2.2 Sequence Flows

#### A. Authentication Flow (Login & Lockout)
```mermaid
sequenceDiagram
    autonumber
    actor User as Student / Staff
    participant Web as PWA Client
    participant Proxy as Pages Proxy (/api)
    participant API as Express API
    participant DB as Neon Postgres

    User->>Web: Enters Matric/Email & Password
    Web->>Proxy: POST /api/auth/login { identifier, password }
    Proxy->>API: Forward POST with Client IP
    API->>API: Check IP & Account Lockout Status
    alt Account is Locked
        API-->>Proxy: 429 Too Many Requests (Lockout active)
        Proxy-->>Web: Display lockout countdown
    else Attempts Permitted
        API->>DB: Query user by matric_no or email
        DB-->>API: User record (password_hash, status, must_change_password)
        API->>API: Verify password via Argon2id
        alt Password Invalid
            API->>DB: Increment failed_attempts, log audit
            API-->>Proxy: 401 Unauthorized
            Proxy-->>Web: Invalid credentials error
        else Password Valid
            API->>DB: Reset failed_attempts, create refresh_tokens record
            API-->>Proxy: 200 OK + Set-Cookie (accessToken, refreshToken)
            Proxy-->>Web: 200 OK (User profile, must_change_password flag)
            alt must_change_password == true
                Web->>User: Route immediately to /change-password (Block all tabs)
            else Normal Active User
                Web->>User: Redirect to Department Dashboard
            end
        end
    end
```

#### B. Direct File Upload Flow (Presigned PUT + Confirmation)
```mermaid
sequenceDiagram
    autonumber
    actor Lecturer as Lecturer / Admin
    participant Web as PWA Client
    participant API as Express API
    participant R2 as Cloudflare R2 Bucket
    participant DB as Neon Postgres

    Lecturer->>Web: Selects resource file (e.g. CS101_Lab1.pdf)
    Web->>API: POST /api/resources/presign-upload { course_id, filename, mime_type, size_bytes }
    API->>API: Verify Role-Scope & File Allowlist (pdf, docx, zip, py, r) & Size (< 50MB)
    API->>API: Generate unique r2_key: courses/{course_id}/{uuid}-{filename}
    API->>API: Sign S3 PutObjectCommand (expiresIn: 900s)
    API-->>Web: 200 OK { r2_key, upload_url }
    Web->>R2: PUT upload_url (Direct binary stream)
    R2-->>Web: 200 OK (Upload complete)
    Web->>API: POST /api/resources/confirm { course_id, title, r2_key, mime_type, size_bytes, metadata }
    API->>R2: HeadObjectCommand(r2_key)
    alt Object Missing or Size Mismatch
        API-->>Web: 400 Bad Request ("Storage object verification failed")
    else Object Verified
        API->>DB: INSERT INTO learning_resources (is_confirmed=true)
        DB-->>API: Row created
        API-->>Web: 201 Created (Resource published)
    end
```

#### C. Authorized Download Flow & Offline Caching
```mermaid
sequenceDiagram
    autonumber
    actor Student as Enrolled Student
    participant Web as PWA Client
    participant SW as Service Worker / CacheStorage
    participant API as Express API
    participant R2 as Cloudflare R2 Bucket

    Student->>Web: Clicks "Download / Save Offline" on Resource
    Web->>SW: Check CacheStorage for resource_{id}
    alt Cached in Service Worker
        SW-->>Web: Return cached Blob / Response
        Web->>Student: Instant offline view / download
    else Not Cached
        Web->>API: GET /api/resources/{id}/download
        API->>API: Verify Student Enrollment / Role Scope
        API->>API: Sign S3 GetObjectCommand (expiresIn: 900s)
        API-->>Web: 200 OK { download_url }
        Web->>R2: GET download_url
        R2-->>Web: Binary file stream
        alt User clicked "Save for Offline"
            Web->>SW: Put file stream into CacheStorage as resource_{id}
            Web->>Web: Update Storage Quota Indicator
        end
        Web->>Student: Deliver file
    end
```

#### D. Streaming CSV Bulk Student Import Flow
```mermaid
sequenceDiagram
    autonumber
    actor Admin as Registrar / HOD
    participant Web as Admin Portal
    participant API as Express API
    participant DB as Neon Postgres

    Admin->>Web: Uploads students_entry.csv (ND/HND cohort)
    Web->>API: POST /api/onboarding/import-csv (Multipart stream)
    API->>DB: INSERT INTO import_jobs (status='PROCESSING')
    API->>API: Pipe stream through csv-parser (100 rows buffer)
    loop Every 100 Rows
        API->>API: Validate schema, normalize matric (upper) & email (lower)
        API->>API: Compute default password hash (Argon2id)
        API->>DB: Query existing users by matric_no & email
        API->>API: Deduplicate: existing rows marked "SKIPPED_DUPLICATE"
        API->>DB: Batch INSERT valid new users (must_change_password=true, status='ACTIVE')
        API->>DB: Batch INSERT auto-enrollments based on dept/programme/level
        API->>API: Flush memory buffer
    end
    API->>DB: UPDATE import_jobs (status='COMPLETED', error_log_json, counts)
    API-->>Web: 200 OK { job_id, total, successful, skipped, failed, error_report_url }
    Web->>Admin: Show Import Summary & Downloadable Error CSV
```

---

### 2.3 Monorepo Directory Structure

```
fss-elibrary/
├── .github/
│   └── workflows/
│       └── ci.yml               # Automated lint, build, and test validation
├── apps/
│   ├── api/                     # Backend Express Application
│   │   ├── src/
│   │   │   ├── config/          # Environment, constants, Argon2 parameters
│   │   │   ├── db/              # Neon Postgres connection pooler client
│   │   │   ├── middleware/       # Auth, role-scope, rate-limit, error handlers
│   │   │   ├── modules/
│   │   │   │   ├── auth/        # Login, logout, refresh, password reset, lockout
│   │   │   │   ├── onboarding/  # CSV stream importer, self-reg, approval queue
│   │   │   │   ├── courses/     # Course catalog, assignments, enrollments
│   │   │   │   ├── resources/   # R2 presigned PUT/GET, confirm, delete
│   │   │   │   ├── library/     # LibraryCatalogProvider (Local + Koha stub)
│   │   │   │   ├── discussions/ # Course discussion forums and moderation
│   │   │   │   └── aggregator/  # Curated links, arXiv/GitHub cached proxy
│   │   │   ├── providers/
│   │   │   │   ├── email/       # Brevo API client & Dev file logger
│   │   │   │   ├── storage/     # AWS S3 SDK for Cloudflare R2
│   │   │   │   └── library/     # Local Postgres & Koha SRU providers
│   │   │   └── app.ts           # Express server bootstrap & routes
│   │   ├── tests/               # Unit, integration, and security tests
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── web/                     # Frontend Vite + React PWA
│       ├── public/
│       │   ├── icons/           # PWA mobile icons (192, 512, maskable)
│       │   ├── manifest.json    # Web App Manifest
│       │   └── favicon.ico
│       ├── src/
│       │   ├── assets/          # Static styles and brand assets
│       │   ├── components/      # UI components (Header, YouTubeLite, DataSaver)
│       │   ├── context/         # AuthContext, OfflineContext, DataSaverContext
│       │   ├── hooks/           # Custom React hooks
│       │   ├── pages/           # Student, Lecturer, Admin & Auth views
│       │   ├── services/        # Axios / Fetch API client with interceptors
│       │   ├── sw.ts            # Custom Service Worker registration & cache
│       │   ├── App.tsx          # Router configuration and global guards
│       │   └── main.tsx
│       ├── index.html
│       ├── package.json
│       ├── tsconfig.json
│       └── vite.config.ts
├── functions/                   # Cloudflare Pages Functions
│   └── api/
│       └── [[path]].ts          # Zero-overhead reverse proxy to Render backend
├── db/
│   ├── migrations/              # Incremental SQL migration scripts (001_initial...)
│   └── seed/                    # Seed script for departments, courses, registrar
├── docs/
│   ├── DESIGN.md                # Stage 1 Reference Architecture (This document)
│   ├── BUILD_PLAN.md            # Milestones and progress checklist
│   ├── BUILD_LOG.md             # Chronological build log and test results
│   ├── DEVIATIONS.md            # Documented deviations from initial spec
│   ├── DEPLOY.md                # Step-by-step production deployment manual
│   └── OPERATIONS.md            # Backups, NDPA compliance, monitoring
├── docker-compose.yml           # Local dev: Postgres + MinIO S3 stand-in
├── .env.example                 # Environment variables blueprint
├── package.json                 # Monorepo root workspaces
└── README.md                    # Project overview & developer guide
```

---

## 3. Database Design

### 3.1 Custom Types & Enums
```sql
CREATE TYPE user_role AS ENUM (
    'REGISTRAR',
    'HOD',
    'LEVEL_COORDINATOR',
    'LECTURER',
    'STUDENT'
);

CREATE TYPE account_status AS ENUM (
    'PENDING',
    'ACTIVE',
    'SUSPENDED'
);

CREATE TYPE programme_type AS ENUM (
    'ND',
    'HND'
);

CREATE TYPE resource_type AS ENUM (
    'DOCUMENT',
    'CODE',
    'NOTEBOOK',
    'TOPOLOGY',
    'DATASET',
    'SPREADSHEET',
    'CASE_STUDY',
    'VIDEO',
    'AUDIO'
);

CREATE TYPE resource_visibility AS ENUM (
    'PUBLIC',
    'ENROLLED_ONLY',
    'STAFF_ONLY'
);
```

### 3.2 Relational Tables & Constraints

```sql
-- 1. Academic Departments
CREATE TABLE departments (
    id SERIAL PRIMARY KEY,
    code VARCHAR(10) UNIQUE NOT NULL,      -- e.g. 'CS', 'AI', 'NCC', 'STA', 'ACC', 'BA'
    name VARCHAR(150) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Core Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    matric_no VARCHAR(50) UNIQUE,          -- Uppercase trimmed, NULL for non-students
    email VARCHAR(255) UNIQUE NOT NULL,    -- Lowercase trimmed
    password_hash VARCHAR(255) NOT NULL,   -- Argon2id hash
    full_name VARCHAR(255) NOT NULL,
    department_id INT REFERENCES departments(id) ON DELETE RESTRICT,
    programme programme_type,              -- 'ND' or 'HND'
    level INT CHECK (level IN (1, 2)),     -- Level 1 or Level 2
    entry_session VARCHAR(20),             -- e.g. '2025/2026'
    role user_role NOT NULL DEFAULT 'STUDENT',
    status account_status NOT NULL DEFAULT 'PENDING',
    must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
    matched_verified BOOLEAN NOT NULL DEFAULT FALSE,
    email_verified_at TIMESTAMPTZ,
    failed_attempts INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Granular User Scopes (HOD & Level Coordinators)
CREATE TABLE user_scopes (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    department_id INT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    level INT CHECK (level IN (1, 2)),     -- NULL for HOD (entire department)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, department_id, level)
);

-- 4. Admissions Master List (Pre-imported for verification matching)
CREATE TABLE admissions_master_list (
    id SERIAL PRIMARY KEY,
    matric_no VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255),
    full_name VARCHAR(255) NOT NULL,
    department_id INT NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    programme programme_type NOT NULL,
    level INT NOT NULL CHECK (level IN (1, 2)),
    entry_session VARCHAR(20) NOT NULL,
    is_claimed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Courses Table
CREATE TABLE courses (
    id SERIAL PRIMARY KEY,
    code VARCHAR(20) UNIQUE NOT NULL,      -- e.g. 'COM111', 'STA211'
    title VARCHAR(255) NOT NULL,
    department_id INT NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    programme programme_type NOT NULL,
    level INT NOT NULL CHECK (level IN (1, 2)),
    semester INT NOT NULL CHECK (semester IN (1, 2)),
    credit_units INT NOT NULL DEFAULT 2,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Course Assignments (Lecturer Assignment)
CREATE TABLE course_assignments (
    id SERIAL PRIMARY KEY,
    course_id INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    lecturer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session VARCHAR(20) NOT NULL,          -- e.g. '2025/2026'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (course_id, lecturer_id, session)
);

-- 7. Student Enrollments
CREATE TABLE enrollments (
    id SERIAL PRIMARY KEY,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    session VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ENROLLED',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (student_id, course_id, session)
);

-- 8. Learning Resources
CREATE TABLE learning_resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    resource_type resource_type NOT NULL,
    visibility resource_visibility NOT NULL DEFAULT 'ENROLLED_ONLY',
    r2_key VARCHAR(500),                   -- NULL for external URLs
    size_bytes BIGINT,
    mime_type VARCHAR(100),
    external_url TEXT,                     -- YouTube, GitHub, Colab, NBS links
    video_id VARCHAR(50),                  -- For YouTube facade
    start_seconds INT DEFAULT 0,
    metadata_json JSONB DEFAULT '{}'::jsonb, -- Code lang, dataset format, etc.
    uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    is_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Physical Library Catalog Items
CREATE TABLE library_items (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    author VARCHAR(255) NOT NULL,
    isbn VARCHAR(50),
    call_number VARCHAR(100) NOT NULL,
    shelf_location VARCHAR(100) NOT NULL,
    copies_total INT NOT NULL DEFAULT 1,
    copies_available INT NOT NULL DEFAULT 1,
    department_id INT REFERENCES departments(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. CSV Import Jobs Tracker
CREATE TABLE import_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    filename VARCHAR(255) NOT NULL,
    total_rows INT NOT NULL DEFAULT 0,
    successful_rows INT NOT NULL DEFAULT 0,
    failed_rows INT NOT NULL DEFAULT 0,
    error_log_json JSONB DEFAULT '[]'::jsonb,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- 11. Password Reset Tokens
CREATE TABLE password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. Active Refresh Tokens (Session tracking)
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    user_agent VARCHAR(255),
    ip_address VARCHAR(45),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. Discussion Threads
CREATE TABLE discussion_threads (
    id SERIAL PRIMARY KEY,
    course_id INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
    is_locked BOOLEAN NOT NULL DEFAULT FALSE,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. Discussion Posts (Replies)
CREATE TABLE discussion_posts (
    id SERIAL PRIMARY KEY,
    thread_id INT NOT NULL REFERENCES discussion_threads(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_post_id INT REFERENCES discussion_posts(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 15. System Audit Logs
CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(100) NOT NULL,
    target_id VARCHAR(100),
    ip_address VARCHAR(45),
    details_json JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.3 Database Sizing & 500 MB Budget Proof

Neon Postgres free tier grants 1,000 MB (1.0 GB) per project. Projected sizing for 3,000 active students over 3 academic sessions:

| Entity | Record Count | Avg Bytes / Row | Estimated Table Size | Index Overhead (~35%) | Total Subtotal |
|---|---|---|---|---|---|
| `users` | 3,500 | 500 B | 1.75 MB | 0.61 MB | 2.36 MB |
| `courses` | 150 | 400 B | 0.06 MB | 0.02 MB | 0.08 MB |
| `enrollments` | 45,000 | 120 B | 5.40 MB | 1.89 MB | 7.29 MB |
| `learning_resources` | 3,000 | 800 B | 2.40 MB | 0.84 MB | 3.24 MB |
| `library_items` | 10,000 | 450 B | 4.50 MB | 1.57 MB | 6.07 MB |
| `discussion_threads` & `posts` | 15,000 | 600 B | 9.00 MB | 3.15 MB | 12.15 MB |
| `audit_logs` (retained 1 yr) | 50,000 | 250 B | 12.50 MB | 4.37 MB | 16.87 MB |
| System overhead / migrations | — | — | 1.00 MB | 0.50 MB | 1.50 MB |
| **Total Projected Footprint** | | | **36.61 MB** | **12.95 MB** | **49.56 MB** |

**Conclusion:** At ~50 MB, the system consumes < 5% of the Neon 1.0 GB storage limit and 10% of the conservative 500 MB threshold, guaranteeing perpetual zero-cost viability.

---

## 4. Module Contracts & Permission Matrix

### 4.1 Permission Matrix (Role x Action)

| Action / Capability | REGISTRAR | HOD | LEVEL_COORDINATOR | LECTURER | STUDENT |
|---|---|---|---|---|---|
| **Bulk CSV Import** | Global | Scoped to Dept | None | None | None |
| **Approve Registrations** | Global | Scoped to Dept | Scoped to Dept + Level | None | None |
| **Manage Departments** | Global | View only | View only | View only | View only |
| **Create / Edit Courses** | Global | Scoped to Dept | Scoped to Dept | None | None |
| **Assign Lecturers to Courses** | Global | Scoped to Dept | Scoped to Dept | None | None |
| **Upload Resources (R2 Presign)**| Global | Scoped to Dept | Scoped to Dept | Assigned Courses | None |
| **Delete Resources** | Global | Scoped to Dept | None | Assigned Courses (Own) | None |
| **Download / Access Resources**| Global | Scoped to Dept | Scoped to Dept | Assigned Courses | Enrolled Only |
| **Manage Library Catalog** | Global | None | None | None | View / Search |
| **Moderate Discussions** | Global | Scoped to Dept | Scoped to Dept + Level | Assigned Courses | Post in Enrolled |
| **View Audit Logs** | Global | Scoped to Dept | None | None | None |

---

### 4.2 API Endpoint Contract

All endpoints reside behind the `/api` prefix and communicate via standard JSON payloads.

| Method | Path | Required Role / Scope | Request Body / Parameters | Success Response | Error Codes |
|---|---|---|---|---|---|
| `POST` | `/api/auth/login` | Public | `{ identifier, password }` | `200 OK` + Set-Cookie | 400, 401, 429 |
| `POST` | `/api/auth/refresh` | Public (Cookie) | None | `200 OK` + Updated Cookie | 401 |
| `POST` | `/api/auth/logout` | Authenticated | None | `200 OK` (Clear Cookie) | 401 |
| `POST` | `/api/auth/change-password` | Authenticated | `{ current_password, new_password }` | `200 OK` | 400, 401 |
| `POST` | `/api/auth/request-reset` | Public | `{ email }` | `200 OK` | 429 |
| `POST` | `/api/auth/reset-password` | Public | `{ token, new_password }` | `200 OK` | 400, 410 |
| `POST` | `/api/onboarding/register` | Public | `{ matric_no, email, full_name, department_id, programme, level, password }` | `201 Created` | 400, 409 |
| `GET` | `/api/onboarding/verify-email` | Public | Query: `?token=` | `200 OK` | 400, 410 |
| `POST` | `/api/onboarding/import-csv` | `REGISTRAR`, `HOD` | Multipart file upload (`file`) | `200 OK` `{ job_id, counts, errors }` | 400, 403, 413 |
| `GET` | `/api/onboarding/queue` | `REGISTRAR`, `HOD`, `LEVEL_COORDINATOR` | Query: `?dept=&level=&page=` | `200 OK` `[ { student_data } ]` | 403 |
| `POST` | `/api/onboarding/approve` | `REGISTRAR`, `HOD`, `LEVEL_COORDINATOR` | `{ user_ids: [] }` | `200 OK` `{ approved_count }` | 400, 403 |
| `GET` | `/api/courses` | Authenticated | Query: `?dept=&level=` | `200 OK` `[ { courses } ]` | 401 |
| `POST` | `/api/courses` | `REGISTRAR`, `HOD` | `{ code, title, department_id, programme, level, semester, credit_units }` | `201 Created` | 400, 403 |
| `POST` | `/api/resources/presign-upload` | `REGISTRAR`, `HOD`, `LECTURER` | `{ course_id, filename, mime_type, size_bytes }` | `200 OK` `{ r2_key, upload_url }` | 400, 403, 413 |
| `POST` | `/api/resources/confirm` | `REGISTRAR`, `HOD`, `LECTURER` | `{ course_id, title, r2_key, mime_type, size_bytes, metadata }` | `201 Created` | 400, 403, 404 |
| `GET` | `/api/resources/:id/download` | Authenticated (Enrolled) | None | `200 OK` `{ download_url }` | 401, 403, 404 |
| `GET` | `/api/library/search` | Authenticated | Query: `?q=&department_id=` | `200 OK` `[ { library_items } ]` | 401 |
| `POST` | `/api/library/items` | `REGISTRAR` | `{ title, author, isbn, call_number, shelf_location, copies_total }` | `201 Created` | 400, 403 |
| `GET` | `/api/aggregator/resources`| Authenticated | Query: `?type=&topic=` | `200 OK` `[ { external_resources } ]` | 401 |
| `GET` | `/api/discussions/:course_id`| Authenticated (Enrolled) | None | `200 OK` `[ { threads } ]` | 403 |
| `POST` | `/api/discussions/:course_id`| Authenticated (Enrolled) | `{ title, content }` | `201 Created` | 400, 403 |
| `GET` | `/api/health` | Public | None | `200 OK` `{ status: "ok" }` | None |

---

### 4.3 TypeScript Service & Provider Interfaces

```typescript
// 1. Authentication Service Contract
export interface IAuthService {
  login(identifier: string, passwordPlain: string, ip: string, userAgent: string): Promise<AuthResult>;
  refreshTokens(refreshTokenPlain: string, ip: string, userAgent: string): Promise<AuthTokens>;
  logout(refreshTokenPlain: string): Promise<void>;
  changePassword(userId: string, currentPlain: string, newPlain: string): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  resetPassword(token: string, newPlain: string): Promise<void>;
}

// 2. Role-Scope Guard Contract
export interface IRoleScopeGuard {
  assertCanManageDepartment(user: AuthenticatedUser, departmentId: number): void;
  assertCanManageCourse(user: AuthenticatedUser, courseId: number): Promise<void>;
  assertCanAccessCourse(user: AuthenticatedUser, courseId: number): Promise<void>;
}

// 3. Streaming CSV Importer Contract
export interface ICsvImporter {
  importStudentsStream(
    fileStream: NodeJS.ReadableStream,
    uploadedByUserId: string,
    enforceDeptId?: number
  ): Promise<ImportJobResult>;
}

// 4. Object Storage Provider (Cloudflare R2 via AWS SDK S3)
export interface IStorageProvider {
  createPresignedPutUrl(key: string, mimeType: string, sizeBytes: number): Promise<string>;
  createPresignedGetUrl(key: string, originalFilename: string): Promise<string>;
  verifyObjectExists(key: string, expectedSizeBytes?: number): Promise<boolean>;
  deleteObject(key: string): Promise<void>;
}

// 5. Library Catalog Provider Contract (Local & Koha Stub)
export interface ILibraryCatalogProvider {
  search(query: string, departmentId?: number, limit?: number): Promise<LibrarySearchResult[]>;
  getItemAvailability(itemId: number): Promise<LibraryItemAvailability>;
}

// 6. Registration Approval Queue Contract
export interface IApprovalQueueService {
  getPendingQueue(actor: AuthenticatedUser, filterDeptId?: number, filterLevel?: number): Promise<PendingStudent[]>;
  batchApprove(actor: AuthenticatedUser, userIds: string[]): Promise<ApprovalBatchResult>;
}

// 7. Email Provider Contract (Brevo & Local Dev Logger)
export interface IEmailProvider {
  sendVerificationEmail(toEmail: string, studentName: string, token: string): Promise<void>;
  sendApprovalNotice(toEmail: string, studentName: string): Promise<void>;
  sendPasswordResetEmail(toEmail: string, studentName: string, token: string): Promise<void>;
}
```

---

## 5. Frontend & Progressive Web App (PWA) Design

### 5.1 Route Map & Access Gates
- `/` - Public Portal landing page with institutional announcements and login entry.
- `/login` - Credential entry with rate-limit countdown and password recovery link.
- `/register` - Student self-registration form (matric number validated against format).
- `/verify-email` - Email token confirmation landing view.
- `/change-password` - **Enforced Gate View**: Rendered when `user.must_change_password === true`. All other routes, headers, and tabs are blocked until completed.
- `/dashboard` - Student Course Deck showing registered courses, credit units, and offline saved indicators.
- `/courses/:id` - Course Detail with tabs:
  - `Syllabus`: Markdown text (cached offline).
  - `Resources`: Lecture notes, notebook cards, topology diagrams, and code snippets.
  - `Library`: Physical shelf locations and availability for recommended textbooks.
  - `Discussions`: Threaded forum discussions.
- `/offline` - Offline Vault displaying cached resources and storage quota gauge.
- `/admin/approvals` - Staff registration approval queue with batch-approve actions.
- `/admin/importer` - Registrar/HOD CSV streaming upload interface with error report downloads.
- `/admin/courses` - Course and lecturer assignment management.

---

### 5.2 PWA Caching Strategy

Using `vite-plugin-pwa` configured with Workbox:
1. **Cache-First (Stale-While-Revalidate):** Static UI shell, bundle assets (JS/CSS), web fonts, department badges, and course syllabi.
2. **Network-First with Cache Fallback:** User course listings and metadata endpoints (`/api/courses`).
3. **Dedicated Offline Storage (`CacheStorage`):**
   - Private R2 files downloaded via presigned URLs are cached inside a dedicated cache named `fss-user-resources`.
   - **Keyed by Resource ID:** Cached as `https://local.cache/resource/{resource_id}` rather than the ephemeral presigned URL.
   - Includes a user-facing **"Save for Offline"** button and clear cache trigger on logout.
   - **Quota Management:** Monitored via `navigator.storage.estimate()` to alert students before exceeding browser limits on budget mobile hardware.

---

### 5.3 Cloudflare Pages Functions Proxy Design

Located at `functions/api/[[path]].ts`:
```typescript
export async function onRequest(context: { request: Request; env: { BACKEND_ORIGIN: string } }): Promise<Response> {
  const url = new URL(context.request.url);
  const backendUrl = new URL(url.pathname + url.search, context.env.BACKEND_ORIGIN || "https://fss-backend.onrender.com");
  
  const headers = new Headers(context.request.headers);
  headers.set("X-Forwarded-Host", url.hostname);
  headers.set("X-Forwarded-Proto", "https");

  // Zero-CPU streaming proxy: pass request and cookies directly
  const response = await fetch(backendUrl.toString(), {
    method: context.request.method,
    headers: headers,
    body: ["GET", "HEAD"].includes(context.request.method) ? undefined : context.request.body,
    redirect: "manual",
  });

  return response;
}
```
**Advantage:** First-party cookie domain (`*.pages.dev`) eliminates third-party cookie blocking across Safari and Android browsers while maintaining $0 infrastructure.

---

### 5.4 Data-Saver Engine & YouTube Lite Facade
- **Data-Saver Mode:** Global state persisted in `localStorage('fss_data_saver')`. When enabled:
  - Suppresses automatic loading of image assets (shows outline with "Tap to Load").
  - Suppresses heavy Jupyter notebook interactive renders (displays text code cell summary).
  - Blocks prefetching of adjacent tabs and attachments.
- **YouTube Lite Facade:**
  - YouTube embeds never render an `<iframe>` on page load.
  - Renders a lightweight static thumbnail (`https://img.youtube.com/vi/{video_id}/mqdefault.jpg`) with a lightweight play overlay.
  - Only mounts the YouTube `<iframe>` upon explicit user tap.

---

## 6. Deployment Guide, Operations & NDPA 2023 Considerations

### 6.1 Deployment Architecture Step-by-Step

#### 1. Neon Serverless Postgres
1. Register free account on Neon.tech.
2. Create project `fss-elibrary`. Select AWS region `eu-central-1` (Frankfurt) or `eu-west-1` for optimal latency to Nigeria.
3. Note pooled connection string: `postgresql://user:password@ep-xyz-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require`.

#### 2. Cloudflare R2
1. Log in to Cloudflare Dashboard -> R2 Object Storage.
2. Create private bucket: `fss-elibrary-storage`. Set default storage class to **Standard** (free tier applies).
3. Create API Token with Object Read & Write permissions for bucket. Note Account ID, Access Key ID, and Secret Access Key.

#### 3. Render Free Web Service (Backend)
1. Register on Render.com with GitHub.
2. Create new Web Service from monorepo root pointing to `apps/api`.
3. Set Environment to `Node`, Build Command: `npm install && npm run build`, Start Command: `npm run start`.
4. Add environment variables:
   - `DATABASE_URL` = Neon pooled connection string
   - `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`
   - `JWT_SECRET`, `COOKIE_SECRET`
   - `BREVO_API_KEY`, `SENDER_EMAIL` (verified single-sender address)
   - `NODE_ENV` = `production`

#### 4. Cloudflare Pages (Frontend + Functions Proxy)
1. Cloudflare Dashboard -> Pages -> Connect to GitHub repo.
2. Build Settings: Framework Preset `Vite`, Root directory `apps/web`, Build Command `npm run build`, Output directory `dist`.
3. Add Environment Variable to Pages: `BACKEND_ORIGIN` = `https://fss-backend.onrender.com`.

#### 5. Keep-Alive Ping (cron-job.org)
1. Create account on cron-job.org.
2. Add Cron Job: URL `https://fss-backend.onrender.com/api/health`, Schedule: Every 10 minutes between `07:00` and `22:00` WAT (UTC+1).

---

### 6.2 Backup Approach: Scheduled Logical Dump to R2
- Free Postgres instances on Neon do not include automated daily cold backups beyond a 6-hour point-in-time window.
- **Automated Backup Job:** A lightweight GitHub Action scheduled daily at `02:00 WAT` runs:
  ```bash
  pg_dump "$DATABASE_URL" | gzip > backup-$(date +%Y%m%d).sql.gz
  aws s3 cp backup-$(date +%Y%m%d).sql.gz s3://fss-elibrary-storage/backups/ \
    --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
  ```
- Storage impact: 36 MB gzipped produces ~6 MB per backup; 30 daily rotating backups consume < 200 MB (< 2% of the 10 GB R2 quota).

---

### 6.3 NDPA 2023 (Nigeria Data Protection Act) Compliance
In strict compliance with the **Nigeria Data Protection Act (NDPA) 2023**:
1. **Data Minimization:** Student profiles collect only strictly necessary academic identifiers (`matric_no`, institutional/personal email, full name, department, level, programme). No sensitive personal data (NIN, BVN, biometric data, home addresses) is stored.
2. **Explicit Consent & Lawful Basis:** Registration modal presents an explicit Consent Notice for processing academic records for e-learning delivery.
3. **Data Retention & Soft Delete:** Account deactivations and data deletion requests permanently scrub passwords and tokens; academic transcripts remain archived under educational compliance obligations.
4. **Data Security & Cryptography:** Zero plaintext password storage (Argon2id hashing), TLS 1.3 enforced across all transport channels, and strict RBAC controls preventing unauthorized data access.

