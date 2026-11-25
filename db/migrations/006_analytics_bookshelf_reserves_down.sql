-- ==============================================================================
-- Migration 006: Library Analytics, Patron Bookshelf & Course Reserves (DOWN)
-- ==============================================================================

DROP TABLE IF EXISTS course_reserves CASCADE;
DROP TABLE IF EXISTS user_bookshelf CASCADE;
DROP TABLE IF EXISTS library_search_queries CASCADE;
