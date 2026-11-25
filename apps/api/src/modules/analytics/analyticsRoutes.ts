import { Router, Request, Response } from 'express';
import { pool } from '../../db/pool.js';
import { authenticate, optionalAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/roleScope.js';

export const analyticsRouter = Router();

// 1. Log search query (supports zero-result unmet demand tracking)
analyticsRouter.post('/log-search', optionalAuth, async (req: Request, res: Response) => {
  const { query, scope = 'ALL', results_count = 0 } = req.body;
  if (!query || typeof query !== 'string' || !query.trim()) {
    res.status(400).json({ error: 'Query text is required' });
    return;
  }

  const userId = req.user?.userId || null;

  try {
    await pool.query(
      `INSERT INTO library_search_queries (query_text, search_scope, results_count, user_id)
       VALUES ($1, $2, $3, $4);`,
      [query.trim().slice(0, 255), scope, Number(results_count) || 0, userId]
    );
    res.status(201).json({ logged: true });
  } catch (err: any) {
    // Non-blocking for clients, log and respond ok
    res.status(200).json({ logged: false, error: err.message });
  }
});

// 2. Unmet demand & popular search terms report (Librarian, HOD, Registrar)
analyticsRouter.get(
  '/search-demand',
  authenticate,
  requireRole('REGISTRAR', 'LIBRARY_STAFF', 'HOD'),
  async (_req: Request, res: Response) => {
    try {
      // Unmet demand: Zero-result queries
      const { rows: unmetDemand } = await pool.query(`
        SELECT query_text, search_scope, COUNT(*)::int as frequency, MAX(created_at) as last_searched
        FROM library_search_queries
        WHERE results_count = 0
        GROUP BY query_text, search_scope
        ORDER BY frequency DESC, last_searched DESC
        LIMIT 50;
      `);

      // Top searches overall
      const { rows: topSearches } = await pool.query(`
        SELECT query_text, search_scope, COUNT(*)::int as frequency, AVG(results_count)::numeric(10,1) as avg_results
        FROM library_search_queries
        GROUP BY query_text, search_scope
        ORDER BY frequency DESC
        LIMIT 50;
      `);

      res.status(200).json({ unmetDemand, topSearches });
    } catch (err: any) {
      res.status(500).json({ error: 'Database error', message: err.message });
    }
  }
);

// 3. Overall Library Statistics & Accreditation Metrics
analyticsRouter.get(
  '/summary',
  authenticate,
  requireRole('REGISTRAR', 'LIBRARY_STAFF', 'HOD', 'LECTURER'),
  async (_req: Request, res: Response) => {
    try {
      // Physical Catalog Metrics
      const { rows: [catStats] } = await pool.query(`
        SELECT COUNT(*)::int as total_titles,
               COALESCE(SUM(copies_total), 0)::int as total_volumes,
               COALESCE(SUM(copies_available), 0)::int as available_volumes
        FROM library_items;
      `);

      // Digital Learning Resources
      const { rows: [resStats] } = await pool.query(`
        SELECT COUNT(*)::int as total_digital_resources,
               COUNT(DISTINCT course_id)::int as courses_with_materials
        FROM learning_resources
        WHERE is_confirmed = true;
      `);

      // Theses & Research Repository
      const { rows: [thesesStats] } = await pool.query(`
        SELECT COUNT(*)::int as total_theses_published,
               COUNT(CASE WHEN programme = 'ND' THEN 1 END)::int as nd_projects,
               COUNT(CASE WHEN programme = 'HND' THEN 1 END)::int as hnd_theses
        FROM theses_repository
        WHERE status = 'PUBLISHED';
      `);

      // Circulation Activity
      const { rows: [circStats] } = await pool.query(`
        SELECT COUNT(*)::int as total_loans_all_time,
               COUNT(CASE WHEN status = 'ACTIVE' THEN 1 END)::int as active_loans,
               COUNT(CASE WHEN status = 'RETURNED' THEN 1 END)::int as returned_loans,
               COUNT(CASE WHEN status = 'ACTIVE' AND due_at < NOW() THEN 1 END)::int as overdue_loans
        FROM circulation_loans;
      `);

      // Active Holds
      const { rows: [holdStats] } = await pool.query(`
        SELECT COUNT(*)::int as active_holds
        FROM circulation_holds
        WHERE status = 'PENDING';
      `);

      // Top Borrowed Physical Titles
      const { rows: topBorrowed } = await pool.query(`
        SELECT li.id, li.title, li.author, li.call_number, li.cover_url,
               COUNT(cl.id)::int as checkout_count
        FROM circulation_loans cl
        JOIN library_items li ON cl.item_id = li.id
        GROUP BY li.id, li.title, li.author, li.call_number, li.cover_url
        ORDER BY checkout_count DESC
        LIMIT 10;
      `);

      res.status(200).json({
        physicalCatalog: catStats,
        digitalResources: resStats,
        thesesRepository: thesesStats,
        circulation: {
          ...circStats,
          ...holdStats,
        },
        topBorrowed,
      });
    } catch (err: any) {
      console.error('[Analytics Error]', err);
      res.status(500).json({ error: 'Database error', message: err.message });
    }
  }
);
