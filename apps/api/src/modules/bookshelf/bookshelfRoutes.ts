import { Router, Request, Response } from 'express';
import { pool } from '../../db/pool.js';
import { authenticate } from '../../middleware/auth.js';

export const bookshelfRouter = Router();

// 1. Get user's personal bookshelf
bookshelfRouter.get('/', authenticate, async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  try {
    const { rows } = await pool.query(
      `SELECT ub.id, ub.item_type, ub.item_id, ub.shelf_status, ub.notes, ub.created_at, ub.updated_at,
              COALESCE(li.title, lr.title, tr.title) as title,
              COALESCE(
                li.author,
                CASE 
                  WHEN tr.student_authors IS NOT NULL AND jsonb_array_length(tr.student_authors) > 0 
                  THEN tr.student_authors->0->>'name' 
                  ELSE NULL 
                END,
                'Academic Material'
              ) as author_or_creator,
              li.call_number,
              li.cover_url,
              li.copies_available,
              lr.resource_type,
              lr.mime_type,
              lr.size_bytes as file_size_bytes,
              tr.programme,
              tr.academic_session
       FROM user_bookshelf ub
       LEFT JOIN library_items li ON ub.item_type = 'BOOK' AND ub.item_id = li.id::text
       LEFT JOIN learning_resources lr ON ub.item_type = 'RESOURCE' AND ub.item_id = lr.id::text
       LEFT JOIN theses_repository tr ON ub.item_type = 'THESIS' AND ub.item_id = tr.id::text
       WHERE ub.user_id = $1
       ORDER BY ub.updated_at DESC;`,
      [userId]
    );

    res.status(200).json({ bookshelf: rows });
  } catch (err: any) {
    console.error('[Bookshelf Error]', err);
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

// 2. Add or update item on bookshelf
bookshelfRouter.post('/', authenticate, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { item_type, item_id, shelf_status = 'WANT_TO_READ', notes = null } = req.body;

  if (!item_type || !item_id) {
    res.status(400).json({ error: 'item_type and item_id are required' });
    return;
  }

  const validTypes = ['BOOK', 'RESOURCE', 'THESIS'];
  if (!validTypes.includes(item_type)) {
    res.status(400).json({ error: 'Invalid item_type. Must be BOOK, RESOURCE, or THESIS' });
    return;
  }

  const validStatuses = ['WANT_TO_READ', 'CURRENTLY_READING', 'FAVORITE', 'FINISHED'];
  if (!validStatuses.includes(shelf_status)) {
    res.status(400).json({ error: 'Invalid shelf_status' });
    return;
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO user_bookshelf (user_id, item_type, item_id, shelf_status, notes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, item_type, item_id)
       DO UPDATE SET shelf_status = EXCLUDED.shelf_status,
                     notes = COALESCE(EXCLUDED.notes, user_bookshelf.notes),
                     updated_at = NOW()
       RETURNING *;`,
      [userId, item_type, item_id, shelf_status, notes]
    );

    res.status(201).json({ item: rows[0], message: 'Item saved to bookshelf' });
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

// 3. Remove item from bookshelf by shelf ID
bookshelfRouter.delete('/:id', authenticate, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const id = req.params.id;

  try {
    const { rowCount } = await pool.query(
      `DELETE FROM user_bookshelf WHERE id = $1 AND user_id = $2;`,
      [id, userId]
    );

    if (rowCount === 0) {
      res.status(404).json({ error: 'Bookshelf entry not found' });
      return;
    }

    res.status(200).json({ message: 'Item removed from bookshelf' });
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

// 4. Remove item from bookshelf by itemType and itemId
bookshelfRouter.delete('/item/:itemType/:itemId', authenticate, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { itemType, itemId } = req.params;

  try {
    const { rowCount } = await pool.query(
      `DELETE FROM user_bookshelf WHERE item_type = $1 AND item_id = $2 AND user_id = $3;`,
      [itemType.toUpperCase(), itemId, userId]
    );

    res.status(200).json({ removed: (rowCount ?? 0) > 0 });
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});
