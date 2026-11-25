-- ==============================================================================
-- Migration 006: Library Analytics, Patron Bookshelf & Course Reserves (UP)
-- ==============================================================================

-- 1. Search Queries Log (Analytics & Unmet Demand)
CREATE TABLE IF NOT EXISTS library_search_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_text VARCHAR(255) NOT NULL,
  search_scope VARCHAR(50) NOT NULL DEFAULT 'ALL',
  results_count INTEGER NOT NULL DEFAULT 0,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_search_queries_demand ON library_search_queries (results_count, query_text);
CREATE INDEX IF NOT EXISTS idx_search_queries_created ON library_search_queries (created_at DESC);

-- 2. User Bookshelf (Patron Personalization & Reading Lists)
CREATE TABLE IF NOT EXISTS user_bookshelf (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type VARCHAR(20) NOT NULL, -- 'BOOK', 'RESOURCE', 'THESIS'
  item_id VARCHAR(100) NOT NULL,
  shelf_status VARCHAR(30) NOT NULL DEFAULT 'WANT_TO_READ', -- 'WANT_TO_READ', 'CURRENTLY_READING', 'FAVORITE', 'FINISHED'
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT uq_user_bookshelf_item UNIQUE (user_id, item_type, item_id)
);

CREATE INDEX IF NOT EXISTS idx_user_bookshelf_user ON user_bookshelf (user_id, shelf_status);

-- 3. Course Reserves (Physical/Digital Syllabus Reading Lists)
CREATE TABLE IF NOT EXISTS course_reserves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  item_type VARCHAR(20) NOT NULL, -- 'BOOK', 'RESOURCE'
  item_id VARCHAR(100) NOT NULL,
  requirement_level VARCHAR(20) NOT NULL DEFAULT 'REQUIRED', -- 'REQUIRED', 'RECOMMENDED'
  notes TEXT,
  added_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT uq_course_reserves_item UNIQUE (course_id, item_type, item_id)
);

CREATE INDEX IF NOT EXISTS idx_course_reserves_course ON course_reserves (course_id);
