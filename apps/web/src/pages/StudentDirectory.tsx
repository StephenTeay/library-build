import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface Student {
  id: string;
  matric_no: string | null;
  email: string;
  full_name: string;
  department_id: number | null;
  department_name?: string;
  department_code?: string;
  programme: 'ND' | 'HND' | null;
  level: number | null;
  entry_session: string | null;
  role: string;
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
  matched_verified: boolean;
  email_verified_at: string | null;
  created_at: string;
  enrollment_count: number;
  active_loan_count: number;
}

interface StudentDetails {
  student: Student;
  enrollments: Array<{
    id: number;
    code: string;
    title: string;
    credit_units: number;
    semester: number;
    session: string;
    status: string;
    enrolled_at: string;
  }>;
  loans: Array<{
    id: number;
    item_id: number;
    item_title: string;
    call_number: string;
    borrowed_at: string;
    due_at: string;
    returned_at?: string;
    status: string;
  }>;
}

interface AvailableCourse {
  id: number;
  code: string;
  title: string;
  department_id?: number;
  credit_units: number;
}

const DEPARTMENTS = [
  { id: 1, code: 'CS', name: 'Computer Science' },
  { id: 2, code: 'AI', name: 'Artificial Intelligence' },
  { id: 3, code: 'NCC', name: 'Networking & Cloud Computing' },
  { id: 4, code: 'STA', name: 'Statistics' },
  { id: 5, code: 'ACC', name: 'Accountancy' },
  { id: 6, code: 'BA', name: 'Business Administration' },
];

export const StudentDirectory: React.FC = () => {
  const { user } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('ALL');
  const [levelFilter, setLevelFilter] = useState<string>('ALL');
  const [programmeFilter, setProgrammeFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'PENDING' | 'SUSPENDED'>('ALL');
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Available catalog courses for enrollment
  const [availableCourses, setAvailableCourses] = useState<AvailableCourse[]>([]);
  const [selectedCourseToEnroll, setSelectedCourseToEnroll] = useState<string>('');
  const [enrollSubmitting, setEnrollSubmitting] = useState(false);

  // Profile View Modal
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [studentDetails, setStudentDetails] = useState<StudentDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // Add Student Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    full_name: '',
    email: '',
    matric_no: '',
    department_id: user?.department_id || 1,
    programme: 'ND' as 'ND' | 'HND',
    level: 1,
    entry_session: '2025/2026',
    password: '',
  });
  const [addSubmitting, setAddSubmitting] = useState(false);

  // Edit Student Modal
  const [studentToEdit, setStudentToEdit] = useState<Student | null>(null);
  const [editForm, setEditForm] = useState({
    full_name: '',
    email: '',
    matric_no: '',
    department_id: 1,
    programme: 'ND' as 'ND' | 'HND',
    level: 1,
    entry_session: '2025/2026',
  });
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Password Reset Credential Modal
  const [resetResult, setResetResult] = useState<{ email: string; tempPass: string; studentName: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  const isSuperAdmin = user && (user.role === 'LIBRARIAN' || user.role === 'REGISTRAR');
  const canManage = isSuperAdmin || user?.role === 'HOD';

  const fetchStudents = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.append('q', searchQuery.trim());
      if (departmentFilter !== 'ALL') params.append('department_id', departmentFilter);
      if (levelFilter !== 'ALL') params.append('level', levelFilter);
      if (programmeFilter !== 'ALL') params.append('programme', programmeFilter);
      if (statusFilter !== 'ALL') params.append('status', statusFilter);

      const res = await api.get<{ students: Student[] }>(`/students?${params.toString()}`);
      setStudents(res.students || []);
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Failed to load students' });
    } finally {
      setLoading(false);
    }
  };

  const fetchCoursesList = async () => {
    try {
      const res = await api.get<{ courses: AvailableCourse[] }>('/courses');
      setAvailableCourses(res.courses || []);
    } catch (err) {
      console.warn('Could not load course list for enrollment', err);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, [departmentFilter, levelFilter, programmeFilter, statusFilter]);

  useEffect(() => {
    fetchCoursesList();
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchStudents();
  };

  const handleOpenStudentDetails = async (id: string) => {
    setSelectedStudentId(id);
    setDetailsLoading(true);
    setStudentDetails(null);
    try {
      const res = await api.get<StudentDetails>(`/students/${id}`);
      setStudentDetails(res);
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Failed to load student profile' });
      setSelectedStudentId(null);
    } finally {
      setDetailsLoading(false);
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (student: Student) => {
    setStudentToEdit(student);
    setEditForm({
      full_name: student.full_name,
      email: student.email,
      matric_no: student.matric_no || '',
      department_id: student.department_id || 1,
      programme: student.programme || 'ND',
      level: student.level || 1,
      entry_session: student.entry_session || '2025/2026',
    });
  };

  // Handle Edit Submit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentToEdit) return;

    try {
      setEditSubmitting(true);
      const res = await api.put<{ message: string; student: Student }>(`/students/${studentToEdit.id}`, editForm);
      setActionMessage({ type: 'success', text: res.message || 'Student profile updated successfully.' });
      setStudentToEdit(null);
      fetchStudents();
      if (selectedStudentId === studentToEdit.id) {
        handleOpenStudentDetails(studentToEdit.id);
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Failed to update student profile.' });
    } finally {
      setEditSubmitting(false);
    }
  };

  // Handle Add Student Submit
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.full_name || !addForm.email) {
      setActionMessage({ type: 'error', text: 'Full name and email are required.' });
      return;
    }

    try {
      setAddSubmitting(true);
      const res = await api.post<{ message: string; student: Student; tempPassword: string }>('/students', addForm);
      setShowAddModal(false);
      setAddForm({
        full_name: '',
        email: '',
        matric_no: '',
        department_id: user?.department_id || 1,
        programme: 'ND',
        level: 1,
        entry_session: '2025/2026',
        password: '',
      });
      setResetResult({
        email: res.student.email,
        studentName: res.student.full_name,
        tempPass: res.tempPassword,
      });
      setActionMessage({ type: 'success', text: `Student account created for ${res.student.full_name}.` });
      fetchStudents();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Failed to create student account.' });
    } finally {
      setAddSubmitting(false);
    }
  };

  // Handle Delete Student
  const handleDeleteStudent = async (student: Student) => {
    const confirmText = `Are you sure you want to permanently delete student ${student.full_name} (${student.matric_no || student.email})? This action cannot be undone.`;
    if (!window.confirm(confirmText)) return;

    try {
      const res = await api.delete<{ message: string }>(`/students/${student.id}`);
      setActionMessage({ type: 'success', text: res.message || 'Student account deleted.' });
      if (selectedStudentId === student.id) {
        setSelectedStudentId(null);
      }
      fetchStudents();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Failed to delete student account.' });
    }
  };

  // Handle Toggle Status (Activate / Suspend)
  const handleToggleStatus = async (student: Student) => {
    const newStatus = student.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    const confirmText = `Are you sure you want to change account status for ${student.full_name} (${student.matric_no || student.email}) to ${newStatus}?`;
    if (!window.confirm(confirmText)) return;

    try {
      await api.patch(`/students/${student.id}/status`, { status: newStatus });
      setActionMessage({ type: 'success', text: `Status updated to ${newStatus} for ${student.full_name}.` });
      fetchStudents();
      if (studentDetails && studentDetails.student.id === student.id) {
        setStudentDetails({
          ...studentDetails,
          student: { ...studentDetails.student, status: newStatus },
        });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Status update failed.' });
    }
  };

  // Handle Reset Password
  const handleResetPassword = async (student: Student) => {
    const confirmText = `Reset password and generate a temporary password for ${student.full_name}?`;
    if (!window.confirm(confirmText)) return;

    try {
      const res = await api.post<{ tempPassword: string }>(`/students/${student.id}/reset-password`);
      setResetResult({
        email: student.email,
        studentName: student.full_name,
        tempPass: res.tempPassword,
      });
      setActionMessage({ type: 'success', text: `Password reset issued for ${student.full_name}.` });
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Password reset failed.' });
    }
  };

  // Handle Enroll into Course
  const handleEnrollCourse = async () => {
    if (!selectedStudentId || !selectedCourseToEnroll) return;
    try {
      setEnrollSubmitting(true);
      const res = await api.post<{ message: string; enrollments: any[] }>(`/students/${selectedStudentId}/enroll`, {
        course_id: Number(selectedCourseToEnroll),
      });
      if (studentDetails) {
        setStudentDetails({
          ...studentDetails,
          enrollments: res.enrollments,
        });
      }
      setSelectedCourseToEnroll('');
      setActionMessage({ type: 'success', text: res.message || 'Student enrolled in course.' });
      fetchStudents();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Failed to enroll student.' });
    } finally {
      setEnrollSubmitting(false);
    }
  };

  // Handle Unenroll from Course
  const handleUnenrollCourse = async (courseId: number, courseCode: string) => {
    if (!selectedStudentId) return;
    if (!window.confirm(`Unenroll student from ${courseCode}?`)) return;

    try {
      await api.delete(`/students/${selectedStudentId}/enroll/${courseId}`);
      if (studentDetails) {
        setStudentDetails({
          ...studentDetails,
          enrollments: studentDetails.enrollments.filter(e => e.id !== courseId),
        });
      }
      setActionMessage({ type: 'success', text: `Unenrolled from ${courseCode}.` });
      fetchStudents();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Failed to unenroll.' });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const totalCount = students.length;
  const activeCount = students.filter(s => s.status === 'ACTIVE').length;
  const suspendedCount = students.filter(s => s.status === 'SUSPENDED').length;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Top Academic Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-sm bg-slate-900 text-white tracking-widest uppercase">
              Registrar & Student Records
            </span>
            <span className="text-xs text-slate-500 font-medium">Federal School of Statistics, Ibadan</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Student Directory & Management
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            View all enrolled students, edit academic profiles, manage course enrollments, reset passwords, and audit library loans.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          {canManage && (
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors cursor-pointer min-h-[40px]"
            >
              <span>➕</span>
              <span>Add Single Student</span>
            </button>
          )}

          <button
            onClick={fetchStudents}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold shadow-2xs transition-colors cursor-pointer min-h-[40px]"
          >
            <span>🔄</span>
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Action Notification Alert */}
      {actionMessage && (
        <div
          className={`p-3.5 rounded-lg border text-xs sm:text-sm font-semibold flex items-center justify-between ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : 'bg-rose-50 text-rose-900 border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <span>{actionMessage.type === 'success' ? '✓' : '⚠️'}</span>
            <span>{actionMessage.text}</span>
          </div>
          <button onClick={() => setActionMessage(null)} className="text-xs opacity-70 hover:opacity-100 cursor-pointer">✕</button>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-2xs">
          <div className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Total Students</div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1 tabular-nums">{totalCount}</div>
          <div className="text-[11px] text-slate-500 mt-1">Registered matriculated student profiles</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-2xs">
          <div className="text-emerald-700 text-xs font-semibold uppercase tracking-wider">Active Students</div>
          <div className="text-2xl sm:text-3xl font-extrabold text-emerald-800 mt-1 tabular-nums">{activeCount}</div>
          <div className="text-[11px] text-emerald-600 mt-1">Verified with active portal access</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-2xs">
          <div className="text-rose-700 text-xs font-semibold uppercase tracking-wider">Suspended / Restricted</div>
          <div className="text-2xl sm:text-3xl font-extrabold text-rose-800 mt-1 tabular-nums">{suspendedCount}</div>
          <div className="text-[11px] text-rose-600 mt-1">Accounts flagged or temporarily suspended</div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search Box */}
          <form onSubmit={handleSearchSubmit} className="flex-1 flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Search by matric number, full name, or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
              />
              <span className="absolute left-3 top-2.5 text-slate-400 text-xs">🔍</span>
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer min-h-[38px]"
            >
              Search
            </button>
          </form>

          {/* Department Filter (Visible if Admin/Registrar/Librarian) */}
          {(user?.role === 'REGISTRAR' || user?.role === 'LIBRARIAN') && (
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-800 min-h-[38px]"
            >
              <option value="ALL">All Departments</option>
              {DEPARTMENTS.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.code} - {dept.name}
                </option>
              ))}
            </select>
          )}

          {/* Programme Filter */}
          <select
            value={programmeFilter}
            onChange={(e) => setProgrammeFilter(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-800 min-h-[38px]"
          >
            <option value="ALL">All Programmes</option>
            <option value="ND">National Diploma (ND)</option>
            <option value="HND">Higher National Diploma (HND)</option>
          </select>

          {/* Level Filter */}
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-800 min-h-[38px]"
          >
            <option value="ALL">All Levels</option>
            <option value="1">Year 1 (ND 1 / HND 1)</option>
            <option value="2">Year 2 (ND 2 / HND 2)</option>
          </select>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-2 pt-2 border-t border-slate-100 overflow-x-auto">
          {(['ALL', 'ACTIVE', 'PENDING', 'SUSPENDED'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                statusFilter === st
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {st === 'ALL' ? 'All Statuses' : st}
            </button>
          ))}
        </div>
      </div>

      {/* Students Data Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500 text-xs animate-pulse">
            Loading student records...
          </div>
        ) : students.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <span className="text-3xl">👥</span>
            <h3 className="text-base font-bold text-slate-900">No Students Found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              No matriculated student accounts match the selected filters or search query.
            </p>
            {canManage && (
              <button
                onClick={() => setShowAddModal(true)}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-900 text-white rounded-lg text-xs font-semibold hover:bg-emerald-800 cursor-pointer"
              >
                <span>➕</span>
                <span>Add Student Manually</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-4">Matric No</th>
                  <th className="py-3 px-4">Department & Level</th>
                  <th className="py-3 px-4 text-center">Modules</th>
                  <th className="py-3 px-4 text-center">Active Loans</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {students.map((student) => (
                  <tr key={student.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900">{student.full_name}</div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">{student.email}</div>
                    </td>

                    <td className="py-3.5 px-4 font-mono font-bold text-slate-800">
                      {student.matric_no ? (
                        <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          {student.matric_no}
                        </span>
                      ) : (
                        <span className="text-slate-400 font-sans italic">Unassigned</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-800">
                        {student.department_code || student.department_name || 'General'}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {student.programme ? `${student.programme} ${student.level || 1}` : 'N/A'} • {student.entry_session || '2025/2026'}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-center tabular-nums font-semibold text-slate-700">
                      <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-800 rounded-full text-[11px]">
                        {student.enrollment_count} modules
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-center tabular-nums">
                      {student.active_loan_count > 0 ? (
                        <span className="inline-block px-2 py-0.5 bg-amber-100 text-amber-800 font-bold rounded-full text-[11px]">
                          {student.active_loan_count} book(s)
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px]">0</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                          student.status === 'ACTIVE'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : student.status === 'SUSPENDED'
                            ? 'bg-rose-50 text-rose-800 border border-rose-200'
                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {student.status}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        <button
                          onClick={() => handleOpenStudentDetails(student.id)}
                          className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-semibold text-xs transition-colors cursor-pointer"
                          title="View Enrolled Courses & Borrowing History"
                        >
                          Profile
                        </button>

                        {canManage && (
                          <button
                            onClick={() => handleOpenEdit(student)}
                            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-semibold text-xs transition-colors cursor-pointer"
                            title="Edit Student Details"
                          >
                            Edit
                          </button>
                        )}

                        {canManage && (
                          <button
                            onClick={() => handleToggleStatus(student)}
                            className={`px-2.5 py-1.5 rounded-md font-semibold text-xs transition-colors cursor-pointer ${
                              student.status === 'ACTIVE'
                                ? 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
                                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
                            }`}
                          >
                            {student.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                          </button>
                        )}

                        {canManage && (
                          <button
                            onClick={() => handleResetPassword(student)}
                            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-semibold text-xs transition-colors cursor-pointer"
                            title="Reset Temporary Password"
                          >
                            Reset Pwd
                          </button>
                        )}

                        {isSuperAdmin && (
                          <button
                            onClick={() => handleDeleteStudent(student)}
                            className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-md font-semibold text-xs transition-colors cursor-pointer"
                            title="Delete Student Account"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Single Student Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-sm bg-emerald-900 text-white tracking-widest uppercase">
                  Registrar / HOD Action
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-1">Add Single Student</h3>
                <p className="text-xs text-slate-500">Create a new matriculated student account with automatic course enrollment.</p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Babatunde Adeleke"
                  value={addForm.full_name}
                  onChange={(e) => setAddForm({ ...addForm, full_name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Email Address *</label>
                  <input
                    type="email"
                    required
                    placeholder="student@fss.ng"
                    value={addForm.email}
                    onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Matric Number</label>
                  <input
                    type="text"
                    placeholder="e.g. FSS/CS/24/001"
                    value={addForm.matric_no}
                    onChange={(e) => setAddForm({ ...addForm, matric_no: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-800 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Department *</label>
                  <select
                    disabled={user?.role === 'HOD'}
                    value={addForm.department_id}
                    onChange={(e) => setAddForm({ ...addForm, department_id: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
                  >
                    {DEPARTMENTS.map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        {dept.code} - {dept.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Programme *</label>
                  <select
                    value={addForm.programme}
                    onChange={(e) => setAddForm({ ...addForm, programme: e.target.value as 'ND' | 'HND' })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
                  >
                    <option value="ND">National Diploma (ND)</option>
                    <option value="HND">Higher National Diploma (HND)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Level *</label>
                  <select
                    value={addForm.level}
                    onChange={(e) => setAddForm({ ...addForm, level: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
                  >
                    <option value={1}>Level 1 (Year 1)</option>
                    <option value={2}>Level 2 (Year 2)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Academic Entry Session</label>
                  <input
                    type="text"
                    value={addForm.entry_session}
                    onChange={(e) => setAddForm({ ...addForm, entry_session: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-800 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Initial Password (Optional)</label>
                  <input
                    type="text"
                    placeholder="Leave blank to auto-generate"
                    value={addForm.password}
                    onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-800 font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addSubmitting}
                  className="px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg font-semibold cursor-pointer disabled:opacity-50"
                >
                  {addSubmitting ? 'Creating...' : 'Create Student'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Student Modal */}
      {studentToEdit && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-sm bg-slate-900 text-white tracking-widest uppercase">
                  Update Student Record
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-1">Edit {studentToEdit.full_name}</h3>
                <p className="text-xs text-slate-500">Modify student information, matric number, or programme level.</p>
              </div>
              <button
                onClick={() => setStudentToEdit(null)}
                className="text-slate-400 hover:text-slate-600 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={editForm.full_name}
                  onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Email Address *</label>
                  <input
                    type="email"
                    required
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Matric Number</label>
                  <input
                    type="text"
                    value={editForm.matric_no}
                    onChange={(e) => setEditForm({ ...editForm, matric_no: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-800 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Department *</label>
                  <select
                    disabled={user?.role === 'HOD'}
                    value={editForm.department_id}
                    onChange={(e) => setEditForm({ ...editForm, department_id: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
                  >
                    {DEPARTMENTS.map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        {dept.code} - {dept.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Programme *</label>
                  <select
                    value={editForm.programme}
                    onChange={(e) => setEditForm({ ...editForm, programme: e.target.value as 'ND' | 'HND' })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
                  >
                    <option value="ND">National Diploma (ND)</option>
                    <option value="HND">Higher National Diploma (HND)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Level *</label>
                  <select
                    value={editForm.level}
                    onChange={(e) => setEditForm({ ...editForm, level: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
                  >
                    <option value={1}>Level 1 (Year 1)</option>
                    <option value={2}>Level 2 (Year 2)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Entry Session</label>
                <input
                  type="text"
                  value={editForm.entry_session}
                  onChange={(e) => setEditForm({ ...editForm, entry_session: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-800 font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setStudentToEdit(null)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg font-semibold cursor-pointer disabled:opacity-50"
                >
                  {editSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Student Details & Profile Modal */}
      {selectedStudentId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full p-6 shadow-xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-sm bg-slate-900 text-white tracking-widest uppercase">
                  Academic Record
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-1">
                  {studentDetails?.student.full_name || 'Student Profile'}
                </h3>
                <div className="text-xs text-slate-500 font-mono">
                  {studentDetails?.student.matric_no || 'Unassigned'} • {studentDetails?.student.email}
                </div>
              </div>
              <button
                onClick={() => setSelectedStudentId(null)}
                className="text-slate-400 hover:text-slate-600 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            {detailsLoading ? (
              <div className="py-8 text-center text-xs text-slate-500 animate-pulse">
                Loading academic records and enrollments...
              </div>
            ) : studentDetails ? (
              <div className="space-y-5 text-xs">
                {/* Meta Summary */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Department</span>
                    <span className="font-semibold text-slate-800">{studentDetails.student.department_name || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Programme</span>
                    <span className="font-semibold text-slate-800">{studentDetails.student.programme} {studentDetails.student.level}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Entry Session</span>
                    <span className="font-semibold text-slate-800">{studentDetails.student.entry_session || '2025/2026'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Status</span>
                    <span className="font-bold text-emerald-800">{studentDetails.student.status}</span>
                  </div>
                </div>

                {/* Enrolled Courses & Course Enrollment Manager */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
                      <span>📚</span>
                      <span>Enrolled Course Modules ({studentDetails.enrollments.length})</span>
                    </h4>
                  </div>

                  {studentDetails.enrollments.length === 0 ? (
                    <p className="text-slate-500 italic bg-slate-50 p-3 rounded border border-slate-200">
                      No course modules enrolled yet.
                    </p>
                  ) : (
                    <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-48 overflow-y-auto">
                      {studentDetails.enrollments.map((enr) => (
                        <div key={enr.id} className="p-2.5 flex items-center justify-between hover:bg-slate-50">
                          <div>
                            <span className="font-mono font-bold text-emerald-900 mr-2">{enr.code}</span>
                            <span className="font-medium text-slate-800">{enr.title}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-slate-500 text-[11px] font-semibold">{enr.credit_units} Units</span>
                            {canManage && (
                              <button
                                onClick={() => handleUnenrollCourse(enr.id, enr.code)}
                                className="text-rose-600 hover:text-rose-800 p-1 text-xs cursor-pointer"
                                title="Unenroll student from course"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Enroll in Additional Course Bar */}
                  {canManage && (
                    <div className="pt-2 flex items-center gap-2">
                      <select
                        value={selectedCourseToEnroll}
                        onChange={(e) => setSelectedCourseToEnroll(e.target.value)}
                        className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-800"
                      >
                        <option value="">-- Enroll student into another course --</option>
                        {availableCourses
                          .filter(c => !studentDetails.enrollments.some(e => e.id === c.id))
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.code} - {c.title} ({c.credit_units} CU)
                            </option>
                          ))}
                      </select>
                      <button
                        onClick={handleEnrollCourse}
                        disabled={!selectedCourseToEnroll || enrollSubmitting}
                        className="px-3 py-1.5 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-50"
                      >
                        {enrollSubmitting ? 'Enrolling...' : 'Enroll'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Library Borrowing History */}
                <div>
                  <h4 className="font-bold text-slate-900 mb-2 flex items-center gap-1.5">
                    <span>📖</span>
                    <span>Physical Library Loans ({studentDetails.loans.length})</span>
                  </h4>
                  {studentDetails.loans.length === 0 ? (
                    <p className="text-slate-500 italic bg-slate-50 p-3 rounded border border-slate-200">
                      No active or past physical library borrowing records.
                    </p>
                  ) : (
                    <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-40 overflow-y-auto">
                      {studentDetails.loans.map((loan) => (
                        <div key={loan.id} className="p-2.5 flex items-center justify-between hover:bg-slate-50">
                          <div>
                            <div className="font-semibold text-slate-800">{loan.item_title}</div>
                            <div className="text-[11px] text-slate-500 font-mono">{loan.call_number} • Due: {new Date(loan.due_at).toLocaleDateString()}</div>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            loan.status === 'ACTIVE' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {loan.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            <div className="flex justify-between items-center pt-3 border-t border-slate-100">
              {studentDetails && canManage ? (
                <button
                  onClick={() => {
                    handleOpenEdit(studentDetails.student);
                    setSelectedStudentId(null);
                  }}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg font-semibold text-xs cursor-pointer"
                >
                  ✏️ Edit Profile Details
                </button>
              ) : <div />}

              <button
                onClick={() => setSelectedStudentId(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold text-xs transition-colors cursor-pointer min-h-[38px]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password Reset Credential Result Modal */}
      {resetResult && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="w-12 h-12 bg-amber-100 text-amber-800 rounded-full flex items-center justify-center text-xl font-bold">
              🔑
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900">Student Account Credentials</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Share this temporary login password with <strong>{resetResult.studentName}</strong>. They will be forced to choose a private password on first sign-in.
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2 text-xs">
              <div>
                <span className="text-slate-500 block">Student Email:</span>
                <span className="font-mono font-semibold text-slate-900">{resetResult.email}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Temporary Password:</span>
                <div className="flex items-center justify-between gap-2 bg-white px-2.5 py-1.5 rounded border border-slate-200 mt-1">
                  <span className="font-mono font-bold text-emerald-950 text-sm select-all">
                    {resetResult.tempPass}
                  </span>
                  <button
                    onClick={() => copyToClipboard(resetResult.tempPass)}
                    className="text-xs font-semibold text-emerald-900 hover:text-emerald-700 cursor-pointer"
                  >
                    {copiedKey ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>

            <button
              onClick={() => setResetResult(null)}
              className="w-full py-2.5 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg font-semibold text-xs transition-colors cursor-pointer min-h-[40px]"
            >
              Done & Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
