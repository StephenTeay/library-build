import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export const MustChangePasswordModal: React.FC = () => {
  const { mustChangePassword, updatePassword, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!mustChangePassword) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await updatePassword(currentPassword, newPassword);
    } catch (err: any) {
      setError(err.message || 'Failed to update password. Please check current password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 sm:p-8 shadow-2xl space-y-5">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 bg-amber-50 text-amber-800 rounded-full inline-flex items-center justify-center text-xl font-bold border border-amber-200">
            🔒
          </div>
          <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
            Security Notice: Set Permanent Password
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Your account was initialized with a default or temporary password. To protect your student and academic records, you must set a secure password before continuing.
          </p>
        </div>

        {error && (
          <div role="alert" className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-xs font-semibold text-rose-800">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs sm:text-sm">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Current / Temporary Password *
            </label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="e.g. Initial temporary password or matric"
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-800 min-h-[44px]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              New Password (Min 8 characters) *
            </label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-800 min-h-[44px]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Confirm New Password *
            </label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat new password"
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-800 min-h-[44px]"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg font-semibold text-xs sm:text-sm shadow-xs transition-colors cursor-pointer min-h-[44px] disabled:opacity-50"
          >
            {submitting ? 'Updating Password...' : 'Save Password & Enter Portal'}
          </button>

          <button
            type="button"
            onClick={logout}
            className="w-full text-center text-xs text-slate-500 hover:text-slate-700 py-1 cursor-pointer transition-colors"
          >
            Sign Out
          </button>
        </form>
      </div>
    </div>
  );
};
