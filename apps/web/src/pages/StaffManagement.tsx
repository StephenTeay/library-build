import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { StaffMember, UserRole } from '../types';

const DEPARTMENTS = [
  { id: 1, code: 'CS', name: 'Computer Science' },
  { id: 2, code: 'ST', name: 'Statistics' },
  { id: 3, code: 'MTH', name: 'Mathematics' },
  { id: 4, code: 'SLT', name: 'Science Laboratory Technology' },
  { id: 5, code: 'BA', name: 'Business Administration' },
  { id: 6, code: 'ACC', name: 'Accounting' },
];

export const StaffManagement: React.FC = () => {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // New Staff Form State
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('LECTURER');
  const [departmentId, setDepartmentId] = useState<number | ''>(1);
  const [level, setLevel] = useState<number | ''>('');
  const [customPassword, setCustomPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Success Credential Modal
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; tempPass: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  const fetchStaff = async () => {
    try {
      setLoading(true);
      const res = await api.get<{ staff: StaffMember[] }>('/staff');
      setStaff(res.staff || []);
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Failed to load staff list' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStaff();
  }, []);

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setActionMessage(null);

    try {
      const payload: any = {
        full_name: fullName.trim(),
        email: email.trim(),
        role,
      };

      if (['HOD', 'LEVEL_COORDINATOR', 'LECTURER'].includes(role)) {
        if (!departmentId) {
          setActionMessage({ type: 'error', text: 'Department is required for academic staff' });
          setIsSubmitting(false);
          return;
        }
        payload.department_id = Number(departmentId);
      }

      if (role === 'LEVEL_COORDINATOR' && level) {
        payload.level = Number(level);
      }

      if (customPassword.trim()) {
        payload.initial_password = customPassword.trim();
      }

      const res = await api.post<{ staff: StaffMember; temporary_password: string }>('/staff', payload);
      setCreatedCredentials({
        email: payload.email,
        tempPass: res.temporary_password,
      });

      // Reset form
      setFullName('');
      setEmail('');
      setRole('LECTURER');
      setDepartmentId(1);
      setLevel('');
      setCustomPassword('');
      setShowAddModal(false);

      fetchStaff();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Failed to create staff member' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (staffMember: StaffMember) => {
    const newStatus = staffMember.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    const confirmText = `Are you sure you want to change status to ${newStatus} for ${staffMember.full_name}?`;
    if (!window.confirm(confirmText)) return;

    try {
      await api.patch(`/staff/${staffMember.id}`, { status: newStatus });
      setActionMessage({ type: 'success', text: `Account for ${staffMember.full_name} is now ${newStatus}.` });
      fetchStaff();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Failed to update staff status' });
    }
  };

  const handleResetPassword = async (staffMember: StaffMember) => {
    if (!window.confirm(`Generate temporary password and force password change for ${staffMember.full_name}?`)) return;

    try {
      const res = await api.post<{ temporary_password: string }>(`/staff/${staffMember.id}/reset-password`);
      setCreatedCredentials({
        email: staffMember.email,
        tempPass: res.temporary_password,
      });
      fetchStaff();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Failed to reset password' });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  // Filter staff
  const filteredStaff = staff.filter((s) => {
    if (roleFilter !== 'ALL' && s.role !== roleFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = s.full_name.toLowerCase().includes(q);
      const matchEmail = s.email.toLowerCase().includes(q);
      const matchDept = (s.department_name || s.department_code || '').toLowerCase().includes(q);
      return matchName || matchEmail || matchDept;
    }
    return true;
  });

  // Role stats
  const totalStaff = staff.length;
  const hodCount = staff.filter((s) => s.role === 'HOD').length;
  const lecturerCount = staff.filter((s) => s.role === 'LECTURER' || s.role === 'LEVEL_COORDINATOR').length;
  const libraryStaffCount = staff.filter((s) => s.role === 'LIBRARY_STAFF' || s.role === 'LIBRARIAN').length;

  const getRoleBadge = (r: UserRole) => {
    switch (r) {
      case 'LIBRARIAN':
      case 'REGISTRAR':
        return { bg: 'bg-purple-50 text-purple-800 border-purple-200', label: 'Librarian (Super Admin)' };
      case 'HOD':
        return { bg: 'bg-sky-50 text-sky-800 border-sky-200', label: 'HOD' };
      case 'LEVEL_COORDINATOR':
        return { bg: 'bg-emerald-50 text-emerald-800 border-emerald-200', label: 'Coordinator' };
      case 'LIBRARY_STAFF':
        return { bg: 'bg-amber-50 text-amber-900 border-amber-200', label: 'Library Staff' };
      case 'LECTURER':
        return { bg: 'bg-slate-100 text-slate-800 border-slate-200', label: 'Lecturer' };
      default:
        return { bg: 'bg-slate-100 text-slate-700 border-slate-200', label: r };
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-sm bg-slate-900 text-white tracking-widest uppercase">
              Administration
            </span>
            <span className="text-xs text-slate-500 font-medium">Federal School of Statistics, Ibadan</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Staff & Faculty Directory
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl">
            Provision, manage, and audit faculty members, Heads of Department, Library Staff, and Level Coordinators.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg font-semibold text-xs sm:text-sm shadow-xs transition-colors self-start sm:self-auto min-h-[44px] cursor-pointer"
        >
          <span className="text-base font-bold">+</span>
          <span>Add Staff Member</span>
        </button>
      </div>

      {/* Notifications */}
      {actionMessage && (
        <div
          className={`p-3.5 rounded-lg text-xs font-semibold border flex items-center justify-between ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <span>{actionMessage.text}</span>
          <button onClick={() => setActionMessage(null)} className="text-slate-400 hover:text-slate-700 ml-4">
            ✕
          </button>
        </div>
      )}

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Staff</div>
          <div className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-1 tabular-nums">{totalStaff}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Heads of Dept (HOD)</div>
          <div className="text-xl sm:text-2xl font-extrabold text-sky-800 mt-1 tabular-nums">{hodCount}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Faculty & Lecturers</div>
          <div className="text-xl sm:text-2xl font-extrabold text-emerald-900 mt-1 tabular-nums">{lecturerCount}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Library Administration</div>
          <div className="text-xl sm:text-2xl font-extrabold text-amber-800 mt-1 tabular-nums">{libraryStaffCount}</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row gap-3 flex-1">
          <input
            type="text"
            placeholder="Search by name, email, or department..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full sm:max-w-xs px-3.5 py-2 border border-slate-200 rounded-lg text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
          />

          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-xs sm:text-sm text-slate-800 bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
          >
            <option value="ALL">All Roles</option>
            <option value="HOD">Heads of Department (HOD)</option>
            <option value="LEVEL_COORDINATOR">Level Coordinators</option>
            <option value="LECTURER">Lecturers</option>
            <option value="LIBRARY_STAFF">Library Staff</option>
            <option value="LIBRARIAN">Librarian (Super Admin)</option>
          </select>
        </div>

        <div className="text-xs text-slate-500 tabular-nums">
          Showing <strong>{filteredStaff.length}</strong> of {totalStaff} staff members
        </div>
      </div>

      {/* Staff Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8 text-center animate-pulse space-y-3">
            <div className="h-6 w-36 bg-slate-200 rounded mx-auto"></div>
            <div className="h-4 w-48 bg-slate-200 rounded mx-auto"></div>
          </div>
        ) : filteredStaff.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-3 text-xl">
              👥
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-1">No Staff Found</h3>
            <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto">
              No staff members match the selected filter or search criteria.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-3 px-4 font-semibold">Staff Member</th>
                  <th className="py-3 px-4 font-semibold">Institutional Role</th>
                  <th className="py-3 px-4 font-semibold">Department / Scope</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStaff.map((s) => {
                  const badge = getRoleBadge(s.role);
                  const isActive = s.status === 'ACTIVE';

                  return (
                    <tr key={s.id} className="hover:bg-slate-50/75 transition-colors even:bg-slate-50/30">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{s.full_name}</div>
                        <div className="text-xs text-slate-500 font-mono mt-0.5">{s.email}</div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className={`inline-block px-2.5 py-0.5 rounded-sm text-xs font-bold border ${badge.bg}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-700">
                        {s.department_name ? (
                          <span>
                            {s.department_name}
                            {s.level && <span className="text-slate-500 ml-1">(Year {s.level})</span>}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Institution-Wide</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-bold border ${
                            isActive
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-rose-50 text-rose-800 border-rose-200'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-600' : 'bg-rose-600'}`}></span>
                          <span>{s.status}</span>
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap space-x-2">
                        <button
                          onClick={() => handleResetPassword(s)}
                          className="px-2.5 py-1 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white border border-slate-200 rounded hover:bg-slate-50 transition-colors cursor-pointer"
                        >
                          Reset Password
                        </button>
                        <button
                          onClick={() => handleToggleStatus(s)}
                          className={`px-2.5 py-1 text-xs font-semibold rounded border transition-colors cursor-pointer ${
                            isActive
                              ? 'text-rose-700 hover:bg-rose-50 border-rose-200'
                              : 'text-emerald-800 hover:bg-emerald-50 border-emerald-200'
                          }`}
                        >
                          {isActive ? 'Suspend' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Staff Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900">Provision New Staff Member</h3>
                <p className="text-xs text-slate-500">Create login credentials with mandatory password change.</p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-700 text-xl font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateStaff} className="space-y-4 text-xs sm:text-sm">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Full Name (with Academic Title) *
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Dr. A. B. Adeleke"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Institutional Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. adeleke@fss-ibadan.edu.ng"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Portal Role *
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
                >
                  <option value="LECTURER">Lecturer (Course Instructor)</option>
                  <option value="HOD">Head of Department (HOD)</option>
                  <option value="LEVEL_COORDINATOR">Level Coordinator</option>
                  <option value="LIBRARY_STAFF">Library Staff</option>
                  <option value="LIBRARIAN">Librarian (Super Admin)</option>
                </select>
              </div>

              {['HOD', 'LEVEL_COORDINATOR', 'LECTURER'].includes(role) && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Department *
                  </label>
                  <select
                    value={departmentId}
                    onChange={(e) => setDepartmentId(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
                  >
                    {DEPARTMENTS.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.code} - {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {role === 'LEVEL_COORDINATOR' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Assigned Level (Optional)
                  </label>
                  <select
                    value={level}
                    onChange={(e) => setLevel(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
                  >
                    <option value="">None / General</option>
                    <option value="1">ND 1</option>
                    <option value="2">ND 2</option>
                    <option value="3">HND 1</option>
                    <option value="4">HND 2</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Custom Initial Password (Optional)
                </label>
                <input
                  type="text"
                  value={customPassword}
                  onChange={(e) => setCustomPassword(e.target.value)}
                  placeholder="Leave blank for secure auto-generated temporary password"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 font-mono text-xs focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg font-semibold text-xs transition-colors cursor-pointer min-h-[38px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg font-semibold text-xs transition-colors cursor-pointer min-h-[38px] disabled:opacity-50"
                >
                  {isSubmitting ? 'Provisioning...' : 'Provision Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Generated Temporary Credentials Modal */}
      {createdCredentials && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-800 rounded-full flex items-center justify-center text-xl font-bold">
              ✓
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900">Staff Account Provisioned</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Share these temporary credentials with the staff member. They will be forced to set a new password on first login.
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2 text-xs">
              <div>
                <span className="text-slate-500 block">Email:</span>
                <span className="font-mono font-semibold text-slate-900">{createdCredentials.email}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Temporary Password:</span>
                <div className="flex items-center justify-between gap-2 bg-white px-2.5 py-1.5 rounded border border-slate-200 mt-1">
                  <span className="font-mono font-bold text-emerald-950 text-sm select-all">
                    {createdCredentials.tempPass}
                  </span>
                  <button
                    onClick={() => copyToClipboard(createdCredentials.tempPass)}
                    className="text-xs font-semibold text-emerald-900 hover:text-emerald-700 cursor-pointer"
                  >
                    {copiedKey ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>

            <button
              onClick={() => setCreatedCredentials(null)}
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
