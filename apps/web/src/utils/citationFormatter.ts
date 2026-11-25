export type CitationStyle = 'APA' | 'MLA' | 'CHICAGO' | 'HARVARD' | 'IEEE' | 'BIBTEX' | 'RIS';

export interface CitationItem {
  id?: string | number;
  title: string;
  author?: string;
  courseCode?: string;
  courseTitle?: string;
  year?: number | string;
  publisher?: string;
  institution?: string;
  url?: string;
  isbn?: string;
  resourceType?: string;
}

export function formatCitation(item: CitationItem, style: CitationStyle): string {
  const author = item.author?.trim() || 'Federal School of Statistics, Ibadan';
  const title = item.title.trim();
  const year = item.year || new Date().getFullYear();
  const institution = item.institution || 'Federal School of Statistics, Ibadan (FSS-IB)';
  const courseStr = item.courseCode ? ` (${item.courseCode} - ${item.courseTitle})` : '';
  const currentUrl = item.url || (typeof window !== 'undefined' ? window.location.href : 'https://fss.ng');

  switch (style) {
    case 'APA':
      // APA 7th: Author, A. (Year). Title. Institution. URL
      return `${author}. (${year}). ${title}${courseStr}. ${institution}. ${currentUrl}`;

    case 'MLA':
      // MLA 9th: Author. "Title." Course/Institution, Year, URL.
      return `${author}. "${title}." ${institution}${courseStr}, ${year}, ${currentUrl}.`;

    case 'CHICAGO':
      // Chicago 17th: Author. "Title." Institution, Year. URL.
      return `${author}. "${title}." ${institution}${courseStr}, ${year}. ${currentUrl}.`;

    case 'HARVARD':
      // Harvard: Author (Year) 'Title', Institution. Available at: URL.
      return `${author} (${year}) '${title}', ${institution}${courseStr}. Available at: ${currentUrl} (Accessed: ${new Date().toLocaleDateString()}).`;

    case 'IEEE':
      // IEEE: [1] Author, "Title," Institution, Year.
      return `[1] ${author}, "${title}," ${institution}${courseStr}, ${year}. [Online]. Available: ${currentUrl}.`;

    case 'BIBTEX': {
      const citeKey = (author.split(/[\s,]+/)[0] || 'fss').toLowerCase() + year + (item.courseCode?.toLowerCase() || '');
      return `@misc{${citeKey},
  author       = {${author}},
  title        = {{${title}}},
  year         = {${year}},
  institution  = {${institution}},
  howpublished = {\\url{${currentUrl}}},
  note         = {Accessed: ${new Date().toISOString().split('T')[0]}}
}`;
    }

    case 'RIS':
      return `TY  - ELEC
TI  - ${title}
AU  - ${author}
PB  - ${institution}
PY  - ${year}
UR  - ${currentUrl}
N1  - ${item.courseCode || ''}
ER  - `;

    default:
      return `${author}. (${year}). ${title}. ${institution}.`;
  }
}

export function downloadBibTeX(item: CitationItem): void {
  const content = formatCitation(item, 'BIBTEX');
  const filename = `${(item.title || 'citation').replace(/[^a-zA-Z0-9_-]/g, '_')}.bib`;
  triggerDownload(content, filename, 'application/x-bibtex');
}

export function downloadRIS(item: CitationItem): void {
  const content = formatCitation(item, 'RIS');
  const filename = `${(item.title || 'citation').replace(/[^a-zA-Z0-9_-]/g, '_')}.ris`;
  triggerDownload(content, filename, 'application/x-research-info-systems');
}

function triggerDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
