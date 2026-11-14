import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { LibraryItem } from '../types';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

export const PhysicalLibrary: React.FC = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('ALL');

  const canManageLibrary = user && ['LIBRARIAN', 'REGISTRAR', 'LIBRARY_STAFF'].includes(user.role);

  const fetchItems = async () => {
    setLoading(true);
    try {
      let url = `/library/search?q=${encodeURIComponent(query)}`;
      if (departmentFilter !== 'ALL') {
        url += `&dept=${departmentFilter}`;
      }
      const res = await api.get<{ items: LibraryItem[] }>(url);
      setItems(res.items || []);
    } catch (err) {
      console.warn('Failed to search library catalog', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, [departmentFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchItems();
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-sm bg-slate-900 text-white tracking-widest uppercase">
              OPAC System
            </span>
            <span className="text-xs text-slate-500 font-medium">Federal School of Statistics, Ibadan</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Central Physical Library Catalog
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl">
            Locate printed textbooks, monographs, statistical yearbooks, and check real-time shelf availability.
          </p>
        </div>

        {canManageLibrary && (
          <Link
            to="/admin/books/import"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg font-semibold text-xs sm:text-sm shadow-xs transition-colors self-start sm:self-auto min-h-[44px]"
          >
            <span>📚</span>
            <span>Import Books (CSV)</span>
          </Link>
        )}
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs">
        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 min-w-0">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title, author, call number, or subject..."
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
            />
          </div>

          <div className="sm:w-60">
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-xs sm:text-sm text-slate-800 bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
            >
              <option value="ALL">All Academic Disciplines</option>
              <option value="CS">Computer Science</option>
              <option value="AI">Artificial Intelligence</option>
              <option value="STA">Statistics & Demography</option>
              <option value="MTH">Mathematics</option>
              <option value="SLT">Science Laboratory Tech</option>
              <option value="ACC">Accountancy</option>
              <option value="BA">Business Administration</option>
            </select>
          </div>

          <button
            type="submit"
            className="px-5 py-2.5 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg font-semibold text-xs sm:text-sm shadow-xs transition-colors shrink-0 min-h-[44px] cursor-pointer"
          >
            Search Catalog
          </button>
        </form>
      </div>

      {/* Results Section */}
      {loading ? (
        /* Skeleton Loading Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs animate-pulse space-y-3">
              <div className="flex justify-between items-center">
                <div className="h-5 w-20 bg-slate-200 rounded-sm"></div>
                <div className="h-5 w-28 bg-slate-200 rounded-full"></div>
              </div>
              <div className="h-6 w-4/5 bg-slate-200 rounded-md"></div>
              <div className="h-4 w-1/2 bg-slate-200 rounded-md"></div>
              <div className="h-14 bg-slate-100 rounded-md"></div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-xl p-12 text-center">
          <div className="w-14 h-14 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-3 text-2xl">
            📖
          </div>
          <h3 className="text-base font-bold text-slate-900 mb-1">No Library Holdings Found</h3>
          <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto mb-4">
            No physical books matched your query. Try broadening your keywords or clearing the department filter.
          </p>
          <button
            onClick={() => {
              setQuery('');
              setDepartmentFilter('ALL');
            }}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => {
            const isAvailable = item.copies_available > 0;
            return (
              <div
                key={item.id}
                className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs hover:border-slate-300 hover:shadow-sm transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2.5">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-sm bg-slate-900 text-white tracking-wider">
                      {item.call_number || 'QA276 .A45'}
                    </span>
                    <span
                      className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1.5 tabular-nums ${
                        isAvailable
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-rose-50 text-rose-800 border border-rose-200'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${isAvailable ? 'bg-emerald-600' : 'bg-rose-600'}`}></span>
                      <span>
                        {item.copies_available} of {item.copies_total} Available
                      </span>
                    </span>
                  </div>

                  <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-snug mb-1">
                    {item.title}
                  </h3>

                  <p className="text-xs text-slate-600 mb-1">
                    <span className="font-semibold text-slate-700">Author:</span> {item.author}
                  </p>

                  {item.isbn && (
                    <p className="text-[11px] font-mono text-slate-400 mb-3">
                      ISBN: {item.isbn}
                    </p>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 bg-slate-50/70 -mx-5 -mb-5 p-3 rounded-b-xl flex items-center justify-between text-xs text-slate-600">
                  <div>
                    <span className="font-semibold text-slate-700">Shelf:</span>{' '}
                    <span>{item.shelf_location || 'Main Floor • Section A'}</span>
                  </div>
                  <span className="text-[11px] font-semibold text-emerald-900 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                    Central Library
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
