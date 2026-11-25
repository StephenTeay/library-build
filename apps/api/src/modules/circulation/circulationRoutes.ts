import { Router, Request, Response } from 'express';
import { pool } from '../../db/pool.js';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/roleScope.js';

export const circulationRouter = Router();

// ==============================================================================
// 1. Staff Circulation Desk: Checkout Book
// ==============================================================================
circulationRouter.post(
  '/checkout',
  authenticate,
  requireRole('LIBRARIAN', 'LIBRARY_STAFF', 'REGISTRAR'),
  async (req: Request, res: Response) => {
    const { item_id, student_matric_or_email, duration_days = 14, loan_type = 'PHYSICAL', notes } = req.body || {};

    if (!item_id || !student_matric_or_email) {
      res.status(400).json({ error: 'Bad Request', message: 'item_id and student_matric_or_email are required.' });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Find student
      const userSearch = String(student_matric_or_email).trim().toLowerCase();
      const userRes = await client.query(
        `SELECT id, full_name, email, matric_no, status FROM users
         WHERE LOWER(email) = $1 OR LOWER(matric_no) = $1`,
        [userSearch]
      );

      if (userRes.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ error: 'Not Found', message: 'Student account not found by matric number or email.' });
        return;
      }

      const student = userRes.rows[0];
      if (student.status !== 'ACTIVE') {
        await client.query('ROLLBACK');
        res.status(400).json({ error: 'Inactive Account', message: 'Student account is not active.' });
        return;
      }

      // 2. Lock and check library item availability
      const itemRes = await client.query(
        `SELECT id, title, call_number, copies_available, copies_total
         FROM library_items
         WHERE id = $1 FOR UPDATE`,
        [Number(item_id)]
      );

      if (itemRes.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ error: 'Not Found', message: 'Library item not found.' });
        return;
      }

      const item = itemRes.rows[0];
      if (item.copies_available <= 0) {
        await client.query('ROLLBACK');
        res.status(409).json({
          error: 'Out of Stock',
          message: 'All physical copies of this item are currently checked out. A hold may be placed instead.',
        });
        return;
      }

      // 3. Check if student already has an active loan of this item
      const existingLoan = await client.query(
        `SELECT id FROM circulation_loans
         WHERE item_id = $1 AND user_id = $2 AND status = 'ACTIVE'`,
        [item.id, student.id]
      );

      if (existingLoan.rows.length > 0) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: 'Duplicate Loan', message: 'Student already has an active loan for this book.' });
        return;
      }

      // 4. Decrement available copies
      await client.query(
        `UPDATE library_items
         SET copies_available = copies_available - 1, updated_at = NOW()
         WHERE id = $1`,
        [item.id]
      );

      // 5. Create loan record
      const days = Math.max(1, Math.min(Number(duration_days) || 14, 60));
      const loanRes = await client.query(
        `INSERT INTO circulation_loans (
           item_id, user_id, loan_type, due_at, issued_by, notes, status
         ) VALUES ($1, $2, $3, NOW() + INTERVAL '${days} days', $4, $5, 'ACTIVE')
         RETURNING *;`,
        [item.id, student.id, loan_type, req.user!.userId, notes || null]
      );

      // 6. If student had a hold on this item, fulfill it
      await client.query(
        `UPDATE circulation_holds
         SET status = 'FULFILLED'
         WHERE item_id = $1 AND user_id = $2 AND status IN ('PENDING', 'READY_FOR_PICKUP')`,
        [item.id, student.id]
      );

      await client.query('COMMIT');

      res.status(201).json({
        message: `Successfully checked out "${item.title}" to ${student.full_name}.`,
        loan: loanRes.rows[0],
        student: { id: student.id, full_name: student.full_name, matric_no: student.matric_no },
        item: { id: item.id, title: item.title, call_number: item.call_number },
      });
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error('[Circulation] Checkout error:', err);
      res.status(500).json({ error: 'Circulation Error', message: err.message });
    } finally {
      client.release();
    }
  }
);

// ==============================================================================
// 2. Staff Circulation Desk: Check-in / Return Book
// ==============================================================================
circulationRouter.post(
  '/checkin/:loanId',
  authenticate,
  requireRole('LIBRARIAN', 'LIBRARY_STAFF', 'REGISTRAR'),
  async (req: Request, res: Response) => {
    const loanId = Number(req.params.loanId);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const loanRes = await client.query(
        `SELECT l.*, i.title as item_title
         FROM circulation_loans l
         JOIN library_items i ON l.item_id = i.id
         WHERE l.id = $1 FOR UPDATE`,
        [loanId]
      );

      if (loanRes.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ error: 'Not Found', message: 'Circulation loan record not found.' });
        return;
      }

      const loan = loanRes.rows[0];
      if (loan.status === 'RETURNED') {
        await client.query('ROLLBACK');
        res.status(400).json({ error: 'Already Returned', message: 'This book has already been marked returned.' });
        return;
      }

      // 1. Mark loan returned
      await client.query(
        `UPDATE circulation_loans
         SET status = 'RETURNED', returned_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [loanId]
      );

      // 2. Increment available copies
      await client.query(
        `UPDATE library_items
         SET copies_available = LEAST(copies_total, copies_available + 1), updated_at = NOW()
         WHERE id = $1`,
        [loan.item_id]
      );

      // 3. Check for waiting holds on this book
      const holdRes = await client.query(
        `SELECT id, user_id FROM circulation_holds
         WHERE item_id = $1 AND status = 'PENDING'
         ORDER BY placed_at ASC
         LIMIT 1 FOR UPDATE`,
        [loan.item_id]
      );

      let holdNotification = null;
      if (holdRes.rows.length > 0) {
        const nextHold = holdRes.rows[0];
        await client.query(
          `UPDATE circulation_holds
           SET status = 'READY_FOR_PICKUP', notified_at = NOW(), expires_at = NOW() + INTERVAL '2 days'
           WHERE id = $1`,
          [nextHold.id]
        );
        holdNotification = { holdId: nextHold.id, userId: nextHold.user_id };
      }

      await client.query('COMMIT');

      res.status(200).json({
        message: `Successfully returned "${loan.item_title}".`,
        loanId,
        holdAssigned: holdNotification,
      });
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error('[Circulation] Checkin error:', err);
      res.status(500).json({ error: 'Circulation Error', message: err.message });
    } finally {
      client.release();
    }
  }
);

// ==============================================================================
// 3. Renew Active Loan (Student or Staff)
// ==============================================================================
circulationRouter.post(
  '/renew/:loanId',
  authenticate,
  async (req: Request, res: Response) => {
    const loanId = Number(req.params.loanId);
    const userId = req.user!.userId;
    const isStaff = ['LIBRARIAN', 'LIBRARY_STAFF', 'REGISTRAR'].includes(req.user!.role);

    try {
      const loanRes = await pool.query(
        `SELECT * FROM circulation_loans WHERE id = $1 AND status = 'ACTIVE'`,
        [loanId]
      );

      if (loanRes.rows.length === 0) {
        res.status(404).json({ error: 'Not Found', message: 'Active loan record not found.' });
        return;
      }

      const loan = loanRes.rows[0];
      if (!isStaff && loan.user_id !== userId) {
        res.status(403).json({ error: 'Forbidden', message: 'You may only renew your own loans.' });
        return;
      }

      if (loan.renewal_count >= 2) {
        res.status(400).json({
          error: 'Renewal Limit Reached',
          message: 'This loan has already reached the maximum limit of 2 renewals.',
        });
        return;
      }

      // Check if other students placed holds on this book
      const pendingHolds = await pool.query(
        `SELECT id FROM circulation_holds WHERE item_id = $1 AND status = 'PENDING'`,
        [loan.item_id]
      );

      if (pendingHolds.rows.length > 0) {
        res.status(409).json({
          error: 'Renewal Denied',
          message: 'Cannot renew: other students are waiting in the hold queue for this book.',
        });
        return;
      }

      const updated = await pool.query(
        `UPDATE circulation_loans
         SET due_at = due_at + INTERVAL '7 days',
             renewal_count = renewal_count + 1,
             updated_at = NOW()
         WHERE id = $1
         RETURNING *;`,
        [loanId]
      );

      res.status(200).json({
        message: 'Loan successfully renewed for an additional 7 days.',
        loan: updated.rows[0],
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Circulation Error', message: err.message });
    }
  }
);

// ==============================================================================
// 4. Place Hold / Reserve Out-of-Stock Book
// ==============================================================================
circulationRouter.post(
  '/holds',
  authenticate,
  async (req: Request, res: Response) => {
    const { item_id } = req.body || {};
    const userId = req.user!.userId;

    if (!item_id) {
      res.status(400).json({ error: 'Bad Request', message: 'item_id is required.' });
      return;
    }

    try {
      const itemRes = await pool.query(
        'SELECT id, title, copies_available FROM library_items WHERE id = $1',
        [Number(item_id)]
      );

      if (itemRes.rows.length === 0) {
        res.status(404).json({ error: 'Not Found', message: 'Library item not found.' });
        return;
      }

      const item = itemRes.rows[0];

      // Check if student already has active hold
      const existingHold = await pool.query(
        `SELECT id FROM circulation_holds
         WHERE item_id = $1 AND user_id = $2 AND status IN ('PENDING', 'READY_FOR_PICKUP')`,
        [item.id, userId]
      );

      if (existingHold.rows.length > 0) {
        res.status(400).json({ error: 'Duplicate Hold', message: 'You already have an active hold for this book.' });
        return;
      }

      const holdRes = await pool.query(
        `INSERT INTO circulation_holds (item_id, user_id, status)
         VALUES ($1, $2, 'PENDING')
         RETURNING *;`,
        [item.id, userId]
      );

      res.status(201).json({
        message: `Hold placed on "${item.title}". You will be notified when a copy is returned.`,
        hold: holdRes.rows[0],
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Circulation Error', message: err.message });
    }
  }
);

// ==============================================================================
// 5. Student Dashboard: My Active & Past Loans
// ==============================================================================
circulationRouter.get('/my-loans', authenticate, async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  try {
    const loansRes = await pool.query(
      `SELECT l.*, i.title, i.author, i.call_number, i.shelf_location, i.isbn
       FROM circulation_loans l
       JOIN library_items i ON l.item_id = i.id
       WHERE l.user_id = $1
       ORDER BY l.borrowed_at DESC`,
      [userId]
    );

    const holdsRes = await pool.query(
      `SELECT h.*, i.title, i.author, i.call_number, i.shelf_location
       FROM circulation_holds h
       JOIN library_items i ON h.item_id = i.id
       WHERE h.user_id = $1 AND h.status IN ('PENDING', 'READY_FOR_PICKUP')
       ORDER BY h.placed_at ASC`,
      [userId]
    );

    res.status(200).json({
      loans: loansRes.rows,
      holds: holdsRes.rows,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Circulation Error', message: err.message });
  }
});

// ==============================================================================
// 6. Staff Desk: View Active, Overdue, and All Loans
// ==============================================================================
circulationRouter.get(
  '/desk/loans',
  authenticate,
  requireRole('LIBRARIAN', 'LIBRARY_STAFF', 'REGISTRAR'),
  async (req: Request, res: Response) => {
    const statusFilter = String(req.query.status || 'ACTIVE').toUpperCase();
    const q = String(req.query.q || '').trim().toLowerCase();

    try {
      let query = `
        SELECT l.*,
               i.title as item_title, i.call_number, i.shelf_location,
               u.full_name as student_name, u.email as student_email, u.matric_no as student_matric,
               CASE
                 WHEN l.status = 'ACTIVE' AND l.due_at < NOW() THEN TRUE
                 ELSE FALSE
               END as is_overdue
        FROM circulation_loans l
        JOIN library_items i ON l.item_id = i.id
        JOIN users u ON l.user_id = u.id
        WHERE 1=1
      `;
      const params: any[] = [];

      if (statusFilter === 'OVERDUE') {
        query += ` AND l.status = 'ACTIVE' AND l.due_at < NOW()`;
      } else if (statusFilter !== 'ALL') {
        params.push(statusFilter);
        query += ` AND l.status = $${params.length}`;
      }

      if (q) {
        params.push(`%${q}%`);
        query += ` AND (
          LOWER(i.title) LIKE $${params.length} OR
          LOWER(i.call_number) LIKE $${params.length} OR
          LOWER(u.full_name) LIKE $${params.length} OR
          LOWER(u.matric_no) LIKE $${params.length}
        )`;
      }

      query += ` ORDER BY l.due_at ASC LIMIT 100`;

      const result = await pool.query(query, params);
      res.status(200).json({ loans: result.rows, count: result.rows.length });
    } catch (err: any) {
      res.status(500).json({ error: 'Circulation Error', message: err.message });
    }
  }
);

// ==============================================================================
// 7. Staff Desk: View Active Holds Queue
// ==============================================================================
circulationRouter.get(
  '/desk/holds',
  authenticate,
  requireRole('LIBRARIAN', 'LIBRARY_STAFF', 'REGISTRAR'),
  async (_req: Request, res: Response) => {
    try {
      const result = await pool.query(
        `SELECT h.*,
                i.title as item_title, i.call_number, i.shelf_location, i.copies_available,
                u.full_name as student_name, u.email as student_email, u.matric_no as student_matric
         FROM circulation_holds h
         JOIN library_items i ON h.item_id = i.id
         JOIN users u ON h.user_id = u.id
         WHERE h.status IN ('PENDING', 'READY_FOR_PICKUP')
         ORDER BY h.placed_at ASC`
      );

      res.status(200).json({ holds: result.rows, count: result.rows.length });
    } catch (err: any) {
      res.status(500).json({ error: 'Circulation Error', message: err.message });
    }
  }
);
