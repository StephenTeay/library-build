import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

interface CuratedResource {
  title: string;
  category: string;
  description: string;
  url: string;
}

interface ExternalSearchResult {
  source: 'arXiv' | 'GitHub';
  title: string;
  description: string;
  url: string;
  authorsOrOwner?: string;
}

export const OpenResources: React.FC = () => {
  const [department, setDepartment] = useState('CS');
  const [curatedList, setCuratedList] = useState<CuratedResource[]>([]);
  const [curatedLoading, setCuratedLoading] = useState(false);

  // Live Query State
  const [liveQuery, setLiveQuery] = useState('');
  const [liveResults, setLiveResults] = useState<ExternalSearchResult[]>([]);
  const [liveSearching, setLiveSearching] = useState(false);

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

  const handleLiveSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!liveQuery.trim()) return;

    setLiveSearching(true);
    try {
      const res = await api.get<{ results: ExternalSearchResult[] }>(`/aggregator/query?q=${encodeURIComponent(liveQuery)}`);
      setLiveResults(res.results || []);
    } catch (err) {
      console.warn('Live aggregator query failed', err);
    } finally {
      setLiveSearching(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header Banner */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-sm bg-slate-900 text-white tracking-widest uppercase">
            Global Research
          </span>
          <span className="text-xs text-slate-500 font-medium">Federal School of Statistics, Ibadan</span>
        </div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
          Open Academic Resources & Research Hub
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl">
          Zero-cost verified open datasets, scientific preprints from arXiv, open-source repositories from GitHub, and institutional statistics portals.
        </p>
      </div>

      {/* SECTION 1: Curated Departmental Hub */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              Curated Departmental Repositories
            </h2>
            <p className="text-xs text-slate-500">
              Faculty-vetted official portals, open textbooks, and government statistical datasets.
            </p>
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-1">
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
                    ? 'bg-emerald-900 text-white border-emerald-900'
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
                className="bg-slate-50/60 border border-slate-200 rounded-lg p-4 flex flex-col justify-between hover:bg-white hover:shadow-xs transition-all"
              >
                <div className="space-y-1.5 mb-3">
                  <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm bg-slate-200 text-slate-700">
                    {item.category}
                  </span>
                  <h3 className="text-sm font-bold text-slate-900 leading-snug">
                    {item.title}
                  </h3>
                  <p className="text-xs text-slate-600 line-clamp-3">
                    {item.description}
                  </p>
                </div>

                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 w-full py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 rounded-md text-xs font-semibold transition-colors min-h-[36px]"
                >
                  <span>Launch Portal</span>
                  <span>↗</span>
                </a>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTION 2: Live Academic Search (arXiv & GitHub) */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900">
            Live Research Search (arXiv & GitHub API)
          </h2>
          <p className="text-xs text-slate-500">
            Query preprints from arXiv and open-source scientific software from GitHub (with 15-minute server edge caching).
          </p>
        </div>

        <form onSubmit={handleLiveSearch} className="flex flex-col sm:flex-row gap-2.5">
          <input
            type="text"
            value={liveQuery}
            onChange={(e) => setLiveQuery(e.target.value)}
            placeholder="e.g. time series forecasting, neural networks, econometrics, linear regression..."
            className="flex-1 px-3.5 py-2.5 border border-slate-200 rounded-lg text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
          />
          <button
            type="submit"
            disabled={liveSearching}
            className="px-5 py-2.5 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg font-semibold text-xs sm:text-sm shadow-xs transition-colors shrink-0 min-h-[44px] cursor-pointer disabled:opacity-50"
          >
            {liveSearching ? 'Searching...' : 'Search Repositories'}
          </button>
        </form>

        {liveSearching ? (
          <div className="p-8 text-center animate-pulse space-y-2">
            <div className="h-5 w-48 bg-slate-200 rounded mx-auto"></div>
            <div className="h-4 w-64 bg-slate-200 rounded mx-auto"></div>
          </div>
        ) : liveResults.length > 0 ? (
          <div className="space-y-3 pt-2">
            {liveResults.map((r, idx) => (
              <div
                key={idx}
                className="p-4 rounded-lg border border-slate-200 bg-white hover:border-slate-300 transition-colors space-y-1.5"
              >
                <div className="flex justify-between items-center">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-sm uppercase tracking-wider border ${
                      r.source === 'arXiv'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                    }`}
                  >
                    {r.source}
                  </span>
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-emerald-900 hover:underline flex items-center gap-1"
                  >
                    <span>View Repository</span>
                    <span>↗</span>
                  </a>
                </div>

                <h3 className="text-sm font-bold text-slate-900">
                  {r.title}
                </h3>

                <p className="text-xs text-slate-600 leading-relaxed">
                  {r.description}
                </p>

                {r.authorsOrOwner && (
                  <div className="text-[11px] text-slate-400 font-medium">
                    Contributor: {r.authorsOrOwner}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500 text-center py-4 italic">
            Enter a topic keyword above to query arXiv papers and GitHub software.
          </p>
        )}
      </div>
    </div>
  );
};
