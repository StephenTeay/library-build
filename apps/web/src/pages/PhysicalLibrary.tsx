import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { LibraryItem, BookshelfItem } from '../types';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { CitationModal } from '../components/CitationModal';
import { CitationItem } from '../utils/citationFormatter';
import { BookModal } from '../components/BookModal';

interface LoanRecord {
  id: number;
  item_id: number;
  user_id: string;
  item_title?: string;
  title?: string;
  author?: string;
  call_number?: string;
  shelf_location?: string;
  student_name?: string;
  student_email?: string;
  student_matric?: string;
  borrowed_at: string;
  due_at: string;
  returned_at?: string;
  status: 'ACTIVE' | 'RETURNED' | 'OVERDUE' | 'LOST';
  renewal_count: number;
  is_overdue?: boolean;
}

interface HoldRecord {
  id: number;
  item_id: number;
  user_id: string;
  item_title?: string;
  title?: string;
  student_name?: string;
  student_matric?: string;
  status: 'PENDING' | 'READY_FOR_PICKUP' | 'FULFILLED' | 'CANCELLED';
  placed_at: string;
  expires_at?: string;
}

export const PhysicalLibrary: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'CATALOG' | 'CIRCULATION' | 'MY_LOANS' | 'BOOKSHELF' | 'ANALYTICS'>('CATALOG');

  // Catalog State
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [citationItem, setCitationItem] = useState<CitationItem | null>(null);
  const [showBookModal, setShowBookModal] = useState(false);
  const [bookToEdit, setBookToEdit] = useState<LibraryItem | null>(null);

  // Bookshelf State
  const [bookshelf, setBookshelf] = useState<BookshelfItem[]>([]);
  const [bookshelfLoading, setBookshelfLoading] = useState(false);
  const [bookshelfFilter, setBookshelfFilter] = useState<'ALL' | 'CURRENTLY_READING' | 'WANT_TO_READ' | 'FAVORITE' | 'FINISHED'>('ALL');
  const [savedItemIds, setSavedItemIds] = useState<Set<string>>(new Set());

  // Analytics State (Staff)
  const [analyticsSummary, setAnalyticsSummary] = useState<any>(null);
  const [unmetDemand, setUnmetDemand] = useState<any[]>([]);
  const [topSearches, setTopSearches] = useState<any[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // Circulation Desk State (Staff)
  const [deskLoans, setDeskLoans] = useState<LoanRecord[]>([]);
  const [deskHolds, setDeskHolds] = useState<HoldRecord[]>([]);
  const [deskLoading, setDeskLoading] = useState(false);
  const [checkoutItemId, setCheckoutItemId] = useState<number | ''>('');
  const [checkoutStudentIdentifier, setCheckoutStudentIdentifier] = useState('');
  const [checkoutDuration, setCheckoutDuration] = useState(14);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [deskStatusFilter, setDeskStatusFilter] = useState<'ACTIVE' | 'OVERDUE' | 'ALL'>('ACTIVE');

  // My Loans State (Student)
  const [myLoans, setMyLoans] = useState<LoanRecord[]>([]);
  const [myHolds, setMyHolds] = useState<HoldRecord[]>([]);
  const [myLoansLoading, setMyLoansLoading] = useState(false);

  // Action status message
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

      if (query.trim()) {
        api.post('/analytics/log-search', {
          query: query.trim(),
          scope: 'CATALOG',
          results_count: (res.items || []).length,
        }).catch(() => { });
      }
    } catch (err) {
      console.warn('Failed to search library catalog', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchBookshelf = async () => {
    if (!user) return;
    setBookshelfLoading(true);
    try {
      const res = await api.get<{ bookshelf: BookshelfItem[] }>('/bookshelf');
      setBookshelf(res.bookshelf || []);
      const ids = new Set<string>((res.bookshelf || []).map((b) => String(b.item_id)));
      setSavedItemIds(ids);
    } catch (err) {
      console.warn('Failed to fetch bookshelf', err);
    } finally {
      setBookshelfLoading(false);
    }
  };

  const fetchAnalytics = async () => {
    if (!canManageLibrary) return;
    setAnalyticsLoading(true);
    try {
      const [sumRes, demandRes] = await Promise.all([
        api.get<any>('/analytics/summary'),
        api.get<any>('/analytics/search-demand'),
      ]);
      setAnalyticsSummary(sumRes);
      setUnmetDemand(demandRes.unmetDemand || []);
      setTopSearches(demandRes.topSearches || []);
    } catch (err) {
      console.warn('Failed to fetch analytics', err);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const handleSaveToShelf = async (itemType: 'BOOK' | 'RESOURCE' | 'THESIS', itemId: string, title?: string) => {
    if (!user) {
      setActionMessage({ type: 'error', text: 'Please sign in to save items to your personal bookshelf.' });
      return;
    }
    try {
      await api.post('/bookshelf', {
        item_type: itemType,
        item_id: itemId,
        shelf_status: 'WANT_TO_READ',
      });
      setSavedItemIds((prev) => new Set(prev).add(itemId));
      setActionMessage({ type: 'success', text: `Saved "${title || 'Item'}" to your bookshelf.` });
      fetchBookshelf();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Failed to save to bookshelf.' });
    }
  };

  const handleRemoveFromShelf = async (shelfId: string) => {
    try {
      await api.delete(`/bookshelf/${shelfId}`);
      setActionMessage({ type: 'success', text: 'Item removed from bookshelf.' });
      fetchBookshelf();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Failed to remove from bookshelf.' });
    }
  };

  const handleUpdateShelfStatus = async (item: BookshelfItem, newStatus: any) => {
    try {
      await api.post('/bookshelf', {
        item_type: item.item_type,
        item_id: item.item_id,
        shelf_status: newStatus,
      });
      setActionMessage({ type: 'success', text: `Moved to ${newStatus.replace(/_/g, ' ')}.` });
      fetchBookshelf();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Failed to update shelf status.' });
    }
  };

  const fetchDeskData = async () => {
    if (!canManageLibrary) return;
    setDeskLoading(true);
    try {
      const [loansRes, holdsRes] = await Promise.all([
        api.get<{ loans: LoanRecord[] }>(`/circulation/desk/loans?status=${deskStatusFilter}`),
        api.get<{ holds: HoldRecord[] }>('/circulation/desk/holds'),
      ]);
      setDeskLoans(loansRes.loans || []);
      setDeskHolds(holdsRes.holds || []);
    } catch (err) {
      console.warn('Failed to fetch circulation desk data', err);
    } finally {
      setDeskLoading(false);
    }
  };

  const fetchMyLoans = async () => {
    setMyLoansLoading(true);
    try {
      const res = await api.get<{ loans: LoanRecord[]; holds: HoldRecord[] }>('/circulation/my-loans');
      setMyLoans(res.loans || []);
      setMyHolds(res.holds || []);
    } catch (err) {
      console.warn('Failed to fetch personal loans', err);
    } finally {
      setMyLoansLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
    if (user) {
      fetchBookshelf();
    }
  }, [departmentFilter]);

  useEffect(() => {
    if (activeTab === 'CIRCULATION') {
      fetchDeskData();
    } else if (activeTab === 'MY_LOANS') {
      fetchMyLoans();
    } else if (activeTab === 'BOOKSHELF') {
      fetchBookshelf();
    } else if (activeTab === 'ANALYTICS') {
      fetchAnalytics();
    }
  }, [activeTab, deskStatusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchItems();
  };

  const handleDeskCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkoutItemId || !checkoutStudentIdentifier.trim()) {
      setActionMessage({ type: 'error', text: 'Select a book and provide student matric or email.' });
      return;
    }

    setCheckoutLoading(true);
    setActionMessage(null);
    try {
      const res = await api.post<{ message: string }>('/circulation/checkout', {
        item_id: Number(checkoutItemId),
        student_matric_or_email: checkoutStudentIdentifier.trim(),
        duration_days: checkoutDuration,
      });
      setActionMessage({ type: 'success', text: res.message });
      setCheckoutStudentIdentifier('');
      fetchDeskData();
      fetchItems();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Checkout failed' });
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleCheckin = async (loanId: number) => {
    try {
      const res = await api.post<{ message: string }>(`/circulation/checkin/${loanId}`);
      setActionMessage({ type: 'success', text: res.message });
      fetchDeskData();
      fetchItems();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Return failed' });
    }
  };

  const handleRenew = async (loanId: number) => {
    try {
      const res = await api.post<{ message: string }>(`/circulation/renew/${loanId}`);
      setActionMessage({ type: 'success', text: res.message });
      if (activeTab === 'MY_LOANS') fetchMyLoans();
      if (activeTab === 'CIRCULATION') fetchDeskData();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Renewal failed' });
    }
  };

  const handlePlaceHold = async (itemId: number) => {
    try {
      const res = await api.post<{ message: string }>('/circulation/holds', { item_id: itemId });
      setActionMessage({ type: 'success', text: res.message });
      fetchItems();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Could not place hold' });
    }
  };

  const handleDeleteBook = async (id: number, title: string) => {
    if (!window.confirm(`Are you sure you want to delete "${title}" from the catalog?`)) return;
    try {
      await api.delete(`/library/items/${id}`);
      setActionMessage({ type: 'success', text: `"${title}" was deleted successfully.` });
      fetchItems();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Failed to delete book' });
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-sm bg-slate-900 text-white tracking-widest uppercase">
              ILS & Circulation Desk
            </span>
            <span className="text-xs text-slate-500 font-medium">Federal School of Statistics, Ibadan</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Central Library & Circulation System
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl">
            Locate physical holdings, issue textbooks, place holds, manage student loans, and check real-time availability.
          </p>
        </div>

        {canManageLibrary && (
          <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
            <button
              onClick={() => {
                setBookToEdit(null);
                setShowBookModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg font-semibold text-xs sm:text-sm shadow-xs transition-colors min-h-[44px] cursor-pointer"
            >
              <span>➕</span>
              <span>Add Book</span>
            </button>
            <Link
              to="/admin/books/import"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg font-semibold text-xs sm:text-sm shadow-xs transition-colors min-h-[44px]"
            >
              <span>📚</span>
              <span>Import Books (CSV)</span>
            </Link>
          </div>
        )}
      </div>

      {/* Action Notification Alert */}
      {actionMessage && (
        <div
          className={`p-3.5 rounded-lg border text-xs sm:text-sm font-semibold flex items-center justify-between ${actionMessage.type === 'success'
            ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
            : 'bg-rose-50 text-rose-900 border-rose-200'
            }`}
        >
          <div className="flex items-center gap-2">
            <span>{actionMessage.type === 'success' ? '✓' : '⚠️'}</span>
            <span>{actionMessage.text}</span>
          </div>
          <button onClick={() => setActionMessage(null)} className="text-slate-400 hover:text-slate-600 font-bold p-1">
            ✕
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex gap-2 border-b border-slate-200 overflow-x-auto pb-px">
        <button
          onClick={() => setActiveTab('CATALOG')}
          className={`px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${activeTab === 'CATALOG'
            ? 'border-emerald-900 text-emerald-950'
            : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
        >
          🔍 Catalog Search
        </button>

        {canManageLibrary && (
          <button
            onClick={() => setActiveTab('CIRCULATION')}
            className={`px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${activeTab === 'CIRCULATION'
              ? 'border-emerald-900 text-emerald-950'
              : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
          >
            <span>📋</span>
            <span>Circulation Desk</span>
            {deskLoans.some((l) => l.is_overdue) && (
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
            )}
          </button>
        )}

        <button
          onClick={() => setActiveTab('MY_LOANS')}
          className={`px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${activeTab === 'MY_LOANS'
            ? 'border-emerald-900 text-emerald-950'
            : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
        >
          <span>🏷️</span>
          <span>My Borrowed Books</span>
          {myLoans.length > 0 && (
            <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-full">
              {myLoans.filter((l) => l.status === 'ACTIVE').length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('BOOKSHELF')}
          className={`px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${activeTab === 'BOOKSHELF'
            ? 'border-emerald-900 text-emerald-950'
            : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
        >
          <span>📌</span>
          <span>My Bookshelf</span>
          {bookshelf.length > 0 && (
            <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-full">
              {bookshelf.length}
            </span>
          )}
        </button>

        {canManageLibrary && (
          <button
            onClick={() => setActiveTab('ANALYTICS')}
            className={`px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${activeTab === 'ANALYTICS'
              ? 'border-emerald-900 text-emerald-950'
              : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
          >
            <span>📊</span>
            <span>Analytics & Demand</span>
            {unmetDemand.length > 0 && (
              <span className="px-1.5 py-0.2 bg-amber-100 text-amber-800 text-[10px] font-bold rounded-full">
                {unmetDemand.length} Unmet
              </span>
            )}
          </button>
        )}
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: CATALOG SEARCH */}
      {/* ========================================================================= */}
      {activeTab === 'CATALOG' && (
        <div className="space-y-6">
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

          {/* Results Grid */}
          {loading ? (
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
                No physical items matched your search query or department filter.
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
                          className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1.5 tabular-nums ${isAvailable
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

                    <div className="mt-4 pt-3 border-t border-slate-100 bg-slate-50/70 -mx-5 -mb-5 p-3 rounded-b-xl space-y-2">
                      <div className="flex items-center justify-between text-xs text-slate-600">
                        <div>
                          <span className="font-semibold text-slate-700">Shelf:</span>{' '}
                          <span>{item.shelf_location || 'Main Floor • Section A'}</span>
                        </div>
                        <span className="text-[11px] font-semibold text-emerald-900 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                          Central Library
                        </span>
                      </div>

                      {/* Card Action Buttons */}
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/60">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            onClick={() =>
                              setCitationItem({
                                title: item.title,
                                author: item.author,
                                isbn: item.isbn || undefined,
                                courseCode: item.call_number,
                                institution: 'Central Library, Federal School of Statistics, Ibadan',
                              })
                            }
                            className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 rounded border border-slate-200 text-xs font-semibold flex items-center gap-1 transition-colors"
                            title="Generate academic citation"
                          >
                            <span>📜</span>
                            <span>Cite</span>
                          </button>

                          <button
                            onClick={() => handleSaveToShelf('BOOK', String(item.id), item.title)}
                            className={`px-2.5 py-1 rounded border text-xs font-semibold flex items-center gap-1 transition-colors ${savedItemIds.has(String(item.id))
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                              }`}
                            title="Save to My Bookshelf"
                          >
                            <span>📌</span>
                            <span>{savedItemIds.has(String(item.id)) ? 'Saved' : 'Save'}</span>
                          </button>

                          {canManageLibrary && (
                            <>
                              <button
                                onClick={() => {
                                  setBookToEdit(item);
                                  setShowBookModal(true);
                                }}
                                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-semibold transition-colors"
                                title="Edit book details and shelf location"
                              >
                                ✏️ Edit
                              </button>
                              <button
                                onClick={() => handleDeleteBook(item.id, item.title)}
                                className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded text-xs font-semibold transition-colors"
                                title="Delete book record"
                              >
                                🗑️
                              </button>
                            </>
                          )}
                        </div>

                        {isAvailable ? (
                          canManageLibrary ? (
                            <button
                              onClick={() => {
                                setCheckoutItemId(item.id);
                                setActiveTab('CIRCULATION');
                              }}
                              className="px-2.5 py-1 bg-emerald-900 hover:bg-emerald-800 text-white rounded text-xs font-semibold transition-colors flex items-center gap-1 shadow-xs"
                            >
                              <span>📋</span>
                              <span>Issue at Desk</span>
                            </button>
                          ) : (
                            <span className="text-[11px] text-emerald-800 font-semibold bg-emerald-50 px-2 py-1 rounded">
                              ✓ Available at Desk
                            </span>
                          )
                        ) : (
                          <button
                            onClick={() => handlePlaceHold(item.id)}
                            className="px-2.5 py-1 bg-amber-800 hover:bg-amber-700 text-white rounded text-xs font-semibold transition-colors flex items-center gap-1 shadow-xs"
                          >
                            <span>⏳</span>
                            <span>Place Hold</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: STAFF CIRCULATION DESK */}
      {/* ========================================================================= */}
      {activeTab === 'CIRCULATION' && canManageLibrary && (
        <div className="space-y-6">
          {/* Quick Issue / Checkout Box */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
            <h2 className="text-base font-bold text-slate-900 mb-1 flex items-center gap-2">
              <span>⚡</span>
              <span>Circulation Desk: Fast Checkout</span>
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Issue physical textbooks to registered ND/HND students using their matriculation number or email.
            </p>

            <form onSubmit={handleDeskCheckout} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Book Selection
                </label>
                <select
                  value={checkoutItemId}
                  onChange={(e) => setCheckoutItemId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-800 bg-white"
                  required
                >
                  <option value="">-- Choose Book from Catalog --</option>
                  {items.map((b) => (
                    <option key={b.id} value={b.id} disabled={b.copies_available <= 0}>
                      {b.title} ({b.call_number}) - [{b.copies_available} left]
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Student Matric or Email
                </label>
                <input
                  type="text"
                  value={checkoutStudentIdentifier}
                  onChange={(e) => setCheckoutStudentIdentifier(e.target.value)}
                  placeholder="e.g. FSS/ND/2025/001 or email"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-900"
                  required
                />
              </div>

              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Loan Duration
                  </label>
                  <select
                    value={checkoutDuration}
                    onChange={(e) => setCheckoutDuration(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-800 bg-white"
                  >
                    <option value={7}>7 Days (Standard)</option>
                    <option value={14}>14 Days (Two Weeks)</option>
                    <option value={30}>30 Days (Extended)</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={checkoutLoading}
                  className="px-5 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg font-bold text-xs shadow-xs transition-colors shrink-0 min-h-[38px] cursor-pointer"
                >
                  {checkoutLoading ? 'Issuing...' : 'Issue Book'}
                </button>
              </div>
            </form>
          </div>

          {/* Active Loans Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900">
                  Active Loans & Returns Ledger
                </h3>
                <p className="text-xs text-slate-500">
                  Track due dates, identify overdue copies, and process book check-ins.
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setDeskStatusFilter('ACTIVE')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${deskStatusFilter === 'ACTIVE'
                    ? 'bg-emerald-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                >
                  Active Only
                </button>
                <button
                  onClick={() => setDeskStatusFilter('OVERDUE')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${deskStatusFilter === 'OVERDUE'
                    ? 'bg-rose-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                >
                  Overdue
                </button>
                <button
                  onClick={() => setDeskStatusFilter('ALL')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${deskStatusFilter === 'ALL'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                >
                  All Records
                </button>
              </div>
            </div>

            {deskLoading ? (
              <div className="p-8 text-center text-xs text-slate-500">Loading circulation ledger...</div>
            ) : deskLoans.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">No circulation loan records found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold uppercase text-[10px]">
                      <th className="p-3">Book Title / Call No</th>
                      <th className="p-3">Borrower Student</th>
                      <th className="p-3">Borrowed On</th>
                      <th className="p-3">Due Date</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Desk Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {deskLoans.map((l) => (
                      <tr key={l.id} className="hover:bg-slate-50/60">
                        <td className="p-3 font-semibold text-slate-900 max-w-xs">
                          <p className="truncate">{l.item_title}</p>
                          <span className="font-mono text-[10px] text-slate-400">{l.call_number}</span>
                        </td>
                        <td className="p-3 text-slate-800">
                          <p className="font-semibold">{l.student_name}</p>
                          <span className="font-mono text-[10px] text-slate-500">{l.student_matric || l.student_email}</span>
                        </td>
                        <td className="p-3 text-slate-600">
                          {new Date(l.borrowed_at).toLocaleDateString()}
                        </td>
                        <td className="p-3">
                          <span className={`font-semibold ${l.is_overdue ? 'text-rose-700 font-bold' : 'text-slate-800'}`}>
                            {new Date(l.due_at).toLocaleDateString()}
                          </span>
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${l.status === 'RETURNED'
                              ? 'bg-slate-100 text-slate-600'
                              : l.is_overdue
                                ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                : 'bg-emerald-100 text-emerald-800'
                              }`}
                          >
                            {l.is_overdue ? 'OVERDUE' : l.status}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          {l.status === 'ACTIVE' && (
                            <button
                              onClick={() => handleCheckin(l.id)}
                              className="px-3 py-1 bg-emerald-900 hover:bg-emerald-800 text-white rounded text-xs font-semibold transition-colors"
                            >
                              Check In (Return)
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Holds Queue Box */}
          {deskHolds.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <div className="p-4 border-b border-slate-200 bg-amber-50/50">
                <h3 className="text-sm font-bold text-amber-950 flex items-center gap-1.5">
                  <span>⏳</span>
                  <span>Active Holds & Reservation Queue ({deskHolds.length})</span>
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <tbody className="divide-y divide-slate-100">
                    {deskHolds.map((h) => (
                      <tr key={h.id} className="p-3 flex items-center justify-between">
                        <td className="p-3">
                          <p className="font-bold text-slate-900">{h.item_title}</p>
                          <span className="text-slate-500">Waiting: {h.student_name} ({h.student_matric})</span>
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-900 rounded font-bold text-[10px]">
                            {h.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: STUDENT MY BORROWED BOOKS */}
      {/* ========================================================================= */}
      {activeTab === 'MY_LOANS' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
            <h2 className="text-base font-bold text-slate-900 mb-1">
              My Borrowed Books & Active Holds
            </h2>
            <p className="text-xs text-slate-500">
              Keep track of return deadlines, request loan extensions, and review hold pickup status.
            </p>
          </div>

          {myLoansLoading ? (
            <div className="p-8 text-center text-xs text-slate-500">Loading borrowed books...</div>
          ) : myLoans.length === 0 && myHolds.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-xl p-12 text-center">
              <span className="text-3xl mb-2 block">📚</span>
              <h3 className="text-sm font-bold text-slate-800">No Active Loans</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                You do not currently have any physical library textbooks checked out. Browse the catalog to borrow books.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {myLoans.map((loan) => {
                const isOverdue = loan.status === 'ACTIVE' && new Date(loan.due_at) < new Date();
                return (
                  <div
                    key={loan.id}
                    className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold px-2 py-0.5 bg-slate-900 text-white rounded">
                          {loan.call_number || 'QA273 .M55'}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${loan.status === 'RETURNED'
                            ? 'bg-slate-100 text-slate-600'
                            : isOverdue
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : 'bg-emerald-100 text-emerald-800'
                            }`}
                        >
                          {isOverdue ? 'OVERDUE' : loan.status}
                        </span>
                      </div>
                      <h3 className="text-sm sm:text-base font-bold text-slate-900">{loan.title}</h3>
                      <p className="text-xs text-slate-600">Author: {loan.author}</p>
                      <p className="text-xs text-slate-500">
                        Borrowed: {new Date(loan.borrowed_at).toLocaleDateString()} • Due:{' '}
                        <strong className={isOverdue ? 'text-rose-700' : 'text-slate-800'}>
                          {new Date(loan.due_at).toLocaleDateString()}
                        </strong>
                      </p>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-auto">
                      {loan.status === 'ACTIVE' && (
                        <button
                          onClick={() => handleRenew(loan.id)}
                          disabled={loan.renewal_count >= 2}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-800 rounded-md text-xs font-semibold border border-slate-300 transition-colors"
                        >
                          {loan.renewal_count >= 2 ? 'Max Renewals' : `Renew (+7 Days)`}
                        </button>
                      )}

                      <button
                        onClick={() =>
                          setCitationItem({
                            title: loan.title || 'Book',
                            author: loan.author,
                            courseCode: loan.call_number,
                            institution: 'Central Library, Federal School of Statistics, Ibadan',
                          })
                        }
                        className="px-2.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 rounded-md text-xs font-semibold border border-slate-200 transition-colors"
                      >
                        Cite
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: PATRON BOOKSHELF */}
      {/* ========================================================================= */}
      {activeTab === 'BOOKSHELF' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">Personal Bookshelf & Reading Ledger</h2>
              <p className="text-xs text-slate-500">
                Organize your course readings, research theses, and library textbooks in one central place.
              </p>
            </div>
            {/* Shelf Filter */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {(['ALL', 'CURRENTLY_READING', 'WANT_TO_READ', 'FAVORITE', 'FINISHED'] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => setBookshelfFilter(status)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${bookshelfFilter === status
                    ? 'bg-emerald-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                >
                  {status === 'ALL' ? 'All Items' : status.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>

          {bookshelfLoading ? (
            <div className="py-12 text-center text-slate-400 font-semibold text-xs sm:text-sm">
              Loading your saved bookshelf...
            </div>
          ) : bookshelf.filter((b) => bookshelfFilter === 'ALL' || b.shelf_status === bookshelfFilter).length === 0 ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-xl p-10 text-center">
              <div className="text-3xl mb-2">📌</div>
              <h3 className="text-base font-bold text-slate-900 mb-1">Your Bookshelf is Empty</h3>
              <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto mb-4">
                Save physical books from the catalog, reading materials from your courses, or research projects from the repository.
              </p>
              <button
                onClick={() => setActiveTab('CATALOG')}
                className="px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold"
              >
                Explore Catalog
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {bookshelf
                .filter((b) => bookshelfFilter === 'ALL' || b.shelf_status === bookshelfFilter)
                .map((item) => (
                  <div
                    key={item.id}
                    className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-colors"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                          {item.item_type}
                        </span>
                        <select
                          value={item.shelf_status}
                          onChange={(e) => handleUpdateShelfStatus(item, e.target.value)}
                          className="text-[11px] font-semibold bg-emerald-50 text-emerald-900 border border-emerald-200 rounded px-2 py-0.5 focus:outline-none"
                        >
                          <option value="WANT_TO_READ">Want to Read</option>
                          <option value="CURRENTLY_READING">Currently Reading</option>
                          <option value="FAVORITE">Favorite</option>
                          <option value="FINISHED">Finished</option>
                        </select>
                      </div>

                      <h3 className="text-sm sm:text-base font-bold text-slate-900 line-clamp-2 mb-1">
                        {item.title || 'Untitled Item'}
                      </h3>
                      <p className="text-xs text-slate-600 mb-1">
                        <span className="font-semibold text-slate-700">By:</span> {item.author_or_creator}
                      </p>
                      {item.call_number && (
                        <p className="text-[11px] font-mono text-emerald-800 bg-emerald-50/70 inline-block px-1.5 py-0.5 rounded mb-2">
                          {item.call_number}
                        </p>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                      <button
                        onClick={() =>
                          setCitationItem({
                            title: item.title || 'Academic Item',
                            author: item.author_or_creator,
                            courseCode: item.call_number,
                            institution: 'Central Library, Federal School of Statistics, Ibadan',
                          })
                        }
                        className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 rounded border border-slate-200 text-xs font-semibold transition-colors flex items-center gap-1"
                      >
                        <span>📜</span>
                        <span>Cite</span>
                      </button>

                      <button
                        onClick={() => handleRemoveFromShelf(item.id)}
                        className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded text-xs font-semibold transition-colors flex items-center gap-1"
                      >
                        <span>🗑️</span>
                        <span>Remove</span>
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: STAFF ANALYTICS & UNMET DEMAND */}
      {/* ========================================================================= */}
      {activeTab === 'ANALYTICS' && canManageLibrary && (
        <div className="space-y-6">
          {analyticsLoading ? (
            <div className="py-12 text-center text-slate-400 font-semibold text-xs sm:text-sm">
              Aggregating library metrics and zero-result search queries...
            </div>
          ) : (
            <>
              {/* Top Metric Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Physical Catalog</span>
                  <div className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-1">
                    {analyticsSummary?.physicalCatalog?.total_titles || 0}
                  </div>
                  <span className="text-[11px] text-slate-500">
                    {analyticsSummary?.physicalCatalog?.total_volumes || 0} volumes ({analyticsSummary?.physicalCatalog?.available_volumes || 0} on shelves)
                  </span>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Digital Collection</span>
                  <div className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-1">
                    {analyticsSummary?.digitalResources?.total_digital_resources || 0}
                  </div>
                  <span className="text-[11px] text-slate-500">
                    Across {analyticsSummary?.digitalResources?.courses_with_materials || 0} course modules
                  </span>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Theses Repository</span>
                  <div className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-1">
                    {analyticsSummary?.thesesRepository?.total_theses_published || 0}
                  </div>
                  <span className="text-[11px] text-slate-500">
                    {analyticsSummary?.thesesRepository?.nd_projects || 0} ND • {analyticsSummary?.thesesRepository?.hnd_theses || 0} HND
                  </span>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Circulation Desk</span>
                  <div className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-1">
                    {analyticsSummary?.circulation?.active_loans || 0}
                  </div>
                  <span className="text-[11px] text-rose-600 font-semibold">
                    {analyticsSummary?.circulation?.overdue_loans || 0} overdue • {analyticsSummary?.circulation?.active_holds || 0} holds
                  </span>
                </div>
              </div>

              {/* Unmet Demand Report (Zero-Result Searches) */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3 mb-4">
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                      <span>🎯</span>
                      <span>Unmet Student Demand (Zero-Hit Catalog Searches)</span>
                    </h3>
                    <p className="text-xs text-slate-500">
                      Search terms entered by students that yielded 0 catalog results. Use this priority list for new acquisitions.
                    </p>
                  </div>
                  <span className="font-mono text-xs font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-sm border border-amber-200 self-start sm:self-auto">
                    {unmetDemand.length} Unmet Queries Tracked
                  </span>
                </div>

                {unmetDemand.length === 0 ? (
                  <p className="text-xs text-slate-500 py-6 text-center">
                    No zero-result searches recorded yet. Student searches are matching existing holdings.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-600">
                      <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase border-y border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3">Search Term</th>
                          <th className="py-2.5 px-3">Scope</th>
                          <th className="py-2.5 px-3 text-center">Attempts</th>
                          <th className="py-2.5 px-3">Last Searched</th>
                          <th className="py-2.5 px-3 text-right">Recommended Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {unmetDemand.map((q, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/70">
                            <td className="py-2.5 px-3 font-semibold text-slate-900">"{q.query_text}"</td>
                            <td className="py-2.5 px-3 font-mono text-[10px]">{q.search_scope}</td>
                            <td className="py-2.5 px-3 text-center">
                              <span className="font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full">
                                {q.frequency}x
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                              {new Date(q.last_searched).toLocaleDateString()}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                Acquisition Candidate
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Popular Titles Borrowed */}
              {analyticsSummary?.topBorrowed && analyticsSummary.topBorrowed.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 mb-3 flex items-center gap-2">
                    <span>🔥</span>
                    <span>Most Circulated Physical Books</span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {analyticsSummary.topBorrowed.map((b: any) => (
                      <div key={b.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                        <div>
                          <h4 className="text-xs font-bold text-slate-900 line-clamp-1">{b.title}</h4>
                          <p className="text-[11px] text-slate-500">{b.author}</p>
                          <span className="text-[10px] font-mono text-slate-400">{b.call_number}</span>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-sm font-extrabold text-emerald-900">{b.checkout_count}</span>
                          <span className="text-[10px] text-slate-500 block">loans</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Citation Modal */}
      <CitationModal
        isOpen={Boolean(citationItem)}
        item={citationItem}
        onClose={() => setCitationItem(null)}
      />

      {/* Add / Edit Book Modal */}
      <BookModal
        isOpen={showBookModal}
        onClose={() => {
          setShowBookModal(false);
          setBookToEdit(null);
        }}
        onSuccess={fetchItems}
        bookToEdit={bookToEdit}
      />
    </div>
  );
};
