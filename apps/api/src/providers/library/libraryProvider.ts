import { pool } from '../../db/pool.js';

export interface LibraryItem {
  id: number;
  title: string;
  author: string;
  isbn: string | null;
  call_number: string;
  shelf_location: string;
  copies_total: number;
  copies_available: number;
  department_id: number | null;
  department_name?: string;
}

export interface ILibraryCatalogProvider {
  search(queryText: string, departmentId?: number, limit?: number): Promise<LibraryItem[]>;
  getItemAvailability(id: number): Promise<LibraryItem | null>;
  addItem(item: Omit<LibraryItem, 'id'>): Promise<LibraryItem>;
}

/**
 * LocalCatalogProvider: Staff-maintained catalog backed directly by PostgreSQL library_items.
 * Offers full-text search, call number location lookups, and real-time physical shelf availability.
 */
export class LocalCatalogProvider implements ILibraryCatalogProvider {
  async search(queryText: string, departmentId?: number, limit = 50): Promise<LibraryItem[]> {
    let sql = `
      SELECT li.id, li.title, li.author, li.isbn, li.call_number,
             li.shelf_location, li.copies_total, li.copies_available,
             li.department_id, d.name as department_name, d.code as department_code
      FROM library_items li
      LEFT JOIN departments d ON li.department_id = d.id
      WHERE 1=1
    `;
    const params: any[] = [];

    const q = queryText?.trim();
    if (q) {
      params.push(`%${q}%`);
      sql += ` AND (li.title ILIKE $${params.length} OR li.author ILIKE $${params.length} OR li.call_number ILIKE $${params.length} OR li.isbn ILIKE $${params.length})`;
    }

    if (departmentId) {
      params.push(departmentId);
      sql += ` AND li.department_id = $${params.length}`;
    }

    params.push(limit);
    sql += ` ORDER BY li.title ASC LIMIT $${params.length}`;

    const res = await pool.query(sql, params);
    return res.rows;
  }

  async getItemAvailability(id: number): Promise<LibraryItem | null> {
    const res = await pool.query(
      `SELECT li.id, li.title, li.author, li.isbn, li.call_number,
              li.shelf_location, li.copies_total, li.copies_available,
              li.department_id, d.name as department_name, d.code as department_code
       FROM library_items li
       LEFT JOIN departments d ON li.department_id = d.id
       WHERE li.id = $1`,
      [id]
    );

    return res.rows.length > 0 ? res.rows[0] : null;
  }

  async addItem(item: Omit<LibraryItem, 'id'>): Promise<LibraryItem> {
    const res = await pool.query(
      `INSERT INTO library_items (
        title, author, isbn, call_number, shelf_location,
        copies_total, copies_available, department_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;`,
      [
        item.title,
        item.author,
        item.isbn || null,
        item.call_number,
        item.shelf_location,
        item.copies_total || 1,
        item.copies_available || item.copies_total || 1,
        item.department_id || null,
      ]
    );
    return res.rows[0];
  }
}

/**
 * KohaSruProvider (Documented Stub):
 * Future integration for live library systems (Koha, SRU/Z39.50 protocol).
 * When FSS-IB acquires a Koha automated library server, this provider will execute
 * SRU (Search/Retrieve via URL) XML queries against the Koha endpoint and map
 * MARC21 / Dublin Core records to the standard LibraryItem interface.
 */
export class KohaSruProvider implements ILibraryCatalogProvider {
  private sruBaseUrl: string;

  constructor(sruBaseUrl?: string) {
    this.sruBaseUrl = sruBaseUrl || process.env.KOHA_SRU_URL || 'https://koha.fss-ibadan.edu.ng/cgi-bin/koha/sru';
  }

  async search(queryText: string, departmentId?: number, limit = 50): Promise<LibraryItem[]> {
    console.log(`[KohaSruProvider Stub] Querying remote SRU endpoint: ${this.sruBaseUrl}?query=${queryText}&limit=${limit}`);
    // Future implementation:
    // const sruXml = await fetch(`${this.sruBaseUrl}?operation=searchRetrieve&version=1.2&query=bath.title="${queryText}"&maximumRecords=${limit}`);
    // return parseMarc21XmlToLibraryItems(sruXml);
    return [];
  }

  async getItemAvailability(id: number): Promise<LibraryItem | null> {
    console.log(`[KohaSruProvider Stub] Checking holding item availability for ID: ${id}`);
    return null;
  }

  async addItem(_item: Omit<LibraryItem, 'id'>): Promise<LibraryItem> {
    throw new Error('Direct write not supported on remote Koha SRU provider. Manage catalog in Koha staff client.');
  }
}

let libraryCatalogInstance: ILibraryCatalogProvider | null = null;

export function getLibraryCatalogProvider(): ILibraryCatalogProvider {
  if (!libraryCatalogInstance) {
    if (process.env.LIBRARY_PROVIDER === 'koha') {
      libraryCatalogInstance = new KohaSruProvider();
    } else {
      libraryCatalogInstance = new LocalCatalogProvider();
    }
  }
  return libraryCatalogInstance;
}

