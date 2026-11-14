import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth.js';

export const aggregatorRouter = Router();

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

// 1. Get Curated Resources by Department
aggregatorRouter.get('/curated', authenticate, (req: Request, res: Response) => {
  const dept = String(req.query.dept || 'CS').toUpperCase();
  const resources = CURATED_RESOURCES[dept] || CURATED_RESOURCES.CS;
  res.status(200).json({ department: dept, resources });
});

// 2. Combined Live Search across arXiv and GitHub
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

  const combinedResults: any[] = [];

  // Fetch arXiv
  try {
    const arxivUrl = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(q)}&start=0&max_results=5`;
    const arxivRes = await fetch(arxivUrl, { headers: { 'User-Agent': 'FSS-IB-E-Library/1.0' } });
    if (arxivRes.ok) {
      const xml = await arxivRes.text();
      const entryMatches = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];
      for (const match of entryMatches) {
        const title = match.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim()?.replace(/\s+/g, ' ');
        const summary = match.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]?.trim()?.replace(/\s+/g, ' ');
        const id = match.match(/<id>([\s\S]*?)<\/id>/)?.[1]?.trim();
        const author = match.match(/<name>([\s\S]*?)<\/name>/)?.[1]?.trim();
        if (title && id) {
          combinedResults.push({
            source: 'arXiv',
            title,
            description: (summary || '').substring(0, 200) + '...',
            url: id,
            authorsOrOwner: author ? `Author: ${author}` : 'arXiv Academic Preprint',
          });
        }
      }
    }
  } catch {
    // Graceful fallback for network limits
  }

  // Fetch GitHub
  try {
    const ghUrl = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=5`;
    const ghRes = await fetch(ghUrl, {
      headers: {
        'User-Agent': 'FSS-IB-E-Library/1.0',
        Accept: 'application/vnd.github.v3+json',
      },
    });
    if (ghRes.ok) {
      const json = await ghRes.json() as any;
      for (const repo of json.items || []) {
        combinedResults.push({
          source: 'GitHub',
          title: repo.full_name,
          description: repo.description || 'Open-source code repository',
          url: repo.html_url,
          authorsOrOwner: `⭐ ${repo.stargazers_count} stars · ${repo.language || 'Code'}`,
        });
      }
    }
  } catch {
    // Graceful fallback
  }

  // If both external queries failed (e.g. offline sandbox), return matching curated resources
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
            authorsOrOwner: item.provider,
          });
        }
      }
    }
  }

  setCached(cacheKey, combinedResults, 900);
  res.status(200).json({ source: 'live', results: combinedResults });
});

// 2. Search arXiv via public API with server-side caching
aggregatorRouter.get('/arxiv', authenticate, async (req: Request, res: Response) => {
  const q = String(req.query.q || '').trim();
  if (!q) {
    res.status(400).json({ error: 'Bad Request', message: 'Query string q is required' });
    return;
  }

  const cacheKey = `arxiv:${q}`;
  const cached = getCached(cacheKey);
  if (cached) {
    res.status(200).json({ source: 'cache', results: cached });
    return;
  }

  try {
    const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(q)}&start=0&max_results=8`;
    const response = await fetch(url, { headers: { 'User-Agent': 'FSS-IB-E-Library/1.0' } });

    if (!response.ok) {
      throw new Error(`arXiv API returned status ${response.status}`);
    }

    const xml = await response.text();

    // Lightweight regex parse of arXiv Atom XML to prevent heavy XML parser dependency
    const entries: any[] = [];
    const entryMatches = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];

    for (const match of entryMatches) {
      const title = match.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim()?.replace(/\s+/g, ' ');
      const summary = match.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]?.trim()?.replace(/\s+/g, ' ');
      const id = match.match(/<id>([\s\S]*?)<\/id>/)?.[1]?.trim();
      const published = match.match(/<published>([\s\S]*?)<\/published>/)?.[1]?.trim();

      if (title && id) {
        entries.push({ title, summary: summary?.substring(0, 300) + '...', url: id, published });
      }
    }

    setCached(cacheKey, entries, 900); // 15 mins cache
    res.status(200).json({ source: 'live', results: entries });
  } catch (err: any) {
    res.status(200).json({
      source: 'fallback',
      warning: 'Live arXiv query temporarily unavailable, showing curated resources.',
      results: CURATED_RESOURCES.AI.slice(0, 5),
    });
  }
});

// 3. Search GitHub Repositories via public API with server-side caching
aggregatorRouter.get('/github', authenticate, async (req: Request, res: Response) => {
  const q = String(req.query.q || '').trim();
  if (!q) {
    res.status(400).json({ error: 'Bad Request', message: 'Query string q is required' });
    return;
  }

  const cacheKey = `github:${q}`;
  const cached = getCached(cacheKey);
  if (cached) {
    res.status(200).json({ source: 'cache', results: cached });
    return;
  }

  try {
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=8`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'FSS-IB-E-Library/1.0',
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API returned status ${response.status}`);
    }

    const json = await response.json() as any;
    const items = (json.items || []).map((repo: any) => ({
      name: repo.full_name,
      description: repo.description,
      stars: repo.stargazers_count,
      language: repo.language,
      url: repo.html_url,
    }));

    setCached(cacheKey, items, 900);
    res.status(200).json({ source: 'live', results: items });
  } catch (err: any) {
    res.status(200).json({
      source: 'fallback',
      warning: 'Live GitHub query temporarily unavailable, showing curated repositories.',
      results: CURATED_RESOURCES.CS.slice(0, 5),
    });
  }
});

