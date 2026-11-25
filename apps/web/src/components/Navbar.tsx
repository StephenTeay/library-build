import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useOffline } from '../context/OfflineContext';

export const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const { dataSaver, toggleDataSaver } = useSettings();
  const { isOnline } = useOffline();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const isSuperAdmin = user && (user.role === 'LIBRARIAN' || user.role === 'REGISTRAR');
  const isLibraryStaff = isSuperAdmin || user?.role === 'LIBRARY_STAFF';
  const isStaff = user && ['LIBRARIAN', 'REGISTRAR', 'HOD', 'LEVEL_COORDINATOR'].includes(user.role);

  return (
    <header
      style={{
        backgroundColor: '#0f766e',
        color: '#ffffff',
        borderBottom: '1px solid #115e59',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        position: 'sticky',
        top: 0,
        zIndex: 40,
      }}
    >
      <div
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '0.75rem 1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        {/* Brand / Logo */}
        <Link
          to="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.625rem',
            color: '#ffffff',
            textDecoration: 'none',
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              color: '#0f766e',
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '1.125rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }}
          >
            FSS
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem', letterSpacing: '-0.025em', lineHeight: 1.2 }}>
              FSS-IB Portal
            </div>
            <div style={{ fontSize: '0.6875rem', color: '#ccfbf1', letterSpacing: '0.025em' }}>
              Federal School of Statistics, Ibadan
            </div>
          </div>
        </Link>

        {/* Navigation Links */}
        {user && (
          <nav style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Link
              to="/"
              style={{
                color: '#f0fdfa',
                textDecoration: 'none',
                padding: '0.375rem 0.75rem',
                borderRadius: '6px',
                fontSize: '0.875rem',
                fontWeight: 500,
                transition: 'background-color 0.15s',
              }}
            >
              Dashboard
            </Link>

            <Link
              to="/library"
              style={{
                color: '#f0fdfa',
                textDecoration: 'none',
                padding: '0.375rem 0.75rem',
                borderRadius: '6px',
                fontSize: '0.875rem',
                fontWeight: 500,
              }}
            >
              Library Catalog
            </Link>

            <Link
              to="/open-resources"
              style={{
                color: '#f0fdfa',
                textDecoration: 'none',
                padding: '0.375rem 0.75rem',
                borderRadius: '6px',
                fontSize: '0.875rem',
                fontWeight: 500,
              }}
            >
              Research & Books
            </Link>

            <Link
              to="/repository"
              style={{
                color: '#f0fdfa',
                textDecoration: 'none',
                padding: '0.375rem 0.75rem',
                borderRadius: '6px',
                fontSize: '0.875rem',
                fontWeight: 500,
              }}
            >
              Theses & Projects
            </Link>

            {isStaff && (
              <Link
                to="/admin/students"
                style={{
                  color: '#fef08a',
                  textDecoration: 'none',
                  padding: '0.375rem 0.75rem',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                }}
              >
                Students
              </Link>
            )}

            {isStaff && (
              <Link
                to="/admin/approvals"
                style={{
                  color: '#fef08a',
                  textDecoration: 'none',
                  padding: '0.375rem 0.75rem',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                }}
              >
                Approvals Queue
              </Link>
            )}

            {isSuperAdmin && (
              <Link
                to="/admin/staff"
                style={{
                  color: '#fef08a',
                  textDecoration: 'none',
                  padding: '0.375rem 0.75rem',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                }}
              >
                Manage Staff
              </Link>
            )}

            {isLibraryStaff && (
              <Link
                to="/admin/books/import"
                style={{
                  color: '#fef08a',
                  textDecoration: 'none',
                  padding: '0.375rem 0.75rem',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                }}
              >
                Import Books
              </Link>
            )}

            {isSuperAdmin && (
              <Link
                to="/admin/import"
                style={{
                  color: '#fef08a',
                  textDecoration: 'none',
                  padding: '0.375rem 0.75rem',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                }}
              >
                Student CSV
              </Link>
            )}
          </nav>
        )}

        {/* Right Controls: Data-Saver, Online Status, User Profile */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* Data-Saver Toggle Button */}
          <button
            onClick={toggleDataSaver}
            title={dataSaver ? 'Data-Saver is ON: Embeds and large images are suppressed' : 'Click to turn ON Data-Saver mode'}
            style={{
              backgroundColor: dataSaver ? '#134e4a' : 'rgba(255, 255, 255, 0.15)',
              border: dataSaver ? '1px solid #2dd4bf' : '1px solid rgba(255,255,255,0.2)',
              color: '#ffffff',
              padding: '0.3125rem 0.625rem',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
              cursor: 'pointer',
            }}
          >
            <span>📶</span>
            <span>Data-Saver: {dataSaver ? 'ON' : 'OFF'}</span>
          </button>

          {/* Network Status Badge */}
          <div
            title={isOnline ? 'Online: Live connection to portal' : 'Offline: Serving cached materials from device'}
            style={{
              backgroundColor: isOnline ? '#14532d' : '#7f1d1d',
              border: `1px solid ${isOnline ? '#4ade80' : '#f87171'}`,
              color: '#ffffff',
              padding: '0.25rem 0.5rem',
              borderRadius: '9999px',
              fontSize: '0.6875rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: isOnline ? '#4ade80' : '#f87171',
              }}
            />
            <span>{isOnline ? 'Online' : 'Offline'}</span>
          </div>

          {/* User Menu */}
          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.8125rem', fontWeight: 600, lineHeight: 1.2 }}>
                  {user.full_name}
                </div>
                <div style={{ fontSize: '0.6875rem', color: '#99f6e4' }}>
                  {user.role === 'LIBRARIAN' ? 'Librarian (Admin)' : user.role === 'LIBRARY_STAFF' ? 'Library Staff' : user.role} {user.department_code ? `· ${user.department_code}` : ''}
                </div>
              </div>

              <button
                onClick={handleLogout}
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  color: '#ffffff',
                  border: '1px solid rgba(255, 255, 255, 0.25)',
                  padding: '0.3125rem 0.625rem',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                Logout
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              style={{
                backgroundColor: '#ffffff',
                color: '#0f766e',
                textDecoration: 'none',
                padding: '0.375rem 0.875rem',
                borderRadius: '6px',
                fontSize: '0.8125rem',
                fontWeight: 600,
              }}
            >
              Sign In
            </Link>
          )}
        </div>
      </div>
    </header>
  );
};
