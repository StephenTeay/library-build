export interface EnrichedBookData {
  title?: string;
  author?: string;
  publishers?: string[];
  publishDate?: string;
  numberOfPages?: number;
  coverUrl?: string;
  subjects?: string[];
  isbn?: string;
}

export async function fetchOpenLibraryBook(isbn: string): Promise<EnrichedBookData | null> {
  const cleanIsbn = isbn.replace(/[^0-9X]/gi, '').trim();
  if (!cleanIsbn) return null;

  try {
    const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${cleanIsbn}&format=json&jscmd=data`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return {
        coverUrl: `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-M.jpg`,
        isbn: cleanIsbn,
      };
    }

    const data = await res.json();
    const bookKey = `ISBN:${cleanIsbn}`;
    const book = data[bookKey];
    if (!book) {
      // Fallback: Check if OpenLibrary cover image exists
      return {
        coverUrl: `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-M.jpg`,
        isbn: cleanIsbn,
      };
    }

    return {
      title: book.title,
      author: book.authors?.map((a: any) => a.name).join(', '),
      publishers: book.publishers?.map((p: any) => p.name),
      publishDate: book.publish_date,
      numberOfPages: book.number_of_pages,
      coverUrl: book.cover?.medium || book.cover?.small || `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-M.jpg`,
      subjects: book.subjects?.slice(0, 5).map((s: any) => s.name),
      isbn: cleanIsbn,
    };
  } catch (err) {
    // Return graceful fallback on timeout or network block
    return {
      coverUrl: `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-M.jpg`,
      isbn: cleanIsbn,
    };
  }
}
