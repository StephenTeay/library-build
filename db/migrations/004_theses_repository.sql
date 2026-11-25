-- ==============================================================================
-- Migration 004: Institutional Repository for Theses & Capstone Projects (UP)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS theses_repository (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(350) NOT NULL,
    abstract TEXT NOT NULL,
    department_id INT NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    programme programme_type NOT NULL, -- 'ND' | 'HND'
    academic_session VARCHAR(20) NOT NULL, -- e.g. '2024/2025'
    student_authors JSONB NOT NULL DEFAULT '[]'::jsonb,
    supervisor_name VARCHAR(255) NOT NULL,
    keywords VARCHAR(100)[] DEFAULT '{}',
    manuscript_r2_key VARCHAR(500) NOT NULL,
    dataset_r2_key VARCHAR(500),
    code_repo_url TEXT,
    file_size_bytes BIGINT,
    mime_type VARCHAR(100) DEFAULT 'application/pdf',
    status VARCHAR(30) NOT NULL DEFAULT 'SUBMITTED', -- 'SUBMITTED' | 'SUPERVISOR_APPROVED' | 'PUBLISHED' | 'REJECTED'
    submitted_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    review_notes TEXT,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_theses_search ON theses_repository USING gin(to_tsvector('english', title || ' ' || abstract));
CREATE INDEX IF NOT EXISTS idx_theses_dept_session ON theses_repository(department_id, programme, academic_session);
CREATE INDEX IF NOT EXISTS idx_theses_status ON theses_repository(status);
