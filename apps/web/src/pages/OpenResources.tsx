import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { AggregatorItem } from '../types';
import { UniversalReaderModal } from '../components/UniversalReaderModal';

interface CuratedResource {
  title: string;
  category: string;
  description: string;
  url: string;
  provider?: string;
}

type PlatformFilter = 'all' | 'arxiv' | 'google_books' | 'open_library' | 'gutenberg' | 'news';

const QUICK_TOPICS = [
  'Machine Learning',
  'Calculus & Linear Algebra',
  'Probability & Statistics',
  'Data Science & Python',
  'Microeconomics',
  'Algorithms & Data Structures',
  'Computer Networks',
];

export const OpenResources: React.FC = () => {
  const [department, setDepartment] = useState('CS');
  const [curatedList, setCuratedList] = useState<CuratedResource[]>([]);
  const [curatedLoading, setCuratedLoading] = useState(false);

  // Live Query State
  const [liveQuery, setLiveQuery] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformFilter>('all');
  const [liveResults, setLiveResults] = useState<AggregatorItem[]>([]);
  const [liveSearching, setLiveSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // In-UI Reader State
  const [activeReaderItem, setActiveReaderItem] = useState<AggregatorItem | null>(null);

  useEffect(() => {
    const fetchCurated = async () => {
      setCuratedLoading(true);
      try {
        const res = await api.get<{ resources: CuratedResource[] }>(`/aggregator/curated?dept=${department}`);
        setCuratedList(res.resources || []);
      } catch (err) {
        console.warn('Failed to load curated resources', err);
      } finally {
        setCuratedLoading(false);
      }
    };

    fetchCurated();
  }, [department]);

  const executeSearch = async (queryText: string, platform: PlatformFilter) => {
    if (!queryText.trim()) return;

    setLiveSearching(true);
    setHasSearched(true);
    try {
      const res = await api.get<{ results: AggregatorItem[] }>(
        `/aggregator/live-search?q=${encodeURIComponent(queryText)}&platform=${platform}`
      );
      setLiveResults(res.results || []);
    } catch (err) {
      console.warn('Live aggregator query failed', err);
      // Fallback query if live-search had a transient network issue
      try {
        const fallbackRes = await api.get<{ results: any[] }>(`/aggregator/query?q=${encodeURIComponent(queryText)}`);
        const mappedFallback: AggregatorItem[] = (fallbackRes.results || []).map((r, i) => ({
          id: `fallback_${i}`,
          source: r.source || 'Curated Hub',
          title: r.title,
          description: r.description,
          authors: r.authorsOrOwner,
          readerType: r.readerType || 'external',
          readUrl: r.readUrl || r.url,
          externalUrl: r.url,
        }));
        setLiveResults(mappedFallback);
      } catch {
        setLiveResults([]);
      }
    } finally {
      setLiveSearching(false);
    }
  };

  const handleLiveSearch = (e: React.FormEvent) => {
    e.preventDefault();
    executeSearch(liveQuery, selectedPlatform);
  };

  const handleQuickTopic = (topic: string) => {
    setLiveQuery(topic);
    executeSearch(topic, selectedPlatform);
  };

  const handlePlatformChange = (platform: PlatformFilter) => {
    setSelectedPlatform(platform);
    if (liveQuery.trim()) {
      executeSearch(liveQuery, platform);
    }
  };

  const getSourceBadgeColor = (source: string) => {
    switch (source) {
      case 'arXiv':
        return 'bg-amber-100 text-amber-900 border-amber-300';
      case 'Google Books':
        return 'bg-sky-100 text-sky-900 border-sky-300';
      case 'Open Library':
        return 'bg-emerald-100 text-emerald-900 border-emerald-300';
      case 'Project Gutenberg':
        return 'bg-purple-100 text-purple-900 border-purple-300';
      case 'Academic & Tech News':
        return 'bg-rose-100 text-rose-900 border-rose-300';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-300';
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header Banner */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-sm bg-slate-900 text-white tracking-widest uppercase">
            Global Research Hub
          </span>
          <span className="text-xs text-slate-500 font-medium">Federal School of Statistics, Ibadan</span>
        </div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
          Live Research & Free Open Library
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl leading-relaxed">
          Search, discover, and read millions of scientific preprints (arXiv), free digital books (Google Books, Open Library, Project Gutenberg), and live academic tech news—all directly readable inside your browser window.
        </p>
      </div>

      {/* SECTION 1: Unified Live Multi-Platform Search Engine */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
              <span>🔎</span>
              <span>Live Academic & Literature Search</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Instant retrieval across Google Books, arXiv, Open Library, Project Gutenberg, and Academic News.
            </p>
          </div>

          {/* Platform Filter Buttons */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            {[
              { id: 'all', label: '🌐 All Sources' },
              { id: 'arxiv', label: '📑 arXiv Papers' },
              { id: 'google_books', label: '📚 Google Books' },
              { id: 'open_library', label: '🏛️ Open Library' },
              { id: 'gutenberg', label: '📖 Gutenberg Books' },
              { id: 'news', label: '📰 Academic News' },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => handlePlatformChange(p.id as PlatformFilter)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer min-h-[36px] border ${
                  selectedPlatform === p.id
                    ? 'bg-emerald-900 text-white border-emerald-900 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Search Input Form */}
        <form onSubmit={handleLiveSearch} className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <input
              type="text"
              value={liveQuery}
              onChange={(e) => setLiveQuery(e.target.value)}
              placeholder="Search research papers, books, or articles (e.g. machine learning, calculus, econometrics)..."
              className="w-full pl-9 pr-8 py-2.5 border border-slate-200 rounded-lg text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-800 transition-all"
            />
            <span className="absolute left-3 top-3 text-xs text-slate-400">🔍</span>
            {liveQuery && (
              <button
                type="button"
                onClick={() => setLiveQuery('')}
                className="absolute right-2.5 top-2.5 text-xs text-slate-400 hover:text-slate-600 px-1 py-0.5"
                title="Clear"
              >
                ✕
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={liveSearching}
            className="px-6 py-2.5 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg font-semibold text-xs sm:text-sm shadow-xs transition-colors shrink-0 min-h-[44px] cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {liveSearching ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                <span>Searching Repositories...</span>
              </>
            ) : (
              <>
                <span>⚡</span>
                <span>Search Live</span>
              </>
            )}
          </button>
        </form>

        {/* Quick Topic Suggested Pills */}
        <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500 pt-1">
          <span className="font-semibold text-[11px] text-slate-400">Suggested Topics:</span>
          {QUICK_TOPICS.map((topic) => (
            <button
              key={topic}
              type="button"
              onClick={() => handleQuickTopic(topic)}
              className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium transition-colors cursor-pointer"
            >
              {topic}
            </button>
          ))}
        </div>

        {/* Results Area */}
        {liveSearching ? (
          <div className="p-12 text-center space-y-3 animate-pulse">
            <div className="w-10 h-10 border-3 border-emerald-900 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-sm font-semibold text-slate-800">
              Querying arXiv, Google Books, Open Library, Gutenberg & News feeds...
            </p>
            <p className="text-xs text-slate-400">Filtering open-access full-text and verified public domain holdings.</p>
          </div>
        ) : hasSearched && liveResults.length > 0 ? (
          <div className="space-y-3 pt-2">
            <div className="text-xs font-semibold text-slate-500 flex items-center justify-between pb-1 border-b border-slate-100">
              <span>Found {liveResults.length} open research and book results:</span>
              <span className="text-[11px] text-emerald-800 font-medium">All items ready to read directly within the page</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {liveResults.map((item) => (
                <div
                  key={item.id}
                  className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm transition-all flex flex-col justify-between space-y-3"
                >
                  <div className="space-y-2">
                    {/* Source & Date Badge */}
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-sm uppercase tracking-wider border ${getSourceBadgeColor(item.source)}`}>
                        {item.source}
                      </span>
                      {item.published && (
                        <span className="text-[11px] font-mono text-slate-400">
                          {item.published}
                        </span>
                      )}
                    </div>

                    {/* Book Thumbnail & Title */}
                    <div className="flex gap-3">
                      {item.thumbnail && (
                        <img
                          src={item.thumbnail}
                          alt={item.title}
                          className="w-14 h-20 object-cover rounded-md border border-slate-200 shrink-0 bg-slate-50"
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      )}
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-slate-900 leading-snug line-clamp-2" title={item.title}>
                          {item.title}
                        </h3>
                        {item.authors && (
                          <p className="text-xs text-slate-500 font-medium mt-0.5 line-clamp-1">
                            {item.authors}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Snippet / Description */}
                    <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed">
                      {item.description}
                    </p>
                  </div>

                  {/* Actions: In-UI Reader & External Mirror */}
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                    <button
                      onClick={() => setActiveReaderItem(item)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer min-h-[38px]"
                      title="Open full document directly in the distraction-free reader without leaving this page"
                    >
                      <span>📖</span>
                      <span>Read in UI</span>
                    </button>

                    <a
                      href={item.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-lg text-xs transition-colors shrink-0"
                      title="Open original external webpage in new tab"
                    >
                      <span>↗</span>
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : hasSearched && liveResults.length === 0 ? (
          <div className="text-center py-10 space-y-2">
            <span className="text-2xl">🔎</span>
            <p className="text-sm font-bold text-slate-800">No matching open materials found for &ldquo;{liveQuery}&rdquo;</p>
            <p className="text-xs text-slate-500">Try broader keywords like &ldquo;statistics&rdquo;, &ldquo;calculus&rdquo;, &ldquo;data structures&rdquo;, or &ldquo;neural networks&rdquo;.</p>
          </div>
        ) : (
          <div className="text-center py-8 bg-slate-50/70 border border-dashed border-slate-200 rounded-xl space-y-1.5">
            <span className="text-xl">📚</span>
            <p className="text-xs font-bold text-slate-800">Ready to explore global academic literature</p>
            <p className="text-[11px] text-slate-500 max-w-md mx-auto">
              Type any topic above or pick a suggested topic to search research preprints, free electronic books, and technology news that open directly within this UI.
            </p>
          </div>
        )}
      </div>

      {/* SECTION 2: Curated Departmental Hub */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
              <span>🏛️</span>
              <span>Curated Departmental Repositories</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Faculty-vetted official portals, open textbooks, and government statistical datasets.
            </p>
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            {[
              { code: 'CS', label: 'Computer Science' },
              { code: 'AI', label: 'Artificial Intelligence' },
              { code: 'NCC', label: 'Networking & Cloud' },
              { code: 'STA', label: 'Statistics' },
              { code: 'ACC', label: 'Accountancy' },
              { code: 'BA', label: 'Business Admin' },
            ].map((d) => (
              <button
                key={d.code}
                onClick={() => setDepartment(d.code)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer min-h-[36px] border ${
                  department === d.code
                    ? 'bg-emerald-900 text-white border-emerald-900 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {curatedLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
                <div className="h-4 w-16 bg-slate-200 rounded"></div>
                <div className="h-5 w-3/4 bg-slate-200 rounded"></div>
                <div className="h-3 w-full bg-slate-200 rounded"></div>
              </div>
            ))}
          </div>
        ) : curatedList.length === 0 ? (
          <p className="text-xs text-slate-500 italic py-4 text-center">
            No curated links configured for this department yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {curatedList.map((item, idx) => (
              <div
                key={idx}
                className="bg-slate-50/60 border border-slate-200 rounded-xl p-4 flex flex-col justify-between hover:bg-white hover:shadow-xs transition-all space-y-3"
              >
                <div className="space-y-1.5">
                  <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm bg-slate-200 text-slate-700">
                    {item.category}
                  </span>
                  <h3 className="text-sm font-bold text-slate-900 leading-snug">
                    {item.title}
                  </h3>
                  <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed">
                    {item.description}
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-slate-200/60">
                  <button
                    onClick={() => setActiveReaderItem({
                      id: `curated_${idx}`,
                      source: 'Curated Hub',
                      title: item.title,
                      description: item.description,
                      authors: item.provider,
                      category: item.category,
                      readerType: 'external',
                      readUrl: item.url,
                      externalUrl: item.url,
                    })}
                    className="flex-1 inline-flex items-center justify-center gap-1 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer min-h-[36px]"
                  >
                    <span>📖</span>
                    <span>Read in UI</span>
                  </button>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-lg text-xs transition-colors shrink-0"
                    title="Launch external portal in new tab"
                  >
                    <span>↗</span>
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* In-UI Universal Reader Modal (Opens on the same page without navigating away) */}
      <UniversalReaderModal
        isOpen={Boolean(activeReaderItem)}
        item={activeReaderItem}
        onClose={() => setActiveReaderItem(null)}
      />
    </div>
  );
};
