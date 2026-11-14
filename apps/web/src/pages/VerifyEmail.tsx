import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api } from '../services/api';

export const VerifyEmail: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('Missing verification token in URL.');
      setLoading(false);
      return;
    }

    const verify = async () => {
      try {
        await api.get(`/onboarding/verify-email?token=${encodeURIComponent(token)}`);
        setSuccess(true);
      } catch (err: any) {
        setError(err.message || 'Email verification link is invalid or has expired.');
      } finally {
        setLoading(false);
      }
    };

    verify();
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
      <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 max-w-md w-full text-center shadow-xs space-y-5">
        <div className="w-12 h-12 bg-emerald-900 text-white rounded-xl inline-flex items-center justify-center font-extrabold text-sm tracking-wider shadow-xs mx-auto">
          FSS
        </div>

        {loading ? (
          <div className="space-y-3 py-4">
            <div className="text-2xl animate-spin inline-block">⏳</div>
            <h2 className="text-lg font-bold text-slate-900">Verifying Email Address...</h2>
            <p className="text-xs text-slate-500">Confirming your enrollment verification token.</p>
          </div>
        ) : success ? (
          <div className="space-y-4">
            <div className="w-14 h-14 bg-emerald-100 text-emerald-800 rounded-full flex items-center justify-center mx-auto text-2xl font-bold">
              ✓
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
                Email Confirmed!
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 mt-2 leading-relaxed">
                Your email address has been successfully verified. Your account is now queued for approval by your Head of Department.
              </p>
            </div>
            <Link
              to="/login"
              className="inline-block w-full py-2.5 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg font-semibold text-xs sm:text-sm transition-colors min-h-[44px]"
            >
              Proceed to Sign In
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="w-14 h-14 bg-rose-100 text-rose-800 rounded-full flex items-center justify-center mx-auto text-2xl font-bold">
              ✕
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
                Verification Failed
              </h2>
              <p className="text-xs sm:text-sm text-rose-700 mt-2">
                {error}
              </p>
            </div>
            <Link
              to="/register"
              className="inline-block w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold text-xs sm:text-sm transition-colors min-h-[44px]"
            >
              Try Registering Again
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};
