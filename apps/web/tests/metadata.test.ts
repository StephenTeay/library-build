import { describe, it, expect } from 'vitest';
import { fetchOpenLibraryBook } from '../src/services/metadataEnrichment';

describe('Bibliographic Metadata Enrichment Tests', () => {
  it('Returns fallback or data for a given ISBN', async () => {
    const isbn = '9780072468366';
    const result = await fetchOpenLibraryBook(isbn);

    expect(result).toBeDefined();
    if (result) {
      expect(result.isbn).toBe(isbn);
      expect(result.coverUrl).toBeDefined();
    }
  }, 10000);

  it('Returns null for empty ISBN', async () => {
    const result = await fetchOpenLibraryBook('');
    expect(result).toBeNull();
  });
});
