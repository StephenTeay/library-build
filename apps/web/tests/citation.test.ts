import { describe, it, expect } from 'vitest';
import { formatCitation, CitationItem } from '../src/utils/citationFormatter';

describe('Academic Citation Formatter Tests', () => {
  const sampleItem: CitationItem = {
    title: 'Introduction to Discrete Mathematics and Graph Theory',
    author: 'Prof. Adeyemi Adeleke',
    courseCode: 'COM111',
    courseTitle: 'Introduction to Computing',
    year: 2025,
    institution: 'Federal School of Statistics, Ibadan',
    url: 'http://localhost:5173/courses/1',
  };

  it('Formats valid APA 7th Edition citation', () => {
    const citation = formatCitation(sampleItem, 'APA');
    expect(citation).toContain('Prof. Adeyemi Adeleke. (2025).');
    expect(citation).toContain('Introduction to Discrete Mathematics and Graph Theory');
    expect(citation).toContain('(COM111 - Introduction to Computing)');
    expect(citation).toContain('Federal School of Statistics, Ibadan');
  });

  it('Formats valid MLA 9th Edition citation', () => {
    const citation = formatCitation(sampleItem, 'MLA');
    expect(citation).toContain('Prof. Adeyemi Adeleke. "Introduction to Discrete Mathematics and Graph Theory."');
    expect(citation).toContain('2025');
  });

  it('Formats valid IEEE citation', () => {
    const citation = formatCitation(sampleItem, 'IEEE');
    expect(citation).toContain('[1] Prof. Adeyemi Adeleke');
    expect(citation).toContain('"Introduction to Discrete Mathematics and Graph Theory,"');
  });

  it('Formats valid BibTeX citation block', () => {
    const bibtex = formatCitation(sampleItem, 'BIBTEX');
    expect(bibtex).toContain('@misc{');
    expect(bibtex).toContain('author       = {Prof. Adeyemi Adeleke}');
    expect(bibtex).toContain('title        = {{Introduction to Discrete Mathematics and Graph Theory}}');
    expect(bibtex).toContain('year         = {2025}');
  });

  it('Formats valid RIS export block for reference managers', () => {
    const ris = formatCitation(sampleItem, 'RIS');
    expect(ris).toContain('TY  - ELEC');
    expect(ris).toContain('TI  - Introduction to Discrete Mathematics and Graph Theory');
    expect(ris).toContain('AU  - Prof. Adeyemi Adeleke');
    expect(ris).toContain('PY  - 2025');
    expect(ris).toContain('ER  -');
  });
});
