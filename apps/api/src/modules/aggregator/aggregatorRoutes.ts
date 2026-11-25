import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth.js';

export const aggregatorRouter = Router();

export interface AggregatorItem {
  id: string;
  source: 'arXiv' | 'Google Books' | 'Open Library' | 'Project Gutenberg' | 'Academic & Tech News' | 'GitHub' | 'Curated Hub';
  title: string;
  description: string;
  authors?: string;
  published?: string;
  thumbnail?: string;
  category?: string;
  readerType: 'pdf' | 'google_books' | 'open_library' | 'gutenberg' | 'news' | 'external';
  readUrl: string;
  externalUrl: string;
}

// In-memory cache with 15-minute TTL to stay strictly within free-tier limits
interface CacheEntry {
  data: any;
  expiresAt: number;
}
const searchCache = new Map<string, CacheEntry>();

function getCached(key: string): any | null {
  const entry = searchCache.get(key);
  if (entry && entry.expiresAt > Date.now()) {
    return entry.data;
  }
  searchCache.delete(key);
  return null;
}

function setCached(key: string, data: any, ttlSeconds = 900) {
  searchCache.set(key, { data, expiresAt: Date.now() + ttlSeconds * 1000 });
}

// 1. Curated Open Resource Collections
export const CURATED_RESOURCES: Record<string, any[]> = {
  CS: [
    { title: 'OpenStax: Computer Science Foundations', provider: 'OpenStax', category: 'TEXTBOOK', description: 'Peer-reviewed free computer science foundational textbooks.', url: 'https://openstax.org', type: 'TEXTBOOK' },
    { title: 'MIT OpenCourseWare: Intro to CS & Python (6.0001)', provider: 'MIT OCW', category: 'COURSE', description: 'Undergraduate introduction to computation, Python and algorithms.', url: 'https://ocw.mit.edu/courses/6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016/', type: 'COURSE' },
    { title: 'Full Stack Open 2024/2026', provider: 'University of Helsinki', category: 'COURSE', description: 'Modern JavaScript, React, Node.js, and TypeScript course.', url: 'https://fullstackopen.com/en/', type: 'COURSE' },
    { title: 'Directory of Open Access Books: Computer Science', provider: 'DOAB', category: 'COLLECTION', description: 'Open-access academic monograph collection for computing.', url: 'https://www.doabooks.org', type: 'COLLECTION' },
  ],
  AI: [
    { title: 'Hugging Face Open LLM & NLP Models', provider: 'Hugging Face', category: 'DATASET', description: 'Hub for open-source AI weights, datasets, and benchmarks.', url: 'https://huggingface.co/models', type: 'DATASET' },
    { title: 'Papers with Code: State-of-the-Art ML', provider: 'Papers with Code', category: 'RESEARCH', description: 'Machine learning papers paired with verified code implementations.', url: 'https://paperswithcode.com', type: 'RESEARCH' },
    { title: 'Fast.ai: Practical Deep Learning for Coders', provider: 'Fast.ai', category: 'COURSE', description: 'Top-down deep learning curriculum designed for programmers.', url: 'https://course.fast.ai', type: 'COURSE' },
    { title: 'Google Colab Free GPU Environment', provider: 'Google Research', category: 'LAB', description: 'Free hosted Jupyter notebook environment with cloud GPU acceleration.', url: 'https://colab.research.google.com', type: 'LAB' },
  ],
  NCC: [
    { title: 'Cisco Networking Academy Lab Resources', provider: 'Packet Tracer Labs', category: 'LAB', description: 'Simulation software for network topology, routing, and switching.', url: 'https://www.netacad.com', type: 'LAB' },
    { title: 'AWS Skill Builder: Cloud Practitioner Essentials', provider: 'AWS Training', category: 'CLOUD', description: 'Foundational cloud computing architectural patterns and services.', url: 'https://explore.skillbuilder.aws', type: 'CLOUD' },
    { title: 'Microsoft Learn: Azure Fundamentals (AZ-900)', provider: 'Microsoft Learn', category: 'CLOUD', description: 'Official modular learning path for cloud concepts and security.', url: 'https://learn.microsoft.com/en-us/training/paths/az-900-describe-cloud-concepts/', type: 'CLOUD' },
  ],
  STA: [
    { title: 'National Bureau of Statistics (NBS) Nigeria Data Portal', provider: 'NBS Nigeria', category: 'DATASET', description: 'Official socio-economic datasets, inflation, and demographic surveys.', url: 'https://nigerianstat.gov.ng', type: 'DATASET' },
    { title: 'R Project for Statistical Computing Documentation', provider: 'R-Project', category: 'REFERENCE', description: 'Official reference manuals and CRAN documentation for R.', url: 'https://www.r-project.org', type: 'REFERENCE' },
    { title: 'Python Statsmodels: Econometrics & Statistical Modeling', provider: 'Statsmodels', category: 'CODE', description: 'Statistical models, hypothesis testing, and time-series analysis.', url: 'https://www.statsmodels.org', type: 'CODE' },
    { title: 'Our World in Data Open Datasets', provider: 'Our World in Data', category: 'DATASET', description: 'Global empirical research datasets in open CSV formats.', url: 'https://ourworldindata.org', type: 'DATASET' },
  ],
  ACC: [
    { title: 'IFRS Foundation Open Standards & Summaries', provider: 'IFRS', category: 'STANDARD', description: 'International Financial Reporting Standards official summaries.', url: 'https://www.ifrs.org', type: 'STANDARD' },
    { title: 'AccountingCoach Free Accounting Tutorials', provider: 'AccountingCoach', category: 'REFERENCE', description: 'Foundational financial statements, bookkeeping, and ledger rules.', url: 'https://www.accountingcoach.com', type: 'REFERENCE' },
    { title: 'Principles of Accounting (OpenStax/Open Library)', provider: 'Open Textbook Library', category: 'TEXTBOOK', description: 'Free open textbook covering managerial and financial accounting.', url: 'https://open.umn.edu/opentextbooks/textbooks/principles-of-accounting-volume-1-financial-accounting', type: 'TEXTBOOK' },
  ],
  BA: [
    { title: 'MIT Sloan OpenCourseWare: Management & Strategy', provider: 'MIT OCW', category: 'COURSE', description: 'Operations research, corporate strategy, and organization behavior.', url: 'https://ocw.mit.edu/search/?d=Sloan%20School%20of%20Management', type: 'COURSE' },
    { title: 'Small Business Administration (SBA) Learning Center', provider: 'SBA', category: 'GUIDE', description: 'Business plan guides, financing frameworks, and market analysis.', url: 'https://www.sba.gov/business-guide', type: 'GUIDE' },
    { title: 'Harvard Business Publishing Open Case Studies', provider: 'HBR Open', category: 'CASE_STUDY', description: 'Selected open-access case studies on leadership and commerce.', url: 'https://hbsp.harvard.edu', type: 'CASE_STUDY' },
  ],
};

// --- DATA FETCHERS WITH RESILIENCE ---

async function fetchArxiv(q: string, maxResults = 6): Promise<AggregatorItem[]> {
  try {
    const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(q)}&start=0&max_results=${maxResults}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'FSS-IB-E-Library/1.0 (Academic Library Research Portal)' },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return [];

    const xml = await response.text();
    const entries: AggregatorItem[] = [];
    const entryMatches = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];

    for (const match of entryMatches) {
      const rawTitle = match.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim()?.replace(/\s+/g, ' ');
      const summary = match.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]?.trim()?.replace(/\s+/g, ' ');
      const rawId = match.match(/<id>([\s\S]*?)<\/id>/)?.[1]?.trim();
      const author = match.match(/<name>([\s\S]*?)<\/name>/)?.[1]?.trim();
      const published = match.match(/<published>([\s\S]*?)<\/published>/)?.[1]?.trim();

      if (rawTitle && rawId) {
        // Derive clean arxiv ID and direct PDF link
        const cleanId = rawId.replace(/^https?:\/\/arxiv\.org\/abs\//i, '').replace(/v\d+$/i, '');
        const pdfUrl = `https://arxiv.org/pdf/${cleanId}.pdf`;

        entries.push({
          id: `arxiv_${cleanId}`,
          source: 'arXiv',
          title: rawTitle,
          description: (summary || 'Academic preprint published on arXiv repository.').substring(0, 280) + '...',
          authors: author ? `Author: ${author}` : 'arXiv Academic Preprint',
          published: published ? new Date(published).toLocaleDateString() : undefined,
          category: 'Scientific Preprint',
          readerType: 'pdf',
          readUrl: pdfUrl,
          externalUrl: rawId,
        });
      }
    }
    return entries;
  } catch {
    return [];
  }
}

async function fetchGoogleBooks(q: string, maxResults = 6): Promise<AggregatorItem[]> {
  try {
    const apiKey = process.env.GOOGLE_BOOKS_API_KEY ? `&key=${process.env.GOOGLE_BOOKS_API_KEY}` : '';
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=${maxResults}${apiKey}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'FSS-IB-E-Library/1.0' },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return [];

    const json = await response.json() as any;
    const items: AggregatorItem[] = [];

    for (const item of json.items || []) {
      const info = item.volumeInfo || {};
      const access = item.accessInfo || {};
      const embedUrl = `https://books.google.com/books?id=${item.id}&printsec=frontcover&output=embed`;
      const thumbnail = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail;

      items.push({
        id: `gbook_${item.id}`,
        source: 'Google Books',
        title: info.title || 'Untitled Book',
        description: (info.description || 'Google Books catalog preview and digital volume.').substring(0, 260) + '...',
        authors: info.authors?.join(', ') || 'Unknown Author',
        published: info.publishedDate,
        thumbnail: thumbnail?.replace('http://', 'https://'),
        category: info.categories?.[0] || 'Digital Book',
        readerType: 'google_books',
        readUrl: access.webReaderLink || embedUrl,
        externalUrl: info.previewLink || embedUrl,
      });
    }
    return items;
  } catch {
    return [];
  }
}

async function fetchOpenLibrary(q: string, limit = 6): Promise<AggregatorItem[]> {
  try {
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=${limit}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'FSS-IB-E-Library/1.0' },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return [];

    const json = await response.json() as any;
    const items: AggregatorItem[] = [];

    for (const doc of json.docs || []) {
      const iaId = doc.ia?.[0];
      const embedUrl = iaId ? `https://archive.org/embed/${iaId}` : `https://openlibrary.org${doc.key}`;
      const coverUrl = doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : undefined;

      items.push({
        id: `ol_${(doc.key || '').replace(/[^a-zA-Z0-9]/g, '_')}`,
        source: 'Open Library',
        title: doc.title || 'Open Library Book',
        description: `First published in ${doc.first_publish_year || 'N/A'}. Editions: ${doc.edition_count || 1}. ${doc.subject?.slice(0, 3).join(', ') || 'Academic discipline'}.`,
        authors: doc.author_name?.slice(0, 2).join(', ') || 'Open Access Contributor',
        published: doc.first_publish_year ? String(doc.first_publish_year) : undefined,
        thumbnail: coverUrl,
        category: 'Free Online Book',
        readerType: 'open_library',
        readUrl: embedUrl,
        externalUrl: `https://openlibrary.org${doc.key}`,
      });
    }
    return items;
  } catch {
    return [];
  }
}

async function fetchGutenberg(q: string): Promise<AggregatorItem[]> {
  try {
    const url = `https://gutendex.com/books/?search=${encodeURIComponent(q)}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'FSS-IB-E-Library/1.0' },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return [];

    const json = await response.json() as any;
    const items: AggregatorItem[] = [];

    for (const book of (json.results || []).slice(0, 6)) {
      const formats = book.formats || {};
      const htmlUrl = formats['text/html'] || formats['text/html; charset=utf-8'];
      const textUrl = formats['text/plain; charset=utf-8'] || formats['text/plain'];
      const readUrl = htmlUrl || textUrl || `https://www.gutenberg.org/ebooks/${book.id}`;
      const coverUrl = formats['image/jpeg'];

      items.push({
        id: `guten_${book.id}`,
        source: 'Project Gutenberg',
        title: book.title || 'Classic Literature / Textbook',
        description: `Public domain book. Download count: ${book.download_count?.toLocaleString() || 0}. Subjects: ${book.subjects?.slice(0, 2).join(', ') || 'General'}.`,
        authors: book.authors?.map((a: any) => a.name).join(', ') || 'Classic Scholar',
        thumbnail: coverUrl,
        category: 'Public Domain Book',
        readerType: 'gutenberg',
        readUrl,
        externalUrl: `https://www.gutenberg.org/ebooks/${book.id}`,
      });
    }
    return items;
  } catch {
    return [];
  }
}

async function fetchNews(q: string, hitsPerPage = 6): Promise<AggregatorItem[]> {
  try {
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=${hitsPerPage}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'FSS-IB-E-Library/1.0' },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return [];

    const json = await response.json() as any;
    const items: AggregatorItem[] = [];

    for (const hit of json.hits || []) {
      const readUrl = hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`;
      items.push({
        id: `news_${hit.objectID}`,
        source: 'Academic & Tech News',
        title: hit.title || 'Academic & Technology News Brief',
        description: `Source: ${hit.url ? new URL(hit.url).hostname : 'Tech / Academic Community'}. Upvotes: ${hit.points || 0}. Comments: ${hit.num_comments || 0}.`,
        authors: hit.author ? `Reporter: ${hit.author}` : 'Scientific & Tech Wire',
        published: hit.created_at ? new Date(hit.created_at).toLocaleDateString() : undefined,
        category: 'Science & Tech News',
        readerType: 'news',
        readUrl,
        externalUrl: readUrl,
      });
    }
    return items;
  } catch {
    return [];
  }
}

async function fetchGitHub(q: string, perPage = 4): Promise<AggregatorItem[]> {
  try {
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${perPage}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'FSS-IB-E-Library/1.0',
        Accept: 'application/vnd.github.v3+json',
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return [];

    const json = await response.json() as any;
    const items: AggregatorItem[] = [];

    for (const repo of json.items || []) {
      items.push({
        id: `gh_${repo.id}`,
        source: 'GitHub',
        title: repo.full_name,
        description: repo.description || 'Open-source scientific and computational software library.',
        authors: `⭐ ${repo.stargazers_count} stars · Language: ${repo.language || 'Code'}`,
        published: repo.updated_at ? new Date(repo.updated_at).toLocaleDateString() : undefined,
        category: 'Open-Source Code',
        readerType: 'external',
        readUrl: repo.html_url,
        externalUrl: repo.html_url,
      });
    }
    return items;
  } catch {
    return [];
  }
}

// --- ROUTES ---

// 1. Get Curated Resources by Department
aggregatorRouter.get('/curated', authenticate, (req: Request, res: Response) => {
  const dept = String(req.query.dept || 'CS').toUpperCase();
  const resources = CURATED_RESOURCES[dept] || CURATED_RESOURCES.CS;
  res.status(200).json({ department: dept, resources });
});

// 2. Comprehensive Multi-Platform Live Search
aggregatorRouter.get('/live-search', authenticate, async (req: Request, res: Response) => {
  const q = String(req.query.q || '').trim();
  const platform = String(req.query.platform || 'all').toLowerCase();

  if (!q) {
    res.status(400).json({ error: 'Bad Request', message: 'Query string q is required' });
    return;
  }

  const cacheKey = `live_search:${platform}:${q}`;
  const cached = getCached(cacheKey);
  if (cached) {
    res.status(200).json({ source: 'cache', results: cached });
    return;
  }

  let results: AggregatorItem[] = [];

  try {
    if (platform === 'arxiv') {
      results = await fetchArxiv(q, 10);
    } else if (platform === 'google_books') {
      results = await fetchGoogleBooks(q, 10);
      if (results.length === 0) {
        // Fallback to Open Library
        results = await fetchOpenLibrary(q, 8);
      }
    } else if (platform === 'open_library') {
      results = await fetchOpenLibrary(q, 10);
    } else if (platform === 'gutenberg') {
      results = await fetchGutenberg(q);
    } else if (platform === 'news') {
      results = await fetchNews(q, 10);
    } else {
      // 'all' -> Query all platforms in parallel
      const [arxivRes, gbooksRes, olRes, gutenRes, newsRes] = await Promise.allSettled([
        fetchArxiv(q, 4),
        fetchGoogleBooks(q, 4),
        fetchOpenLibrary(q, 4),
        fetchGutenberg(q),
        fetchNews(q, 4),
      ]);

      const arxivItems = arxivRes.status === 'fulfilled' ? arxivRes.value : [];
      let gbooksItems = gbooksRes.status === 'fulfilled' ? gbooksRes.value : [];
      const olItems = olRes.status === 'fulfilled' ? olRes.value : [];
      const gutenItems = gutenRes.status === 'fulfilled' ? gutenRes.value : [];
      const newsItems = newsRes.status === 'fulfilled' ? newsRes.value : [];

      // Interleave items for diverse results
      const maxLength = Math.max(
        arxivItems.length,
        gbooksItems.length,
        olItems.length,
        gutenItems.length,
        newsItems.length
      );

      for (let i = 0; i < maxLength; i++) {
        if (arxivItems[i]) results.push(arxivItems[i]);
        if (gbooksItems[i]) results.push(gbooksItems[i]);
        if (olItems[i]) results.push(olItems[i]);
        if (gutenItems[i]) results.push(gutenItems[i]);
        if (newsItems[i]) results.push(newsItems[i]);
      }
    }

    // Fallback if all external networks fail
    if (results.length === 0) {
      const qLower = q.toLowerCase();
      for (const list of Object.values(CURATED_RESOURCES)) {
        for (const item of list) {
          if (item.title.toLowerCase().includes(qLower) || item.description.toLowerCase().includes(qLower)) {
            results.push({
              id: `curated_${results.length}`,
              source: 'Curated Hub',
              title: item.title,
              description: item.description,
              authors: item.provider,
              category: item.category,
              readerType: 'external',
              readUrl: item.url,
              externalUrl: item.url,
            });
          }
        }
      }
    }

    setCached(cacheKey, results, 900); // 15 mins cache
    res.status(200).json({ source: 'live', results });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Error', message: err.message || 'Live search error' });
  }
});

// 3. In-UI Reader Proxy: Clean & Sanitize External Open Books / Articles
aggregatorRouter.get('/read-proxy', authenticate, async (req: Request, res: Response) => {
  const targetUrl = String(req.query.url || '').trim();

  if (!targetUrl || (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://'))) {
    res.status(400).json({ error: 'Bad Request', message: 'Valid http/https url parameter is required' });
    return;
  }

  const cacheKey = `read_proxy:${targetUrl}`;
  const cached = getCached(cacheKey);
  if (cached) {
    res.status(200).json({ source: 'cache', ...cached });
    return;
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) FSS-IB-E-Library/1.0 Reader',
        Accept: 'text/html,text/plain,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      res.status(response.status).json({
        error: 'Fetch Failed',
        message: `Remote source responded with status ${response.status}`,
      });
      return;
    }

    const contentType = response.headers.get('content-type') || 'text/html';
    const rawBody = await response.text();

    let cleanedContent = rawBody;
    let extractedTitle = '';

    if (contentType.includes('html')) {
      // Extract title
      const titleMatch = rawBody.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (titleMatch) {
        extractedTitle = titleMatch[1].replace(/<[^>]+>/g, '').trim();
      }

      // Strip dangerous tags: scripts, styles, object, embed, iframe
      cleanedContent = rawBody
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
        .replace(/\son\w+="[^"]*"/gi, '')
        .replace(/\son\w+='[^']*'/gi, '')
        .replace(/\sjavascript:[^\s"'>]+/gi, '');

      // Extract body contents if present
      const bodyMatch = cleanedContent.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      if (bodyMatch) {
        cleanedContent = bodyMatch[1];
      }
    }

    const payload = {
      url: targetUrl,
      title: extractedTitle,
      contentType: contentType.includes('text/plain') ? 'text/plain' : 'text/html',
      content: cleanedContent.substring(0, 500000), // Max 500KB readable text
    };

    setCached(cacheKey, payload, 3600); // 1 hour cache for reader text
    res.status(200).json({ source: 'live', ...payload });
  } catch (err: any) {
    res.status(502).json({
      error: 'Proxy Error',
      message: err.message || 'Failed to fetch article or document for in-UI reading',
    });
  }
});

// 4. Legacy Combined /query endpoint (maintained for backwards compatibility)
aggregatorRouter.get('/query', authenticate, async (req: Request, res: Response) => {
  const q = String(req.query.q || '').trim();
  if (!q) {
    res.status(400).json({ error: 'Bad Request', message: 'Query string q is required' });
    return;
  }

  const cacheKey = `combined:${q}`;
  const cached = getCached(cacheKey);
  if (cached) {
    res.status(200).json({ source: 'cache', results: cached });
    return;
  }

  const [arxivRes, gbooksRes, gutenRes, newsRes, ghRes] = await Promise.allSettled([
    fetchArxiv(q, 3),
    fetchGoogleBooks(q, 3),
    fetchGutenberg(q),
    fetchNews(q, 3),
    fetchGitHub(q, 3),
  ]);

  const combinedResults: any[] = [];

  if (arxivRes.status === 'fulfilled') {
    arxivRes.value.forEach((i) => combinedResults.push({
      source: i.source,
      title: i.title,
      description: i.description,
      url: i.externalUrl,
      readUrl: i.readUrl,
      readerType: i.readerType,
      authorsOrOwner: i.authors,
    }));
  }

  if (gbooksRes.status === 'fulfilled') {
    gbooksRes.value.forEach((i) => combinedResults.push({
      source: i.source,
      title: i.title,
      description: i.description,
      url: i.externalUrl,
      readUrl: i.readUrl,
      readerType: i.readerType,
      authorsOrOwner: i.authors,
    }));
  }

  if (gutenRes.status === 'fulfilled') {
    gutenRes.value.forEach((i) => combinedResults.push({
      source: i.source,
      title: i.title,
      description: i.description,
      url: i.externalUrl,
      readUrl: i.readUrl,
      readerType: i.readerType,
      authorsOrOwner: i.authors,
    }));
  }

  if (newsRes.status === 'fulfilled') {
    newsRes.value.forEach((i) => combinedResults.push({
      source: i.source,
      title: i.title,
      description: i.description,
      url: i.externalUrl,
      readUrl: i.readUrl,
      readerType: i.readerType,
      authorsOrOwner: i.authors,
    }));
  }

  if (ghRes.status === 'fulfilled') {
    ghRes.value.forEach((i) => combinedResults.push({
      source: i.source,
      title: i.title,
      description: i.description,
      url: i.externalUrl,
      readUrl: i.readUrl,
      readerType: i.readerType,
      authorsOrOwner: i.authors,
    }));
  }

  if (combinedResults.length === 0) {
    const qLower = q.toLowerCase();
    for (const list of Object.values(CURATED_RESOURCES)) {
      for (const item of list) {
        if (item.title.toLowerCase().includes(qLower) || item.description.toLowerCase().includes(qLower)) {
          combinedResults.push({
            source: 'Curated Hub',
            title: item.title,
            description: item.description,
            url: item.url,
            readUrl: item.url,
            readerType: 'external',
            authorsOrOwner: item.provider,
          });
        }
      }
    }
  }

  setCached(cacheKey, combinedResults, 900);
  res.status(200).json({ source: 'live', results: combinedResults });
});

// 5. Direct arXiv endpoint
aggregatorRouter.get('/arxiv', authenticate, async (req: Request, res: Response) => {
  const q = String(req.query.q || '').trim();
  if (!q) {
    res.status(400).json({ error: 'Bad Request', message: 'Query string q is required' });
    return;
  }
  const items = await fetchArxiv(q, 8);
  res.status(200).json({ source: 'live', results: items });
});

// 6. Direct GitHub endpoint
aggregatorRouter.get('/github', authenticate, async (req: Request, res: Response) => {
  const q = String(req.query.q || '').trim();
  if (!q) {
    res.status(400).json({ error: 'Bad Request', message: 'Query string q is required' });
    return;
  }
  const items = await fetchGitHub(q, 8);
  res.status(200).json({ source: 'live', results: items });
});
