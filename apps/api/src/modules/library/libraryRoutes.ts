import { Router, Request, Response } from 'express';
import multer from 'multer';
import { Readable } from 'stream';
import { getLibraryCatalogProvider } from '../../providers/library/libraryProvider.js';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/roleScope.js';
import { pool } from '../../db/pool.js';
import { processBookCsvStream } from './bookImporter.js';

export const libraryRouter = Router();
const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.includes('csv') || file.originalname.endsWith('.csv') || file.mimetype === 'text/plain') {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are permitted for catalog import.'));
    }
  },
});

// 1. Search physical library catalog (Public to authenticated users)
libraryRouter.get('/search', authenticate, async (req: Request, res: Response) => {
  const q = String(req.query.q || '');
  let deptId = req.query.department_id ? Number(req.query.department_id) : undefined;
  if (!deptId && req.query.dept && req.query.dept !== 'ALL') {
    const deptRes = await pool.query('SELECT id FROM departments WHERE code = $1', [String(req.query.dept).toUpperCase().trim()]);
    if (deptRes.rows.length > 0) {
      deptId = deptRes.rows[0].id;
    }
  }
  const limit = req.query.limit ? Number(req.query.limit) : 50;

  try {
    const provider = getLibraryCatalogProvider();
    const items = await provider.search(q, deptId, limit);
    res.status(200).json({ items, count: items.length });
  } catch (err: any) {
    res.status(500).json({ error: 'Library Error', message: err.message });
  }
});

// 2. Download sample CSV template for bulk catalog import
libraryRouter.get('/template-csv', (_req: Request, res: Response) => {
  const csvContent = [
    'title,author,isbn,call_number,shelf_location,copies_total,copies_available,department_code',
    '"Introduction to Probability and Statistics","Milton & Arnold","978-0072468366","QA273 .M55 2003","Shelf A-12",5,5,"ST"',
    '"Digital Computer Fundamentals","Thomas C. Bartee","978-0070038998","QA76.5 .B36 1985","Shelf B-04",4,4,"CS"',
    '"Calculus and Analytic Geometry","George B. Thomas","978-0201531749","QA303 .T42 1992","Shelf C-01",6,6,"MTH"',
    '"Principles of Econometrics","R. Carter Hill","978-1118451991","HB139 .H55 2018","Shelf D-08",3,3,"ECO"',
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="fss_library_catalog_template.csv"');
  res.status(200).send(csvContent);
});

// 3. Get physical library items mapped to a specific course
libraryRouter.get('/course/:courseId', authenticate, async (req: Request, res: Response) => {
  const courseId = Number(req.params.courseId);

  try {
    const courseRes = await pool.query('SELECT department_id FROM courses WHERE id = $1', [courseId]);
    const deptId = courseRes.rows[0]?.department_id;
    const provider = getLibraryCatalogProvider();
    const items = await provider.search('', deptId, 20);
    res.status(200).json({ items });
  } catch (err: any) {
    res.status(500).json({ error: 'Library Error', message: err.message });
  }
});

// 4. Get specific item availability & shelf location
libraryRouter.get('/items/:id', authenticate, async (req: Request, res: Response) => {
  const itemId = Number(req.params.id);

  try {
    const provider = getLibraryCatalogProvider();
    const item = await provider.getItemAvailability(itemId);
    if (!item) {
      res.status(404).json({ error: 'Not Found', message: 'Library item not found' });
      return;
    }
    res.status(200).json({ item });
  } catch (err: any) {
    res.status(500).json({ error: 'Library Error', message: err.message });
  }
});

// 5. Add single catalog item (Librarian, Registrar, or Library Staff)
libraryRouter.post(
  '/items',
  authenticate,
  requireRole('LIBRARIAN', 'REGISTRAR', 'LIBRARY_STAFF'),
  async (req: Request, res: Response) => {
    const { title, author, isbn, call_number, shelf_location, copies_total, copies_available, department_id } = req.body || {};

    if (!title || !author || !call_number || !shelf_location) {
      res.status(400).json({ error: 'Bad Request', message: 'title, author, call_number, and shelf_location are required.' });
      return;
    }

    try {
      const provider = getLibraryCatalogProvider();
      const created = await provider.addItem({
        title,
        author,
        isbn: isbn || null,
        call_number,
        shelf_location,
        copies_total: Number(copies_total) || 1,
        copies_available: Number(copies_available) || Number(copies_total) || 1,
        department_id: department_id ? Number(department_id) : null,
      });

      res.status(201).json({ item: created });
    } catch (err: any) {
      res.status(500).json({ error: 'Library Error', message: err.message });
    }
  }
);

// 6. Update single catalog item (Librarian, Registrar, or Library Staff)
libraryRouter.put(
  '/items/:id',
  authenticate,
  requireRole('LIBRARIAN', 'REGISTRAR', 'LIBRARY_STAFF'),
  async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const { title, author, isbn, call_number, shelf_location, copies_total, copies_available, department_id } = req.body || {};

    try {
      const provider = getLibraryCatalogProvider();
      const updated = await provider.updateItem(id, {
        title,
        author,
        isbn,
        call_number,
        shelf_location,
        copies_total,
        copies_available,
        department_id,
      });

      if (!updated) {
        res.status(404).json({ error: 'Not Found', message: 'Library item not found.' });
        return;
      }

      res.status(200).json({ message: 'Book updated successfully.', item: updated });
    } catch (err: any) {
      res.status(500).json({ error: 'Library Error', message: err.message });
    }
  }
);

// 7. Delete single catalog item (Librarian, Registrar, or Library Staff)
libraryRouter.delete(
  '/items/:id',
  authenticate,
  requireRole('LIBRARIAN', 'REGISTRAR', 'LIBRARY_STAFF'),
  async (req: Request, res: Response) => {
    const id = Number(req.params.id);

    try {
      const provider = getLibraryCatalogProvider();
      const result = await provider.deleteItem(id);

      if (!result.success) {
        res.status(400).json({ error: 'Bad Request', message: result.message || 'Cannot delete book.' });
        return;
      }

      res.status(200).json({ message: 'Book deleted from catalog successfully.' });
    } catch (err: any) {
      res.status(500).json({ error: 'Library Error', message: err.message });
    }
  }
);

// 6. Bulk CSV Catalog Import (Librarian, Registrar, or Library Staff)
libraryRouter.post(
  '/import-csv',
  authenticate,
  requireRole('LIBRARIAN', 'REGISTRAR', 'LIBRARY_STAFF'),
  upload.single('file'),
  async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: 'Bad Request', message: 'No CSV file uploaded' });
      return;
    }

    const mode = (req.body.mode === 'replace' || req.query.mode === 'replace' || req.body.replace_seeded === 'true' || req.query.replace_seeded === 'true')
      ? 'replace'
      : 'append';

    try {
      const stream = Readable.from(req.file.buffer);
      const summary = await processBookCsvStream(stream, req.user!.userId, mode);

      res.status(200).json({
        message: `Successfully processed ${summary.successfulRows} of ${summary.totalRows} books.`,
        summary,
        importedCount: summary.successfulRows,
        errors: summary.errors,
      });
    } catch (err: any) {
      console.error('[LibraryRoutes] import-csv error:', err);
      res.status(500).json({ error: 'Import Error', message: err.message || 'Failed to process book catalog CSV' });
    }
  }
);

