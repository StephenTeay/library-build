import React, { useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';

export const ResetPassword: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError('Invalid or missing password reset token.');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/reset-password', {
        token,
        new_password: newPassword,
      });
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Password reset failed or token has expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
      <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 max-w-md w-full shadow-xs space-y-6">
        <div className="text-center space-y-1.5">
          <div className="w-12 h-12 bg-emerald-900 text-white rounded-xl inline-flex items-center justify-center font-extrabold text-sm tracking-wider shadow-xs mx-auto">
            FSS
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Set New Password
          </h1>
          <p className="text-xs text-slate-500">
            Create a secure new password for your institutional account.
          </p>
        </div>

        {success ? (
          <div className="text-center space-y-4">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-800 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
              ✓
            </div>
            <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
              Your password has been successfully reset! You can now access your courses and portal account.
            </p>
            <button
              onClick={() => navigate('/login')}
              className="w-full py-2.5 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg font-semibold text-xs sm:text-sm shadow-xs transition-colors cursor-pointer min-h-[44px]"
            >
              Sign In to Portal
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div role="alert" className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-xs font-semibold text-rose-800">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                New Password (Min 8 chars) *
              </label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-800 min-h-[44px]"
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
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-800 min-h-[44px]"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg font-semibold text-xs sm:text-sm shadow-xs transition-colors cursor-pointer min-h-[44px] disabled:opacity-50"
            >
              {loading ? 'Updating Password...' : 'Save New Password'}
            </button>
          </form>
        )}

        <div className="text-center text-xs text-slate-500 pt-2 border-t border-slate-100">
          <Link to="/login" className="font-semibold text-emerald-900 hover:text-emerald-700 underline">
            ← Return to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
};
