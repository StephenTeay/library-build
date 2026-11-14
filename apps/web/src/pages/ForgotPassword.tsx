import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';

export const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await api.post('/auth/forgot-password', { email }).catch(() => api.post('/auth/request-reset', { email }));
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'Failed to submit password reset request.');
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
            Account Password Recovery
          </h1>
          <p className="text-xs text-slate-500">
            Federal School of Statistics, Ibadan • Institutional Portal
          </p>
        </div>

        {submitted ? (
          <div className="text-center space-y-4">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-800 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
              ✉
            </div>
            <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
              If an active account exists for <strong className="text-slate-900">{email}</strong>, a secure recovery link has been dispatched.
              The link remains valid for 1 hour.
            </p>
            <Link
              to="/login"
              className="inline-block w-full py-2.5 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg font-semibold text-xs sm:text-sm transition-colors min-h-[44px]"
            >
              Return to Sign In
            </Link>
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
                Institutional Email Address *
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. yourname@fss.ng or student@example.com"
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-800 min-h-[44px]"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg font-semibold text-xs sm:text-sm shadow-xs transition-colors cursor-pointer min-h-[44px] disabled:opacity-50"
            >
              {loading ? 'Dispatching Recovery Link...' : 'Send Password Reset Link'}
            </button>
          </form>
        )}

        <div className="text-center text-xs text-slate-500 pt-2 border-t border-slate-100">
          Remember your password?{' '}
          <Link to="/login" className="font-semibold text-emerald-900 hover:text-emerald-700 underline">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
};
