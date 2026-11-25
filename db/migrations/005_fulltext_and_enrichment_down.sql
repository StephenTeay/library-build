-- ==============================================================================
-- Migration 005: Full-Text Deep Indexing & Bibliographic Enrichment (DOWN)
-- ==============================================================================

DROP INDEX IF EXISTS idx_library_items_search;
DROP INDEX IF EXISTS idx_theses_search;
DROP INDEX IF EXISTS idx_resources_search;

ALTER TABLE library_items DROP COLUMN IF EXISTS format;
ALTER TABLE library_items DROP COLUMN IF EXISTS language;
ALTER TABLE library_items DROP COLUMN IF EXISTS description;
ALTER TABLE library_items DROP COLUMN IF EXISTS cover_url;
ALTER TABLE library_items DROP COLUMN IF EXISTS lcc_code;
ALTER TABLE library_items DROP COLUMN IF EXISTS ddc_code;
ALTER TABLE library_items DROP COLUMN IF EXISTS edition;
ALTER TABLE library_items DROP COLUMN IF EXISTS publication_year;
ALTER TABLE library_items DROP COLUMN IF EXISTS publisher;

ALTER TABLE theses_repository DROP COLUMN IF EXISTS extracted_text;
ALTER TABLE learning_resources DROP COLUMN IF EXISTS extracted_text;
