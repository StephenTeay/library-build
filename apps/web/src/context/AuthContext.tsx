import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User } from '../types';
import { api } from '../services/api';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  mustChangePassword: boolean;
  login: (identifier: string, password: string, rememberMe?: boolean) => Promise<User>;
  logout: () => Promise<void>;
  updatePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  mustChangePassword: false,
  login: async () => { throw new Error('Not implemented'); },
  logout: async () => {},
  updatePassword: async () => {},
  checkAuth: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [mustChangePassword, setMustChangePassword] = useState<boolean>(false);

  const normalizeUser = (u: any): User => {
    const mustChange = Boolean(u.must_change_password || u.mustChangePassword);
    return {
      id: u.id,
      email: u.email,
      matric_no: u.matric_no || u.matricNo || null,
      full_name: u.full_name || u.fullName || '',
      role: u.role,
      department_id: u.department_id || u.departmentId || null,
      department_name: u.department_name || null,
      department_code: u.department_code || null,
      programme: u.programme || null,
      level: u.level || null,
      status: u.status || 'ACTIVE',
      must_change_password: mustChange,
    };
  };

  const checkAuth = useCallback(async () => {
    try {
      const res = await api.get<{ user: any }>('/auth/me');
      if (res && res.user) {
        const normalized = normalizeUser(res.user);
        setUser(normalized);
        setMustChangePassword(Boolean(normalized.must_change_password));
      } else {
        setUser(null);
        setMustChangePassword(false);
      }
    } catch (err: any) {
      if (err.code === 'PASSWORD_CHANGE_REQUIRED') {
        setMustChangePassword(true);
      } else {
        setUser(null);
        setMustChangePassword(false);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    return api.subscribePasswordChangeRequired(() => {
      setMustChangePassword(true);
      setUser((prev) => (prev ? { ...prev, must_change_password: true } : prev));
    });
  }, []);

  const login = async (identifier: string, password: string, rememberMe = false): Promise<User> => {
    const res = await api.post<{ user: any; message: string }>('/auth/login', {
      identifier,
      password,
      remember_me: rememberMe,
    });

    const normalized = normalizeUser(res.user);
    setUser(normalized);
    setMustChangePassword(Boolean(normalized.must_change_password));
    return normalized;
  };

  const logout = async (): Promise<void> => {
    try {
      await api.post('/auth/logout');
    } catch (err) {
      console.warn('Logout request failed', err);
    } finally {
      setUser(null);
      setMustChangePassword(false);
    }
  };

  const updatePassword = async (currentPassword: string, newPassword: string): Promise<void> => {
    await api.post('/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    });
    setMustChangePassword(false);
    if (user) {
      setUser({ ...user, must_change_password: false });
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        mustChangePassword,
        login,
        logout,
        updatePassword,
        checkAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

