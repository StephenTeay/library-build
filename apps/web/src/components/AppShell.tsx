import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useOffline } from '../context/OfflineContext';
import { ServerWakingBanner } from './ServerWakingBanner';
import { MustChangePasswordModal } from './MustChangePasswordModal';

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useAuth();
  const { dataSaver, toggleDataSaver } = useSettings();
  const { isOnline } = useOffline();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const isSuperAdmin = user && (user.role === 'LIBRARIAN' || user.role === 'REGISTRAR');
  const isLibraryStaff = isSuperAdmin || user?.role === 'LIBRARY_STAFF';
  const isAcademicStaff = user && ['LIBRARIAN', 'REGISTRAR', 'HOD', 'LEVEL_COORDINATOR'].includes(user.role);

  // If user is not logged in, render simple public container without internal sidebar
  if (!user) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
        <ServerWakingBanner />
        <header className="sticky top-0 z-40 bg-emerald-900 border-b border-emerald-950 text-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-3 text-white no-underline">
              <div className="w-9 h-9 rounded-lg bg-white text-emerald-900 font-extrabold flex items-center justify-center text-sm shadow-sm tracking-wider">
                FSS
              </div>
              <div>
                <div className="font-bold text-base tracking-tight leading-tight">FSS-IB Portal</div>
                <div className="text-[10px] text-emerald-200 uppercase tracking-wider font-medium">
                  Federal School of Statistics, Ibadan
                </div>
              </div>
            </Link>

            <div className="flex items-center gap-3">
              <button
                onClick={toggleDataSaver}
                className={`text-xs px-3 py-1.5 rounded-full font-medium flex items-center gap-1.5 transition-colors ${
                  dataSaver
                    ? 'bg-emerald-800 text-white border border-emerald-400'
                    : 'bg-emerald-950/60 text-emerald-200 border border-emerald-800 hover:bg-emerald-800/50'
                }`}
                title={dataSaver ? 'Data-Saver Mode is ON' : 'Turn ON Data-Saver Mode'}
              >
                <span>📶</span>
                <span>Data-Saver: {dataSaver ? 'ON' : 'OFF'}</span>
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 flex flex-col">{children}</main>

        <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500">
          Federal School of Statistics, Ibadan (FSS-IB) · Institutional E-Learning Portal
        </footer>
      </div>
    );
  }

  // Navigation Items
  const navItems = [
    { label: 'Dashboard', path: '/', icon: '🏛️', active: location.pathname === '/' },
    { label: 'Library OPAC', path: '/library', icon: '📖', active: location.pathname.startsWith('/library') },
    { label: 'Open Resources', path: '/open-resources', icon: '🌐', active: location.pathname.startsWith('/open-resources') },
  ];

  const adminItems = [
    ...(isAcademicStaff
      ? [
          { label: 'Student Directory', path: '/admin/students', icon: '🎓', active: location.pathname.startsWith('/admin/students') },
          { label: 'Approval Queue', path: '/admin/approvals', icon: '📋', active: location.pathname.startsWith('/admin/approvals') },
        ]
      : []),
    ...(isSuperAdmin
      ? [{ label: 'Manage Staff', path: '/admin/staff', icon: '👥', active: location.pathname.startsWith('/admin/staff') }]
      : []),
    ...(isLibraryStaff
      ? [{ label: 'Bulk Import Books', path: '/admin/books/import', icon: '📚', active: location.pathname.startsWith('/admin/books/import') }]
      : []),
    ...(isSuperAdmin
      ? [{ label: 'Student CSV Import', path: '/admin/import', icon: '📄', active: location.pathname.startsWith('/admin/import') }]
      : []),
  ];

  const getRoleLabel = () => {
    switch (user.role) {
      case 'LIBRARIAN':
        return 'Chief Librarian (Admin)';
      case 'REGISTRAR':
        return 'Registrar (Admin)';
      case 'LIBRARY_STAFF':
        return 'Library Staff';
      case 'HOD':
        return `Head of Dept (${user.department_code || 'HOD'})`;
      case 'LEVEL_COORDINATOR':
        return `Level Coordinator (L${user.level || 1})`;
      case 'LECTURER':
        return 'Faculty / Lecturer';
      case 'STUDENT':
        return `Student (${user.programme || 'ND'} ${user.level ? `L${user.level}` : ''})`;
      default:
        return user.role;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col antialiased">
      <ServerWakingBanner />
      <MustChangePasswordModal />

      {/* Mobile Topbar */}
      <header className="lg:hidden sticky top-0 z-40 bg-emerald-900 border-b border-emerald-950 text-white shadow-sm h-14 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="w-10 h-10 flex items-center justify-center rounded-lg bg-emerald-950/60 text-white hover:bg-emerald-800 transition-colors"
            aria-label="Open Navigation Drawer"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <Link to="/" className="flex items-center gap-2 text-white no-underline">
            <div className="w-7 h-7 rounded bg-white text-emerald-900 font-extrabold flex items-center justify-center text-xs shadow-sm">
              FSS
            </div>
            <span className="font-bold text-sm tracking-tight">FSS-IB Portal</span>
          </Link>
        </div>

        <div className="flex items-center gap-2">
          {/* Data-Saver Quick Toggle */}
          <button
            onClick={toggleDataSaver}
            className={`text-[11px] px-2.5 py-1 rounded-full font-semibold flex items-center gap-1 transition-colors ${
              dataSaver
                ? 'bg-emerald-800 text-white border border-emerald-400'
                : 'bg-emerald-950/60 text-emerald-200 border border-emerald-800'
            }`}
            title="Toggle Data-Saver Mode"
          >
            <span>📶</span>
            <span>{dataSaver ? 'Data-Saver' : 'Standard'}</span>
          </button>

          {/* Network dot */}
          <span
            className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-400 ring-2 ring-emerald-400/30' : 'bg-rose-400 ring-2 ring-rose-400/30'}`}
            title={isOnline ? 'Online' : 'Offline'}
          />
        </div>
      </header>

      {/* Mobile Slide-Over Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Drawer Content */}
          <div className="relative flex-1 flex flex-col max-w-xs w-full bg-slate-900 text-white p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white font-extrabold flex items-center justify-center text-sm shadow">
                  FSS
                </div>
                <div>
                  <div className="font-bold text-sm leading-tight text-white">FSS-IB Ibadan</div>
                  <div className="text-[10px] text-emerald-400 uppercase tracking-wider font-semibold">
                    E-Library & Portal
                  </div>
                </div>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            {/* Links */}
            <div className="flex-1 overflow-y-auto py-4 space-y-1">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-3 py-1">
                Academic Menu
              </div>
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`min-h-[44px] flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    item.active
                      ? 'bg-emerald-800 text-white font-semibold'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <span className="text-base">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              ))}

              {adminItems.length > 0 && (
                <>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-amber-400/90 px-3 pt-4 pb-1">
                    Administration
                  </div>
                  {adminItems.map((item) => (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`min-h-[44px] flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        item.active
                          ? 'bg-emerald-800 text-white font-semibold'
                          : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      <span className="text-base">{item.icon}</span>
                      <span>{item.label}</span>
                    </Link>
                  ))}
                </>
              )}
            </div>

            {/* User profile & Logout */}
            <div className="pt-4 border-t border-slate-800">
              <div className="mb-3 px-1">
                <div className="font-semibold text-sm text-white truncate">{user.full_name}</div>
                <div className="text-xs text-emerald-400 font-medium truncate">{getRoleLabel()}</div>
                {user.matric_no && (
                  <div className="font-mono text-[11px] text-slate-400 mt-0.5">{user.matric_no}</div>
                )}
              </div>
              <button
                onClick={handleLogout}
                className="w-full min-h-[44px] flex items-center justify-center gap-2 bg-slate-800 hover:bg-rose-950/40 text-slate-300 hover:text-rose-300 border border-slate-700 hover:border-rose-800/50 rounded-lg text-xs font-semibold transition-colors"
              >
                <span>🚪</span>
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Desktop Container with Sticky Left Sidebar */}
      <div className="flex-1 flex">
        {/* Desktop Fixed Left Sidebar */}
        <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-[#0F172A] border-r border-slate-800 text-slate-200 z-30">
          {/* Institutional Crest / Header */}
          <div className="h-16 px-6 flex items-center gap-3 border-b border-slate-800 bg-[#0B1120]">
            <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white font-black flex items-center justify-center text-sm shadow-md tracking-wider">
              FSS
            </div>
            <div>
              <div className="font-bold text-sm text-white tracking-tight leading-tight">FSS-IB E-Library</div>
              <div className="text-[10px] text-emerald-400 uppercase tracking-wider font-semibold">
                Federal School of Stats
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-3 mb-2">
                Academic Portal
              </div>
              <nav className="space-y-1">
                {navItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      item.active
                        ? 'bg-emerald-900 text-white font-semibold border-l-4 border-emerald-400 pl-2'
                        : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                    }`}
                  >
                    <span className="text-base">{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                ))}
              </nav>
            </div>

            {adminItems.length > 0 && (
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-400/90 px-3 mb-2 flex items-center gap-1.5">
                  <span>🏛️</span>
                  <span>Institutional Ops</span>
                </div>
                <nav className="space-y-1">
                  {adminItems.map((item) => (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                        item.active
                          ? 'bg-emerald-900 text-white font-semibold border-l-4 border-emerald-400 pl-2'
                          : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                      }`}
                    >
                      <span className="text-base">{item.icon}</span>
                      <span>{item.label}</span>
                    </Link>
                  ))}
                </nav>
              </div>
            )}

            {/* Quick Status Bar inside Sidebar */}
            <div className="px-3 py-3 rounded-lg bg-slate-900/90 border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium">Connectivity</span>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-200">
                  <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400 ring-2 ring-emerald-400/30' : 'bg-rose-400 ring-2 ring-rose-400/30'}`} />
                  {isOnline ? 'Online' : 'Offline Mode'}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800">
                <span className="text-slate-400 font-medium">Bandwidth</span>
                <button
                  onClick={toggleDataSaver}
                  className={`text-[11px] px-2 py-0.5 rounded font-semibold transition-colors ${
                    dataSaver
                      ? 'bg-emerald-900 text-emerald-300 border border-emerald-500'
                      : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'
                  }`}
                  title={dataSaver ? 'Click to disable Data-Saver' : 'Click to enable Data-Saver'}
                >
                  📶 {dataSaver ? 'Data-Saver: ON' : 'Standard'}
                </button>
              </div>
            </div>
          </div>

          {/* User Profile Card at Bottom */}
          <div className="p-3 border-t border-slate-800 bg-[#0B1120]">
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="min-w-0">
                  <div className="font-semibold text-xs text-white truncate leading-snug">
                    {user.full_name}
                  </div>
                  <div className="text-[11px] text-emerald-400 font-medium truncate mt-0.5">
                    {getRoleLabel()}
                  </div>
                </div>

                <button
                  onClick={handleLogout}
                  title="Sign out of portal"
                  className="text-slate-400 hover:text-rose-400 p-1 rounded hover:bg-slate-800 transition-colors"
                  aria-label="Logout"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </button>
              </div>

              {user.matric_no && (
                <div className="font-mono text-[11px] text-slate-400 bg-slate-950/60 px-2 py-0.5 rounded border border-slate-800/80 truncate">
                  {user.matric_no}
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Main Content Pane (pushed right by 16rem / 64 on desktop) */}
        <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
          <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
            {children}
          </main>

          <footer className="border-t border-slate-200 bg-white py-5 px-6 text-center text-xs text-slate-500">
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
              <div>
                Federal School of Statistics, Ibadan (FSS-IB) · Academic E-Learning & Library System
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                PWA Active · Offline Cache Ready
              </div>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
};
