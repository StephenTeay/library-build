import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { ProgrammeType } from '../types';

export const Register: React.FC = () => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [matricNo, setMatricNo] = useState('');
  const [phone, setPhone] = useState('');
  const [departmentCode, setDepartmentCode] = useState('CS');
  const [programme, setProgramme] = useState<ProgrammeType>('ND');
  const [level, setLevel] = useState<number>(1);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [resultData, setResultData] = useState<{ matchedVerified?: boolean } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    const deptMap: Record<string, number> = { CS: 1, AI: 2, NCC: 3, STA: 4, ACC: 5, BA: 6 };

    setLoading(true);
    try {
      const res = await api.post('/onboarding/register', {
        full_name: fullName,
        email,
        matric_no: matricNo,
        phone: phone || undefined,
        department_id: deptMap[departmentCode] || 1,
        department_code: departmentCode,
        programme,
        level,
        password,
      });

      setResultData(res);
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please verify your details.');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 max-w-lg w-full text-center shadow-xs space-y-5">
          <div className="w-14 h-14 bg-emerald-100 text-emerald-800 rounded-full flex items-center justify-center mx-auto text-2xl font-bold">
            ✓
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              Registration Submitted
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-2 leading-relaxed">
              A verification link has been dispatched to <strong className="text-slate-900">{email}</strong>.
              Please check your inbox to confirm your email address.
            </p>
          </div>

          <div
            className={`p-4 rounded-lg border text-left text-xs leading-relaxed ${
              resultData?.matchedVerified
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}
          >
            {resultData?.matchedVerified ? (
              <div>
                <strong className="block font-bold text-emerald-950 mb-0.5">
                  Admissions Record Verified:
                </strong>
                Your matriculation number matched the official FSS-IB admissions register. Following email confirmation, your Head of Department will review and activate your student account.
              </div>
            ) : (
              <div>
                <strong className="block font-bold text-amber-950 mb-0.5">
                  Notice: Manual Review Required:
                </strong>
                Your matriculation number was not pre-listed in the current active semester master roster. Your account will undergo manual verification by Academic Records.
              </div>
            )}
          </div>

          <Link
            to="/login"
            className="inline-block w-full py-2.5 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg font-semibold text-xs sm:text-sm transition-colors min-h-[44px]"
          >
            Return to Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
      <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 max-w-xl w-full shadow-xs space-y-6">
        <div className="text-center space-y-1.5">
          <div className="w-12 h-12 bg-emerald-900 text-white rounded-xl inline-flex items-center justify-center font-extrabold text-sm tracking-wider shadow-xs mx-auto">
            FSS
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Student Portal Self-Registration
          </h1>
          <p className="text-xs text-slate-500">
            Federal School of Statistics, Ibadan • E-Learning & Academic Records
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
              Full Legal Name (Surname First) *
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. ADEYEMI, Babatunde Oluwaseun"
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-800 min-h-[44px]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Matriculation Number *
              </label>
              <input
                type="text"
                required
                value={matricNo}
                onChange={(e) => setMatricNo(e.target.value.toUpperCase())}
                placeholder="FSS/CS/ND/24/001"
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-slate-900 font-mono focus:outline-hidden focus:ring-2 focus:ring-emerald-800 min-h-[44px]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Email Address *
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@example.com"
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-800 min-h-[44px]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Department *
              </label>
              <select
                value={departmentCode}
                onChange={(e) => setDepartmentCode(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-800 min-h-[44px]"
              >
                <option value="CS">Computer Science</option>
                <option value="AI">Artificial Intelligence</option>
                <option value="NCC">Networking & Cloud</option>
                <option value="STA">Statistics</option>
                <option value="ACC">Accountancy</option>
                <option value="BA">Business Admin</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Programme *
              </label>
              <select
                value={programme}
                onChange={(e) => setProgramme(e.target.value as ProgrammeType)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-800 min-h-[44px]"
              >
                <option value="ND">National Diploma (ND)</option>
                <option value="HND">Higher National Diploma (HND)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Level *
              </label>
              <select
                value={level}
                onChange={(e) => setLevel(parseInt(e.target.value))}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-800 min-h-[44px]"
              >
                <option value={1}>Year 1</option>
                <option value={2}>Year 2</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Phone Number (Optional)
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 08012345678"
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-800 min-h-[44px]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Password (Min 8 chars) *
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-800 min-h-[44px]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Confirm Password *
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-800 min-h-[44px]"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg font-semibold text-xs sm:text-sm shadow-xs transition-colors cursor-pointer min-h-[44px] disabled:opacity-50"
          >
            {loading ? 'Submitting Registration...' : 'Create Student Account'}
          </button>
        </form>

        <div className="text-center text-xs text-slate-500 pt-2 border-t border-slate-100">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-emerald-900 hover:text-emerald-700 underline">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
};
