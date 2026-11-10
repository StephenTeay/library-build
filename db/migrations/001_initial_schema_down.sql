-- ==============================================================================
-- Migration 001: Initial Core Schema (DOWN / ROLLBACK)
-- ==============================================================================

DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS discussion_posts CASCADE;
DROP TABLE IF EXISTS discussion_threads CASCADE;
DROP TABLE IF EXISTS refresh_tokens CASCADE;
DROP TABLE IF EXISTS password_reset_tokens CASCADE;
DROP TABLE IF EXISTS import_jobs CASCADE;
DROP TABLE IF EXISTS library_items CASCADE;
DROP TABLE IF EXISTS learning_resources CASCADE;
DROP TABLE IF EXISTS enrollments CASCADE;
DROP TABLE IF EXISTS course_assignments CASCADE;
DROP TABLE IF EXISTS courses CASCADE;
DROP TABLE IF EXISTS admissions_master_list CASCADE;
DROP TABLE IF EXISTS user_scopes CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS departments CASCADE;

DROP TYPE IF EXISTS resource_visibility;
DROP TYPE IF EXISTS resource_type;
DROP TYPE IF EXISTS programme_type;
DROP TYPE IF EXISTS account_status;
DROP TYPE IF EXISTS user_role;

