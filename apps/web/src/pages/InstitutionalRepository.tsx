import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { ReaderModal } from '../components/ReaderModal';
import { CitationModal } from '../components/CitationModal';
import { CitationItem } from '../utils/citationFormatter';
import { LearningResource } from '../types';

interface StudentAuthor {
  matric_no?: string;
  full_name: string;
  email?: string;
}

interface ThesisItem {
  id: string;
  title: string;
  abstract: string;
  department_id: number;
  department_name?: string;
  department_code?: string;
  programme: 'ND' | 'HND';
  academic_session: string;
  student_authors: StudentAuthor[] | string;
  supervisor_name: string;
  keywords: string[];
  manuscript_r2_key: string;
  dataset_r2_key?: string | null;
  code_repo_url?: string | null;
  file_size_bytes?: number | null;
  status: 'SUBMITTED' | 'SUPERVISOR_APPROVED' | 'PUBLISHED' | 'REJECTED';
  review_notes?: string | null;
  published_at?: string | null;
  created_at: string;
}

export const InstitutionalRepository: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'DISCOVERY' | 'SUBMIT' | 'REVIEW' | 'MY_SUBMISSIONS'>('DISCOVERY');

  // Discovery State
  const [theses, setTheses] = useState<ThesisItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [programmeFilter, setProgrammeFilter] = useState('ALL');
  const [sessionFilter, setSessionFilter] = useState('ALL');

  // Review Queue State (HOD / Librarian)
  const [reviewQueue, setReviewQueue] = useState<ThesisItem[]>([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewNotesMap, setReviewNotesMap] = useState<Record<string, string>>({});

  // My Submissions State
  const [mySubmissions, setMySubmissions] = useState<ThesisItem[]>([]);
  const [mySubmissionsLoading, setMySubmissionsLoading] = useState(false);

  // Reader & Citation Modals State
  const [readingResource, setReadingResource] = useState<LearningResource | null>(null);
  const [citationItem, setCitationItem] = useState<CitationItem | null>(null);

  // Submit Form State
  const [submitTitle, setSubmitTitle] = useState('');
  const [submitAbstract, setSubmitAbstract] = useState('');
  const [submitDeptId, setSubmitDeptId] = useState<number>(user?.department_id || 1);
  const [submitProgramme, setSubmitProgramme] = useState<'ND' | 'HND'>('ND');
  const [submitSession, setSubmitSession] = useState('2024/2025');
  const [submitSupervisor, setSubmitSupervisor] = useState('');
  const [submitKeywords, setSubmitKeywords] = useState('');
  const [submitCodeRepo, setSubmitCodeRepo] = useState('');
  const [submitFile, setSubmitFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitStatusMsg, setSubmitStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const canReview = user && ['LIBRARIAN', 'REGISTRAR', 'HOD'].includes(user.role);

  const fetchTheses = async () => {
    setLoading(true);
    try {
      let url = `/theses?q=${encodeURIComponent(searchQuery)}`;
      if (deptFilter !== 'ALL') url += `&dept=${deptFilter}`;
      if (programmeFilter !== 'ALL') url += `&programme=${programmeFilter}`;
      if (sessionFilter !== 'ALL') url += `&session=${sessionFilter}`;

      const res = await api.get<{ theses: ThesisItem[] }>(url);
      setTheses(res.theses || []);
    } catch (err) {
      console.warn('Failed to load published theses', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchReviewQueue = async () => {
    if (!canReview) return;
    setReviewLoading(true);
    try {
      const res = await api.get<{ queue: ThesisItem[] }>('/theses/queue/review');
      setReviewQueue(res.queue || []);
    } catch (err) {
      console.warn('Failed to load review queue', err);
    } finally {
      setReviewLoading(false);
    }
  };

  const fetchMySubmissions = async () => {
    setMySubmissionsLoading(true);
    try {
      const res = await api.get<{ submissions: ThesisItem[] }>('/theses/my/submissions');
      setMySubmissions(res.submissions || []);
    } catch (err) {
      console.warn('Failed to load student submissions', err);
    } finally {
      setMySubmissionsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'DISCOVERY') fetchTheses();
    else if (activeTab === 'REVIEW') fetchReviewQueue();
    else if (activeTab === 'MY_SUBMISSIONS') fetchMySubmissions();
  }, [activeTab, deptFilter, programmeFilter, sessionFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchTheses();
  };

  const handleSubmitThesis = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!submitFile || !submitTitle.trim() || !submitAbstract.trim() || !submitSupervisor.trim()) {
      setSubmitStatusMsg({ type: 'error', text: 'Please complete all required fields and attach your manuscript PDF.' });
      return;
    }

    setSubmitting(true);
    setSubmitStatusMsg(null);
    try {
      // 1. Request presigned upload
      const presignRes = await api.post<{ r2Key: string; uploadUrl: string }>('/theses/presign-upload', {
        filename: submitFile.name,
        size_bytes: submitFile.size,
        mime_type: submitFile.type || 'application/pdf',
      });

      // 2. Direct PUT upload
      const uploadHttp = await fetch(presignRes.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': submitFile.type || 'application/pdf' },
        body: submitFile,
      });

      if (!uploadHttp.ok) {
        throw new Error(`Upload failed with status ${uploadHttp.status}`);
      }

      // 3. Submit thesis record
      const authors: StudentAuthor[] = [
        {
          full_name: user?.full_name || 'Student Author',
          matric_no: user?.matric_no || undefined,
          email: user?.email,
        },
      ];

      const res = await api.post<{ message: string; thesis: ThesisItem }>('/theses/submit', {
        title: submitTitle.trim(),
        abstract: submitAbstract.trim(),
        department_id: submitDeptId,
        programme: submitProgramme,
        academic_session: submitSession,
        student_authors: authors,
        supervisor_name: submitSupervisor.trim(),
        keywords: submitKeywords ? submitKeywords.split(',').map((k) => k.trim()) : [],
        manuscript_r2_key: presignRes.r2Key,
        code_repo_url: submitCodeRepo.trim() || undefined,
      });

      setSubmitStatusMsg({ type: 'success', text: res.message });
      setSubmitTitle('');
      setSubmitAbstract('');
      setSubmitSupervisor('');
      setSubmitKeywords('');
      setSubmitCodeRepo('');
      setSubmitFile(null);
      setActiveTab('MY_SUBMISSIONS');
    } catch (err: any) {
      setSubmitStatusMsg({ type: 'error', text: err.message || 'Submission failed.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleReviewAction = async (thesisId: string, action: 'APPROVE' | 'REJECT') => {
    try {
      const notes = reviewNotesMap[thesisId] || '';
      await api.post(`/theses/${thesisId}/review`, { action, review_notes: notes });
      fetchReviewQueue();
    } catch (err: any) {
      alert(err.message || 'Review action failed.');
    }
  };

  const parseAuthors = (authors: StudentAuthor[] | string): StudentAuthor[] => {
    if (Array.isArray(authors)) return authors;
    try {
      return JSON.parse(authors);
    } catch {
      return [{ full_name: String(authors) }];
    }
  };

  const openReader = (t: ThesisItem) => {
    setReadingResource({
      id: t.id,
      course_id: 0,
      title: t.title,
      description: t.abstract,
      resource_type: 'DOCUMENT',
      visibility: 'PUBLIC',
      r2_key: t.manuscript_r2_key,
      size_bytes: t.file_size_bytes,
      mime_type: 'application/pdf',
      created_at: t.created_at,
    });
  };

  const openCitation = (t: ThesisItem) => {
    const authors = parseAuthors(t.student_authors);
    setCitationItem({
      title: t.title,
      author: authors.map((a) => a.full_name).join(', '),
      year: t.academic_session.split('/')[0] || new Date().getFullYear(),
      institution: `Federal School of Statistics, Ibadan (${t.programme} Capstone Project)`,
      url: window.location.href,
    });
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-sm bg-slate-900 text-white tracking-widest uppercase">
              ETD Repository
            </span>
            <span className="text-xs text-slate-500 font-medium">Federal School of Statistics, Ibadan</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Institutional Research & Theses Repository
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl">
            Archive, explore, and cite National Diploma (ND) and Higher National Diploma (HND) final-year capstone theses, project reports, and datasets.
          </p>
        </div>

        <button
          onClick={() => setActiveTab('SUBMIT')}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg font-semibold text-xs sm:text-sm shadow-xs transition-colors self-start sm:self-auto min-h-[44px]"
        >
          <span>📤</span>
          <span>Submit Project Report</span>
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex gap-2 border-b border-slate-200 overflow-x-auto pb-px">
        <button
          onClick={() => setActiveTab('DISCOVERY')}
          className={`px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'DISCOVERY'
              ? 'border-emerald-900 text-emerald-950'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          🎓 Published Theses
        </button>

        <button
          onClick={() => setActiveTab('SUBMIT')}
          className={`px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'SUBMIT'
              ? 'border-emerald-900 text-emerald-950'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          📝 Submit Project
        </button>

        <button
          onClick={() => setActiveTab('MY_SUBMISSIONS')}
          className={`px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'MY_SUBMISSIONS'
              ? 'border-emerald-900 text-emerald-950'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          📂 My Submissions
        </button>

        {canReview && (
          <button
            onClick={() => setActiveTab('REVIEW')}
            className={`px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'REVIEW'
                ? 'border-emerald-900 text-emerald-950'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>⚖️</span>
            <span>Faculty Review Queue</span>
            {reviewQueue.length > 0 && (
              <span className="px-1.5 py-0.2 bg-amber-100 text-amber-900 font-bold text-[10px] rounded-full">
                {reviewQueue.length}
              </span>
            )}
          </button>
        )}
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: PUBLISHED THESES DISCOVERY */}
      {/* ========================================================================= */}
      {activeTab === 'DISCOVERY' && (
        <div className="space-y-6">
          {/* Filters Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs">
            <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="sm:col-span-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search project title, abstract, supervisor, or author..."
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
                />
              </div>

              <div>
                <select
                  value={deptFilter}
                  onChange={(e) => setDeptFilter(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-xs sm:text-sm text-slate-800 bg-white"
                >
                  <option value="ALL">All Departments</option>
                  <option value="CS">Computer Science</option>
                  <option value="AI">Artificial Intelligence</option>
                  <option value="STA">Statistics</option>
                  <option value="NCC">Networking & Cloud</option>
                  <option value="ACC">Accountancy</option>
                  <option value="BA">Business Administration</option>
                </select>
              </div>

              <div className="flex gap-2">
                <select
                  value={programmeFilter}
                  onChange={(e) => setProgrammeFilter(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-xs sm:text-sm text-slate-800 bg-white"
                >
                  <option value="ALL">All Levels</option>
                  <option value="ND">National Diploma (ND)</option>
                  <option value="HND">Higher National Diploma (HND)</option>
                </select>

                <button
                  type="submit"
                  className="px-4 py-2.5 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg font-bold text-xs shadow-xs transition-colors shrink-0"
                >
                  Search
                </button>
              </div>
            </form>
          </div>

          {/* Published Theses List */}
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white border border-slate-200 rounded-xl p-5 animate-pulse space-y-3">
                  <div className="h-6 w-3/4 bg-slate-200 rounded"></div>
                  <div className="h-4 w-1/2 bg-slate-200 rounded"></div>
                  <div className="h-16 bg-slate-100 rounded"></div>
                </div>
              ))}
            </div>
          ) : theses.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-xl p-12 text-center">
              <span className="text-4xl block mb-2">🎓</span>
              <h3 className="text-base font-bold text-slate-900">No Published Projects Found</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                No capstone reports matched your search filters. Try clearing your search parameters.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {theses.map((t) => {
                const authors = parseAuthors(t.student_authors);
                return (
                  <div
                    key={t.id}
                    className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs hover:border-slate-300 transition-all space-y-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 bg-emerald-900 text-white rounded">
                        {t.programme} • {t.department_code || 'FSS'}
                      </span>
                      <span className="text-xs font-semibold px-2 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-200">
                        Session: {t.academic_session}
                      </span>
                      {t.code_repo_url && (
                        <a
                          href={t.code_repo_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-mono font-bold text-indigo-700 hover:underline flex items-center gap-1"
                        >
                          <span>🐙</span>
                          <span>Source Code</span>
                        </a>
                      )}
                    </div>

                    <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
                      {t.title}
                    </h2>

                    <p className="text-xs sm:text-sm text-slate-600 line-clamp-3 leading-relaxed">
                      {t.abstract}
                    </p>

                    <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500">
                      <div>
                        <span>Authors: </span>
                        <strong className="text-slate-800">
                          {authors.map((a) => `${a.full_name}${a.matric_no ? ` (${a.matric_no})` : ''}`).join(', ')}
                        </strong>
                        <span className="mx-2">•</span>
                        <span>Supervisor: </span>
                        <strong className="text-slate-800">{t.supervisor_name}</strong>
                      </div>

                      <div className="flex items-center gap-2 self-start sm:self-auto">
                        <button
                          onClick={() => openReader(t)}
                          className="px-3 py-1.5 bg-emerald-900 hover:bg-emerald-800 text-white rounded text-xs font-semibold flex items-center gap-1 shadow-xs transition-colors"
                        >
                          <span>📖</span>
                          <span>Read Online</span>
                        </button>

                        <button
                          onClick={() => openCitation(t)}
                          className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded text-xs font-semibold border border-slate-300 transition-colors flex items-center gap-1"
                        >
                          <span>📜</span>
                          <span>Cite</span>
                        </button>

                        <button
                          onClick={async () => {
                            try {
                              await api.post('/bookshelf', {
                                item_type: 'THESIS',
                                item_id: t.id,
                                shelf_status: 'WANT_TO_READ',
                              });
                              alert(`Saved "${t.title}" to your bookshelf.`);
                            } catch (e: any) {
                              alert(e.message || 'Failed to save to bookshelf');
                            }
                          }}
                          className="px-2.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 rounded text-xs font-semibold border border-slate-200 transition-colors flex items-center gap-1"
                          title="Save to My Bookshelf"
                        >
                          <span>📌</span>
                          <span>Save</span>
                        </button>
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
      {/* TAB 2: SUBMIT PROJECT REPORT */}
      {/* ========================================================================= */}
      {activeTab === 'SUBMIT' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs max-w-3xl mx-auto space-y-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Submit Final-Year Project Report
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Upload your approved ND or HND project manuscript PDF to the institutional archive. Submissions are reviewed by departmental HODs before public indexing.
            </p>
          </div>

          {submitStatusMsg && (
            <div
              className={`p-3.5 rounded-lg border text-xs font-semibold ${
                submitStatusMsg.type === 'success'
                  ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                  : 'bg-rose-50 text-rose-900 border-rose-200'
              }`}
            >
              {submitStatusMsg.text}
            </div>
          )}

          <form onSubmit={handleSubmitThesis} className="space-y-4 text-xs">
            <div>
              <label className="block font-bold text-slate-700 uppercase mb-1">
                Project Title *
              </label>
              <input
                type="text"
                value={submitTitle}
                onChange={(e) => setSubmitTitle(e.target.value)}
                placeholder="e.g. Design and Implementation of an Automated Result Processing System"
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-slate-900 text-xs"
                required
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 uppercase mb-1">
                Abstract / Summary *
              </label>
              <textarea
                rows={5}
                value={submitAbstract}
                onChange={(e) => setSubmitAbstract(e.target.value)}
                placeholder="Paste the comprehensive abstract of your thesis or project..."
                className="w-full p-3 border border-slate-200 rounded-lg text-slate-900 text-xs leading-relaxed"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Department *
                </label>
                <select
                  value={submitDeptId}
                  onChange={(e) => setSubmitDeptId(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-800 bg-white"
                >
                  <option value={1}>Computer Science</option>
                  <option value={2}>Artificial Intelligence</option>
                  <option value={3}>Networking & Cloud</option>
                  <option value={4}>Statistics</option>
                  <option value={5}>Accountancy</option>
                  <option value={6}>Business Administration</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Programme Level *
                </label>
                <select
                  value={submitProgramme}
                  onChange={(e) => setSubmitProgramme(e.target.value as 'ND' | 'HND')}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-800 bg-white"
                >
                  <option value="ND">National Diploma (ND)</option>
                  <option value="HND">Higher National Diploma (HND)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Academic Session *
                </label>
                <select
                  value={submitSession}
                  onChange={(e) => setSubmitSession(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-800 bg-white"
                >
                  <option value="2024/2025">2024/2025</option>
                  <option value="2023/2024">2023/2024</option>
                  <option value="2025/2026">2025/2026</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Project Supervisor *
                </label>
                <input
                  type="text"
                  value={submitSupervisor}
                  onChange={(e) => setSubmitSupervisor(e.target.value)}
                  placeholder="e.g. Dr. O. A. Adeleke"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Keywords (Comma-separated)
                </label>
                <input
                  type="text"
                  value={submitKeywords}
                  onChange={(e) => setSubmitKeywords(e.target.value)}
                  placeholder="e.g. Machine Learning, Demography, PHP, MySQL"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 uppercase mb-1">
                GitHub / Code Repository URL (Optional)
              </label>
              <input
                type="url"
                value={submitCodeRepo}
                onChange={(e) => setSubmitCodeRepo(e.target.value)}
                placeholder="https://github.com/username/project-repo"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 font-mono text-[11px]"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 uppercase mb-1">
                Full Manuscript PDF * (Max 50 MB)
              </label>
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => setSubmitFile(e.target.files?.[0] || null)}
                className="w-full p-2 border border-slate-200 rounded-lg text-slate-800 bg-slate-50"
                required
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 bg-emerald-900 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-lg font-bold text-xs uppercase tracking-wider transition-colors shadow-xs"
              >
                {submitting ? 'Uploading & Submitting Manuscript...' : 'Submit Manuscript for Review'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: FACULTY REVIEW QUEUE (HOD / LIBRARIAN) */}
      {/* ========================================================================= */}
      {activeTab === 'REVIEW' && canReview && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
            <h2 className="text-base font-bold text-slate-900">
              Departmental Manuscript Review Queue
            </h2>
            <p className="text-xs text-slate-500">
              Verify compliance with institutional project guidelines before approving manuscripts for public indexing.
            </p>
          </div>

          {reviewLoading ? (
            <div className="p-8 text-center text-xs text-slate-500">Loading submissions queue...</div>
          ) : reviewQueue.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-xl p-12 text-center">
              <span className="text-3xl block mb-2">✓</span>
              <h3 className="text-sm font-bold text-slate-800">Review Queue Clear</h3>
              <p className="text-xs text-slate-500 mt-1">No pending student capstone manuscripts awaiting review.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {reviewQueue.map((t) => (
                <div key={t.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 bg-amber-100 text-amber-900 rounded">
                      {t.programme} • {t.department_code} • {t.academic_session}
                    </span>
                    <span className="text-xs text-slate-500">
                      Submitted: {new Date(t.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-slate-900">{t.title}</h3>
                  <p className="text-xs text-slate-600 line-clamp-3">{t.abstract}</p>

                  <div className="text-xs text-slate-500 pt-2 border-t border-slate-100 flex flex-wrap gap-4">
                    <span>Supervisor: <strong>{t.supervisor_name}</strong></span>
                  </div>

                  {/* Review Actions */}
                  <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="flex-1 w-full">
                      <input
                        type="text"
                        placeholder="Optional review feedback or notes..."
                        value={reviewNotesMap[t.id] || ''}
                        onChange={(e) => setReviewNotesMap({ ...reviewNotesMap, [t.id]: e.target.value })}
                        className="w-full px-3 py-1.5 border border-slate-200 rounded text-xs"
                      />
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => openReader(t)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded text-xs font-semibold"
                      >
                        Preview PDF
                      </button>

                      <button
                        onClick={() => handleReviewAction(t.id, 'APPROVE')}
                        className="px-3 py-1.5 bg-emerald-900 hover:bg-emerald-800 text-white rounded text-xs font-bold"
                      >
                        Approve & Publish
                      </button>

                      <button
                        onClick={() => handleReviewAction(t.id, 'REJECT')}
                        className="px-3 py-1.5 bg-rose-700 hover:bg-rose-800 text-white rounded text-xs font-bold"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: MY SUBMISSIONS */}
      {/* ========================================================================= */}
      {activeTab === 'MY_SUBMISSIONS' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
            <h2 className="text-base font-bold text-slate-900">
              My Submitted Project Manuscripts
            </h2>
            <p className="text-xs text-slate-500">
              Track your capstone project's review progress and faculty approval status.
            </p>
          </div>

          {mySubmissionsLoading ? (
            <div className="p-8 text-center text-xs text-slate-500">Loading your submissions...</div>
          ) : mySubmissions.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-xl p-12 text-center">
              <span className="text-3xl block mb-2">📂</span>
              <h3 className="text-sm font-bold text-slate-800">No Submissions Found</h3>
              <p className="text-xs text-slate-500 mt-1">You haven't submitted any final-year project manuscripts yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {mySubmissions.map((s) => (
                <div key={s.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 bg-slate-900 text-white rounded">
                      {s.programme} • {s.academic_session}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        s.status === 'PUBLISHED'
                          ? 'bg-emerald-100 text-emerald-900'
                          : s.status === 'REJECTED'
                          ? 'bg-rose-100 text-rose-900'
                          : 'bg-amber-100 text-amber-900'
                      }`}
                    >
                      {s.status === 'PUBLISHED' ? '✓ PUBLISHED' : s.status}
                    </span>
                  </div>

                  <h3 className="text-sm sm:text-base font-bold text-slate-900">{s.title}</h3>
                  <p className="text-xs text-slate-600 line-clamp-2">{s.abstract}</p>

                  {s.review_notes && (
                    <div className="p-2.5 bg-slate-50 rounded border border-slate-200 text-xs text-slate-700">
                      <strong>Reviewer Feedback:</strong> {s.review_notes}
                    </div>
                  )}

                  <div className="pt-2 flex justify-end gap-2">
                    <button
                      onClick={() => openReader(s)}
                      className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded text-xs font-semibold"
                    >
                      View Uploaded PDF
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Reader Modal */}
      <ReaderModal
        isOpen={Boolean(readingResource)}
        resource={readingResource}
        onClose={() => setReadingResource(null)}
        onOpenCitation={(res) => {
          setCitationItem({
            title: res.title,
            institution: 'Federal School of Statistics, Ibadan (Institutional Repository)',
            year: new Date(res.created_at).getFullYear(),
          });
        }}
      />

      {/* Citation Modal */}
      <CitationModal
        isOpen={Boolean(citationItem)}
        item={citationItem}
        onClose={() => setCitationItem(null)}
      />
    </div>
  );
};
