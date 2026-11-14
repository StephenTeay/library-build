import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { PendingStudent } from '../types';

export const ApprovalQueue: React.FC = () => {
  const [students, setStudents] = useState<PendingStudent[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'MATCHED' | 'UNLISTED' | 'VERIFIED' | 'UNVERIFIED'>('ALL');

  const fetchQueue = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ students?: PendingStudent[]; queue?: PendingStudent[] }>('/onboarding/queue');
      setStudents(res.students || res.queue || []);
      setSelectedIds(new Set());
    } catch (err: any) {
      console.warn('Failed to load approval queue', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  const filteredStudents = students.filter((s) => {
    if (filter === 'MATCHED') return s.matched_verified;
    if (filter === 'UNLISTED') return !s.matched_verified;
    if (filter === 'VERIFIED') return Boolean(s.email_verified_at || s.email_verified);
    if (filter === 'UNVERIFIED') return !s.email_verified_at && !s.email_verified;
    return true;
  });

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(new Set(filteredStudents.map((s) => s.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBatchAction = async (action: 'APPROVE' | 'REJECT') => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Are you sure you want to ${action.toLowerCase()} ${selectedIds.size} selected student(s)?`)) {
      return;
    }

    setActionLoading(true);
    setMessage(null);
    try {
      const ids = Array.from(selectedIds);
      const res = await api.post('/onboarding/approve', {
        student_ids: ids,
        user_ids: ids,
        action,
      });
      setMessage(`Successfully processed: ${res.approved_count || res.approvedCount || selectedIds.size} student(s) updated.`);
      await fetchQueue();
    } catch (err: any) {
      alert(`Action failed: ${err.message || 'Error processing request'}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSingleApprove = async (id: string) => {
    setActionLoading(true);
    try {
      await api.post('/onboarding/approve', {
        student_ids: [id],
        user_ids: [id],
        action: 'APPROVE',
      });
      await fetchQueue();
    } catch (err: any) {
      alert(`Approval failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-sm bg-slate-900 text-white tracking-widest uppercase">
              Onboarding
            </span>
            <span className="text-xs text-slate-500 font-medium">Federal School of Statistics, Ibadan</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Student Onboarding Approvals Queue
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl">
            Review and verify pending student self-registrations. Approved students are automatically provisioned, marked verified, and enrolled into semester courses.
          </p>
        </div>

        {/* Batch Action Buttons */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={() => handleBatchAction('APPROVE')}
              disabled={actionLoading}
              className="px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg font-semibold text-xs sm:text-sm shadow-xs transition-colors min-h-[44px] cursor-pointer disabled:opacity-50"
            >
              Approve Selected ({selectedIds.size})
            </button>
            <button
              onClick={() => handleBatchAction('REJECT')}
              disabled={actionLoading}
              className="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white rounded-lg font-semibold text-xs sm:text-sm shadow-xs transition-colors min-h-[44px] cursor-pointer disabled:opacity-50"
            >
              Reject Selected
            </button>
          </div>
        )}
      </div>

      {message && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-semibold text-emerald-800 flex items-center justify-between">
          <span>{message}</span>
          <button onClick={() => setMessage(null)} className="text-slate-400 hover:text-slate-700 ml-4 cursor-pointer">
            ✕
          </button>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {[
          { id: 'ALL', label: `All Pending (${students.length})` },
          { id: 'MATCHED', label: `Admissions Matched (${students.filter((s) => s.matched_verified).length})` },
          { id: 'UNLISTED', label: `Unlisted (${students.filter((s) => !s.matched_verified).length})` },
          { id: 'VERIFIED', label: `Email Verified (${students.filter((s) => s.email_verified_at || s.email_verified).length})` },
          { id: 'UNVERIFIED', label: `Email Pending (${students.filter((s) => !s.email_verified_at && !s.email_verified).length})` },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id as any)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer min-h-[36px] border ${
              filter === t.id
                ? 'bg-emerald-900 text-white border-emerald-900'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-10 text-center animate-pulse space-y-3">
            <div className="h-6 w-48 bg-slate-200 rounded mx-auto"></div>
            <div className="h-4 w-64 bg-slate-200 rounded mx-auto"></div>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-14 h-14 bg-emerald-50 text-emerald-800 rounded-full flex items-center justify-center mx-auto mb-3 text-2xl font-bold">
              ✓
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-1">
              {students.length === 0 ? 'Queue is Completely Clear' : 'No Students in this Filter'}
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto">
              {students.length === 0
                ? 'There are currently zero pending student self-registrations requiring verification in your academic scope.'
                : 'No pending students match the selected filter category.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-3 px-4 w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === filteredStudents.length && filteredStudents.length > 0}
                      onChange={handleSelectAll}
                      className="rounded border-slate-300 text-emerald-900 focus:ring-emerald-800 cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-4 font-semibold">Matric Number</th>
                  <th className="py-3 px-4 font-semibold">Student Name & Email</th>
                  <th className="py-3 px-4 font-semibold">Academic Scope</th>
                  <th className="py-3 px-4 font-semibold">Admissions Status</th>
                  <th className="py-3 px-4 font-semibold">Email Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStudents.map((s) => {
                  const isEmailVerified = Boolean(s.email_verified_at || s.email_verified);
                  return (
                    <tr key={s.id} className="hover:bg-slate-50/75 transition-colors even:bg-slate-50/30">
                      <td className="py-3.5 px-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(s.id)}
                          onChange={() => handleToggleSelect(s.id)}
                          className="rounded border-slate-300 text-emerald-900 focus:ring-emerald-800 cursor-pointer"
                        />
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900 text-xs">
                        {s.matric_no}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{s.full_name}</div>
                        <div className="text-xs text-slate-500 font-mono mt-0.5">{s.email}</div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-700">
                        <div className="font-semibold">{s.department_code}</div>
                        <div className="text-xs text-slate-500">
                          {s.programme} • Year {s.level}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {s.matched_verified ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                            <span>Admissions Matched</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
                            <span>Unlisted / Manual</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {isEmailVerified ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                            <span>Verified</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                            <span>Email Pending</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <button
                          onClick={() => handleSingleApprove(s.id)}
                          disabled={actionLoading}
                          className="px-3 py-1.5 bg-emerald-900 hover:bg-emerald-800 text-white rounded-md text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50 min-h-[36px]"
                        >
                          Approve
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
    </div>
  );
};
