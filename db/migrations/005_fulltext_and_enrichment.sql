-- ==============================================================================
-- Migration 005: Full-Text Deep Indexing & Bibliographic Enrichment (UP)
-- ==============================================================================

-- 1. Full-text extracted text column for learning resources
ALTER TABLE learning_resources ADD COLUMN IF NOT EXISTS extracted_text TEXT;

-- 2. Full-text extracted text column for theses
ALTER TABLE theses_repository ADD COLUMN IF NOT EXISTS extracted_text TEXT;

-- 3. Bibliographic metadata expansion on physical library items
ALTER TABLE library_items ADD COLUMN IF NOT EXISTS publisher VARCHAR(150);
ALTER TABLE library_items ADD COLUMN IF NOT EXISTS publication_year SMALLINT;
ALTER TABLE library_items ADD COLUMN IF NOT EXISTS edition VARCHAR(50);
ALTER TABLE library_items ADD COLUMN IF NOT EXISTS ddc_code VARCHAR(50);
ALTER TABLE library_items ADD COLUMN IF NOT EXISTS lcc_code VARCHAR(50);
ALTER TABLE library_items ADD COLUMN IF NOT EXISTS cover_url TEXT;
ALTER TABLE library_items ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE library_items ADD COLUMN IF NOT EXISTS language VARCHAR(10) DEFAULT 'en';
ALTER TABLE library_items ADD COLUMN IF NOT EXISTS format VARCHAR(30) DEFAULT 'BOOK';

-- 4. Deep Full-Text GIN Indexes
DROP INDEX IF EXISTS idx_resources_search;
CREATE INDEX IF NOT EXISTS idx_resources_search ON learning_resources
USING gin(to_tsvector('english', title || ' ' || coalesce(description, '') || ' ' || coalesce(extracted_text, '')));

DROP INDEX IF EXISTS idx_theses_search;
CREATE INDEX IF NOT EXISTS idx_theses_search ON theses_repository
USING gin(to_tsvector('english', title || ' ' || abstract || ' ' || coalesce(extracted_text, '')));

DROP INDEX IF EXISTS idx_library_items_search;
CREATE INDEX IF NOT EXISTS idx_library_items_search ON library_items
USING gin(to_tsvector('english', title || ' ' || author || ' ' || coalesce(description, '') || ' ' || coalesce(publisher, '')));
