import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Course } from '../types';
import { api } from '../services/api';
import { StorageGauge } from '../components/StorageGauge';
import { CourseModal } from '../components/CourseModal';
import { BulkUploadModal } from '../components/BulkUploadModal';

const DEPARTMENTS = [
  { code: 'ALL', name: 'All Departments' },
  { code: 'CS', name: 'Computer Science & AI' },
  { code: 'ST', name: 'Statistics' },
  { code: 'MTH', name: 'Mathematics' },
  { code: 'SLT', name: 'Science Laboratory Tech' },
  { code: 'BA', name: 'Business Administration' },
  { code: 'ACC', name: 'Accountancy' },
];

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('ALL');
  const [error, setError] = useState<string | null>(null);
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [courseToEdit, setCourseToEdit] = useState<Course | null>(null);

  const fetchCourses = async () => {
    try {
      setLoading(true);
      // If student: fetch enrolled courses; if lecturer/staff: fetch assigned / department courses
      const endpoint = user?.role === 'STUDENT' ? '/courses/enrolled' : '/courses';
      const res = await api.get<{ courses: Course[] }>(endpoint);
      setCourses(res.courses || []);
    } catch (err: any) {
      console.warn('Failed to load courses from API, checking fallback', err);
      setError('Could not load live course catalog. Offline cached modules remain available.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user || user.must_change_password) return;
    fetchCourses();
  }, [user]);

  const totalCreditUnits = courses.reduce((sum, c) => sum + (c.credit_units || 0), 0);

  const filteredCourses = courses.filter((c) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      c.code.toLowerCase().includes(q) ||
      c.title.toLowerCase().includes(q) ||
      (c.lecturer_name && c.lecturer_name.toLowerCase().includes(q));

    const matchesDept =
      selectedDept === 'ALL' ||
      (c.department_code && c.department_code.toUpperCase() === selectedDept) ||
      c.code.toUpperCase().startsWith(selectedDept);

    return matchesSearch && matchesDept;
  });

  const getDeptColorClass = (code?: string) => {
    const prefix = (code || '').toUpperCase();
    if (prefix.includes('CS') || prefix.includes('COM')) return 'border-t-emerald-700 text-emerald-800 bg-emerald-50';
    if (prefix.includes('ST') || prefix.includes('STA')) return 'border-t-sky-700 text-sky-800 bg-sky-50';
    if (prefix.includes('MTH')) return 'border-t-indigo-700 text-indigo-800 bg-indigo-50';
    if (prefix.includes('SLT')) return 'border-t-purple-700 text-purple-800 bg-purple-50';
    if (prefix.includes('BA') || prefix.includes('BAM')) return 'border-t-amber-700 text-amber-800 bg-amber-50';
    if (prefix.includes('ACC')) return 'border-t-teal-800 text-teal-900 bg-teal-50';
    return 'border-t-emerald-800 text-emerald-800 bg-emerald-50';
  };

  return (
    <div className="space-y-6">
      {/* Institutional Top Academic Banner */}
      <section className="bg-emerald-900 text-white rounded-xl p-6 sm:p-8 shadow-sm border border-emerald-950 relative overflow-hidden">
        {/* Subtle decorative watermark */}
        <div className="absolute -right-8 -bottom-8 opacity-10 pointer-events-none text-9xl font-black select-none">
          FSS
        </div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-emerald-800/80 border border-emerald-700 text-emerald-200 text-xs font-semibold tracking-wide uppercase">
              <span>🏛️</span>
              <span>Academic Session 2025/2026 · First Semester</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Welcome back, {user?.full_name}
            </h1>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-emerald-100 font-medium pt-1">
              {user?.matric_no && (
                <div className="flex items-center gap-1.5">
                  <span className="text-emerald-300 font-semibold uppercase">Matric:</span>
                  <span className="font-mono bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60 text-white font-bold">
                    {user.matric_no}
                  </span>
                </div>
              )}
              {user?.department_code && (
                <div className="flex items-center gap-1.5">
                  <span className="text-emerald-300 font-semibold uppercase">Department:</span>
                  <span className="bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60 text-white font-medium">
                    {user.department_code}
                  </span>
                </div>
              )}
              {user?.programme && (
                <div className="flex items-center gap-1.5">
                  <span className="text-emerald-300 font-semibold uppercase">Level:</span>
                  <span className="bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60 text-white font-medium">
                    {user.programme} {user.level ? `Year ${user.level}` : ''}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Student Registered Units Pill */}
          {user?.role === 'STUDENT' && (
            <div className="bg-emerald-950/80 border border-emerald-800/80 rounded-xl p-4 sm:p-5 text-center min-w-[200px] shrink-0 backdrop-blur-sm shadow-inner">
              <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">
                Registered Units
              </div>
              <div className="text-3xl font-extrabold text-white mt-1 tabular-nums">
                {totalCreditUnits} <span className="text-xs font-semibold text-emerald-300 font-sans">CU</span>
              </div>
              <div className="text-xs text-emerald-200/80 mt-1 tabular-nums font-medium">
                {courses.length} Enrolled Modules
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Main Content Grid: Course Decks & Side Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Course Deck (8 of 12 cols on desktop) */}
        <div className="lg:col-span-8 space-y-5">
          {/* Section Header & Search */}
          <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  <span>📚</span>
                  <span>{user?.role === 'STUDENT' ? 'My Enrolled Modules' : 'Departmental Course Catalog'}</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Interactive lecture notes, laboratory code, case studies, and physical book shelf locations.
                </p>
              </div>

              {/* Course Search & Add Course Controls */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative min-w-[200px]">
                  <input
                    type="text"
                    placeholder="Search code or title..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:bg-white transition-all"
                  />
                  <span className="absolute left-2.5 top-2.5 text-xs text-slate-400">🔍</span>
                </div>

                {['REGISTRAR', 'LIBRARIAN', 'HOD'].includes(user?.role || '') && (
                  <>
                    <button
                      onClick={() => setShowBulkModal(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-900 border border-emerald-300 hover:bg-emerald-100 rounded-lg text-xs font-semibold shadow-2xs transition-colors cursor-pointer whitespace-nowrap min-h-[36px]"
                      title="Bulk upload learning materials across courses"
                    >
                      <span>⚡</span>
                      <span>Bulk Ingest</span>
                    </button>
                    <button
                      onClick={() => {
                        setCourseToEdit(null);
                        setShowCourseModal(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors cursor-pointer whitespace-nowrap min-h-[36px]"
                    >
                      <span>➕</span>
                      <span>Add Course</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Department Quick Filter Chips - Restricted to Staff/Admins */}
            {user?.role !== 'STUDENT' ? (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                {DEPARTMENTS.map((dept) => (
                  <button
                    key={dept.code}
                    onClick={() => setSelectedDept(dept.code)}
                    className={`text-xs px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap transition-all ${
                      selectedDept === dept.code
                        ? 'bg-emerald-900 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                    }`}
                  >
                    {dept.code === 'ALL' ? 'All Departments' : dept.code}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-slate-600 font-medium bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg w-fit">
                <span className="font-semibold text-emerald-900">Departmental Scope:</span>
                <span className="font-semibold text-slate-900">{user.department_code || user.department_name || 'Enrolled Curriculum'}</span>
                {user.programme && (
                  <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-[11px] font-bold">
                    {user.programme} {user.level || 1}
                  </span>
                )}
              </div>
            )}
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2.5">
              <span className="text-base">⚠️</span>
              <span className="font-medium">{error}</span>
            </div>
          )}

          {/* Loading Skeleton States */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 animate-pulse">
                  <div className="flex justify-between items-center">
                    <div className="h-5 w-20 bg-slate-200 rounded" />
                    <div className="h-5 w-12 bg-slate-200 rounded" />
                  </div>
                  <div className="h-6 w-3/4 bg-slate-200 rounded" />
                  <div className="h-10 w-full bg-slate-100 rounded" />
                  <div className="h-4 w-1/2 bg-slate-200 rounded" />
                  <div className="h-9 w-full bg-slate-200 rounded-lg pt-2" />
                </div>
              ))}
            </div>
          ) : filteredCourses.length === 0 ? (
            /* Empty State */
            <div className="bg-white border border-dashed border-slate-300 rounded-xl p-10 text-center space-y-3">
              <div className="text-4xl">📚</div>
              <h3 className="text-base font-bold text-slate-900">No Course Modules Found</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {searchQuery || selectedDept !== 'ALL'
                  ? 'No course modules match your selected search or department filter.'
                  : 'You are not enrolled in any modules for this session. Please contact your Department HOD or Level Coordinator.'}
              </p>
              {(searchQuery || selectedDept !== 'ALL') && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedDept('ALL');
                  }}
                  className="text-xs font-semibold text-emerald-800 hover:text-emerald-950 underline pt-1"
                >
                  Clear all filters
                </button>
              )}
            </div>
          ) : (
            /* Course Cards Grid */
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filteredCourses.map((course) => {
                const colorTheme = getDeptColorClass(course.code);
                return (
                  <div
                    key={course.id}
                    className={`bg-white border border-slate-200 border-t-4 ${colorTheme} rounded-xl p-5 shadow-sm hover:shadow-md hover:border-slate-300 transition-all flex flex-col justify-between`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        {/* Course Code in JetBrains Mono / monospace */}
                        <span className="font-mono text-xs font-extrabold px-2 py-0.5 rounded border border-slate-200 bg-slate-50 tracking-wider">
                          {course.code}
                        </span>

                        <span className="text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded tabular-nums">
                          {course.credit_units} CU
                        </span>
                      </div>

                      <div>
                        <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-snug line-clamp-2">
                          {course.title}
                        </h3>
                        {course.description && (
                          <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                            {course.description}
                          </p>
                        )}
                      </div>

                      <div className="pt-1 flex items-center justify-between text-xs text-slate-600 border-t border-slate-100">
                        <span className="truncate flex items-center gap-1">
                          <span>👨‍🏫</span>
                          <span className="font-medium truncate">{course.lecturer_name || 'Department Faculty'}</span>
                        </span>
                        <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded shrink-0">
                          Sem {course.semester}
                        </span>
                      </div>
                    </div>

                    <div className="pt-4 mt-2 flex items-center gap-2">
                      <Link
                        to={`/course/${course.id}`}
                        className="flex-1 min-h-[40px] flex items-center justify-center gap-2 bg-emerald-900 hover:bg-emerald-950 text-white rounded-lg text-xs font-bold transition-all shadow-sm active:scale-[0.99]"
                      >
                        <span>Open Module & Materials</span>
                        <span>→</span>
                      </Link>

                      {['REGISTRAR', 'LIBRARIAN', 'HOD'].includes(user?.role || '') && (
                        <button
                          onClick={() => {
                            setCourseToEdit(course);
                            setShowCourseModal(true);
                          }}
                          className="px-3 min-h-[40px] border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-bold transition-all shadow-2xs cursor-pointer"
                          title="Edit Course Details"
                        >
                          ✏️
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Storage Gauge & Institutional Portals (4 of 12 cols on desktop) */}
        <div className="lg:col-span-4 space-y-5">
          {/* Storage Gauge */}
          <StorageGauge />

          {/* Administration Quick Hub for Staff/Admins */}
          {['REGISTRAR', 'LIBRARIAN', 'HOD', 'LEVEL_COORDINATOR'].includes(user?.role || '') && (
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
                <span>Academic Administration</span>
                <span className="font-mono text-[10px] text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded font-bold">STAFF</span>
              </h3>

              <div className="space-y-2">
                <Link
                  to="/admin/students"
                  className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50/70 hover:bg-emerald-100/70 border border-emerald-200 text-slate-800 transition-all group no-underline"
                >
                  <div className="w-8 h-8 rounded-lg bg-emerald-900 text-white flex items-center justify-center text-sm font-bold">
                    🎓
                  </div>
                  <div>
                    <div className="font-bold text-xs text-slate-900 group-hover:text-emerald-950">
                      Manage Students
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Directory, profile edits, passwords & enrollments
                    </div>
                  </div>
                </Link>

                <Link
                  to="/admin/approvals"
                  className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 transition-all group no-underline"
                >
                  <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center text-sm font-bold">
                    📋
                  </div>
                  <div>
                    <div className="font-bold text-xs text-slate-900">
                      Registration Approvals
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Review pending student signups
                    </div>
                  </div>
                </Link>
              </div>
            </div>
          )}

          {/* Quick Institutional Hubs */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Library & Research Hub
            </h3>

            <div className="space-y-2">
              <Link
                to="/library"
                className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-200 text-slate-800 transition-all group no-underline"
              >
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center text-sm font-bold group-hover:bg-emerald-200">
                  📖
                </div>
                <div>
                  <div className="font-bold text-xs text-slate-900 group-hover:text-emerald-950">
                    Physical Library OPAC
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Search shelf locations & availability
                  </div>
                </div>
              </Link>

              <Link
                to="/open-resources"
                className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-200 text-slate-800 transition-all group no-underline"
              >
                <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-800 flex items-center justify-center text-sm font-bold group-hover:bg-sky-200">
                  🌐
                </div>
                <div>
                  <div className="font-bold text-xs text-slate-900 group-hover:text-emerald-950">
                    Live Research & Free Books
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Google Books, arXiv preprints, Gutenberg & live news
                  </div>
                </div>
              </Link>
            </div>
          </div>

          {/* Academic Policy / Data-Saver Notice */}
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 text-xs space-y-1.5">
            <div className="font-bold flex items-center gap-1.5 text-emerald-900">
              <span>📶</span>
              <span>Low-Data & Offline Guidelines</span>
            </div>
            <p className="text-emerald-800 leading-relaxed text-[11px]">
              When studying on mobile data, turn on <strong>Data-Saver</strong> to suppress video previews. Learning materials you download or save offline are available without internet.
            </p>
          </div>
        </div>
      </div>

      {/* Course Modal */}
      <CourseModal
        isOpen={showCourseModal}
        onClose={() => {
          setShowCourseModal(false);
          setCourseToEdit(null);
        }}
        onSuccess={fetchCourses}
        courseToEdit={courseToEdit}
      />

      {/* Bulk Upload Modal */}
      <BulkUploadModal
        isOpen={showBulkModal}
        onClose={() => setShowBulkModal(false)}
        onSuccess={() => {}}
      />
    </div>
  );
};
