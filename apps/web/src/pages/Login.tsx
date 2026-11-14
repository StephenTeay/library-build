import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const Login: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login(identifier, password, rememberMe);
      navigate('/');
    } catch (err: any) {
      if (err.status === 429) {
        setError('Too many failed attempts or account temporarily locked. Please wait 15 minutes or reset your password.');
      } else {
        setError(err.message || 'Invalid matric number/email or password.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
      <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 max-w-md w-full shadow-xs space-y-6">
        {/* Institutional Branding */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 bg-emerald-900 text-white rounded-xl inline-flex items-center justify-center font-extrabold text-sm tracking-wider shadow-xs">
            FSS
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Institutional Portal Sign In
          </h1>
          <p className="text-xs text-slate-500">
            Federal School of Statistics, Ibadan • E-Learning & Digital Library
          </p>
        </div>

        {error && (
          <div role="alert" className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-xs font-semibold text-rose-800">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Matriculation Number or Institutional Email
            </label>
            <input
              type="text"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="e.g. FSS/CS/ND/24/001 or staff@fss.ng"
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-800 min-h-[44px]"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700">
                Password
              </label>
              <Link to="/forgot-password" className="text-xs font-semibold text-emerald-900 hover:text-emerald-700">
                Forgot password?
              </Link>
            </div>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-800 min-h-[44px]"
            />
          </div>

          <div className="flex items-center">
            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer min-h-[32px]">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="rounded border-slate-300 text-emerald-900 focus:ring-emerald-800 cursor-pointer"
              />
              <span>Remember this browser for 30 days</span>
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg font-semibold text-xs sm:text-sm shadow-xs transition-colors cursor-pointer min-h-[44px] disabled:opacity-50"
          >
            {loading ? 'Authenticating...' : 'Sign In to Portal'}
          </button>
        </form>

        <div className="text-center text-xs text-slate-500 pt-2 border-t border-slate-100">
          New student without an account?{' '}
          <Link to="/register" className="font-semibold text-emerald-900 hover:text-emerald-700 underline">
            Register here
          </Link>
        </div>
      </div>
    </div>
  );
};
