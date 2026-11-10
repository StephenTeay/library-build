-- ==============================================================================
-- Migration 001: Initial Core Schema (UP)
-- ==============================================================================

-- Custom Enumerated Types
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM (
        'REGISTRAR',
        'HOD',
        'LEVEL_COORDINATOR',
        'LECTURER',
        'STUDENT'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE account_status AS ENUM (
        'PENDING',
        'ACTIVE',
        'SUSPENDED'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE programme_type AS ENUM (
        'ND',
        'HND'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
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
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE resource_visibility AS ENUM (
        'PUBLIC',
        'ENROLLED_ONLY',
        'STAFF_ONLY'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 1. Academic Departments
CREATE TABLE IF NOT EXISTS departments (
    id SERIAL PRIMARY KEY,
    code VARCHAR(10) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Core Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    matric_no VARCHAR(50) UNIQUE,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    department_id INT REFERENCES departments(id) ON DELETE RESTRICT,
    programme programme_type,
    level INT CHECK (level IN (1, 2)),
    entry_session VARCHAR(20),
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
CREATE TABLE IF NOT EXISTS user_scopes (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    department_id INT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    level INT CHECK (level IN (1, 2)),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, department_id, level)
);

-- 4. Admissions Master List (Pre-imported for verification matching)
CREATE TABLE IF NOT EXISTS admissions_master_list (
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
CREATE TABLE IF NOT EXISTS courses (
    id SERIAL PRIMARY KEY,
    code VARCHAR(20) UNIQUE NOT NULL,
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
CREATE TABLE IF NOT EXISTS course_assignments (
    id SERIAL PRIMARY KEY,
    course_id INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    lecturer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (course_id, lecturer_id, session)
);

-- 7. Student Enrollments
CREATE TABLE IF NOT EXISTS enrollments (
    id SERIAL PRIMARY KEY,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    session VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ENROLLED',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (student_id, course_id, session)
);

-- 8. Learning Resources
CREATE TABLE IF NOT EXISTS learning_resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    resource_type resource_type NOT NULL,
    visibility resource_visibility NOT NULL DEFAULT 'ENROLLED_ONLY',
    r2_key VARCHAR(500),
    size_bytes BIGINT,
    mime_type VARCHAR(100),
    external_url TEXT,
    video_id VARCHAR(50),
    start_seconds INT DEFAULT 0,
    metadata_json JSONB DEFAULT '{}'::jsonb,
    uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    is_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Physical Library Catalog Items
CREATE TABLE IF NOT EXISTS library_items (
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
CREATE TABLE IF NOT EXISTS import_jobs (
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
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. Active Refresh Tokens (Session tracking)
CREATE TABLE IF NOT EXISTS refresh_tokens (
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
CREATE TABLE IF NOT EXISTS discussion_threads (
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
CREATE TABLE IF NOT EXISTS discussion_posts (
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
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(100) NOT NULL,
    target_id VARCHAR(100),
    ip_address VARCHAR(45),
    details_json JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Strategic Indexes for Performance & Query Cost Optimization
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_matric ON users(matric_no);
CREATE INDEX IF NOT EXISTS idx_users_dept_level ON users(department_id, level, programme);
CREATE INDEX IF NOT EXISTS idx_courses_dept ON courses(department_id, programme, level);
CREATE INDEX IF NOT EXISTS idx_enrollments_student ON enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_course ON enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_resources_course ON learning_resources(course_id);
CREATE INDEX IF NOT EXISTS idx_resources_r2_key ON learning_resources(r2_key);
CREATE INDEX IF NOT EXISTS idx_library_items_search ON library_items USING gin(to_tsvector('english', title || ' ' || author));
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action, created_at);

