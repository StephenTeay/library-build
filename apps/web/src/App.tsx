import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SettingsProvider } from './context/SettingsContext';
import { OfflineProvider } from './context/OfflineContext';
import { AuthProvider, useAuth } from './context/AuthContext';

import { AppShell } from './components/AppShell';

import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { VerifyEmail } from './pages/VerifyEmail';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import { Dashboard } from './pages/Dashboard';
import { CourseView } from './pages/CourseView';
import { PhysicalLibrary } from './pages/PhysicalLibrary';
import { OpenResources } from './pages/OpenResources';
import { InstitutionalRepository } from './pages/InstitutionalRepository';
import { ApprovalQueue } from './pages/ApprovalQueue';
import { CsvImport } from './pages/CsvImport';
import { StaffManagement } from './pages/StaffManagement';
import { StudentDirectory } from './pages/StudentDirectory';
import { BookImport } from './pages/BookImport';

// Protected Route Component
const ProtectedRoute: React.FC<{ children: React.ReactNode; allowedRoles?: string[] }> = ({
  children,
  allowedRoles,
}) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white border border-slate-200 rounded-xl p-8 max-w-sm w-full text-center shadow-xs space-y-4 animate-pulse">
          <div className="w-12 h-12 bg-emerald-900/20 text-emerald-900 rounded-xl mx-auto flex items-center justify-center font-bold text-sm">
            FSS
          </div>
          <div className="h-5 w-3/4 bg-slate-200 rounded mx-auto"></div>
          <div className="h-3 w-1/2 bg-slate-200 rounded mx-auto"></div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

// Main App Layout
const AppContent: React.FC = () => {
  return (
    <AppShell>
      <Routes>
        {/* Public Auth Routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Protected Student & Faculty Routes */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/course/:id"
          element={
            <ProtectedRoute>
              <CourseView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/library"
          element={
            <ProtectedRoute>
              <PhysicalLibrary />
            </ProtectedRoute>
          }
        />
        <Route
          path="/open-resources"
          element={
            <ProtectedRoute>
              <OpenResources />
            </ProtectedRoute>
          }
        />
        <Route
          path="/repository"
          element={
            <ProtectedRoute>
              <InstitutionalRepository />
            </ProtectedRoute>
          }
        />

        {/* Protected Staff Approvals Queue */}
        <Route
          path="/admin/approvals"
          element={
            <ProtectedRoute allowedRoles={['LIBRARIAN', 'REGISTRAR', 'HOD', 'LEVEL_COORDINATOR']}>
              <ApprovalQueue />
            </ProtectedRoute>
          }
        />

        {/* Protected Student Directory */}
        <Route
          path="/admin/students"
          element={
            <ProtectedRoute allowedRoles={['LIBRARIAN', 'REGISTRAR', 'HOD', 'LEVEL_COORDINATOR']}>
              <StudentDirectory />
            </ProtectedRoute>
          }
        />

        {/* Protected Staff Management (Librarian / Super Admin) */}
        <Route
          path="/admin/staff"
          element={
            <ProtectedRoute allowedRoles={['LIBRARIAN', 'REGISTRAR']}>
              <StaffManagement />
            </ProtectedRoute>
          }
        />

        {/* Protected Bulk Book Catalog Importer */}
        <Route
          path="/admin/books/import"
          element={
            <ProtectedRoute allowedRoles={['LIBRARIAN', 'REGISTRAR', 'LIBRARY_STAFF']}>
              <BookImport />
            </ProtectedRoute>
          }
        />

        {/* Protected Registrar/Librarian Student CSV Importer */}
        <Route
          path="/admin/import"
          element={
            <ProtectedRoute allowedRoles={['LIBRARIAN', 'REGISTRAR']}>
              <CsvImport />
            </ProtectedRoute>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
};

export default function App() {
  return (
    <SettingsProvider>
      <OfflineProvider>
        <AuthProvider>
          <BrowserRouter>
            <AppContent />
          </BrowserRouter>
        </AuthProvider>
      </OfflineProvider>
    </SettingsProvider>
  );
}
