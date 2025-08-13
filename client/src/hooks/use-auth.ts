import React, { useState, useEffect, createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { User, AuthState } from '@/types';
import { apiRequest } from '@/lib/api';

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  registerClinic: (data: {
    clinicName: string;
    clinicEmail: string;
    adminName: string;
    adminEmail: string;
    password: string;
  }) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    token: null,
    isAuthenticated: false,
  });

  useEffect(() => {
    const token = localStorage.getItem('dental_token');
    const user = localStorage.getItem('dental_user');
    
    if (token && user) {
      setAuthState({
        token,
        user: JSON.parse(user),
        isAuthenticated: true,
      });
    }
  }, []);

  const login = async (email: string, password: string) => {
    const response = await apiRequest('POST', '/api/auth/login', {
      email,
      password,
    });

    const data = await response.json();
    
    localStorage.setItem('dental_token', data.token);
    localStorage.setItem('dental_user', JSON.stringify(data.user));
    
    setAuthState({
      token: data.token,
      user: data.user,
      isAuthenticated: true,
    });
  };

  const registerClinic = async (registerData: {
    clinicName: string;
    clinicEmail: string;
    adminName: string;
    adminEmail: string;
    password: string;
  }) => {
    const response = await apiRequest('POST', '/api/auth/register-clinic', registerData);

    const data = await response.json();
    
    localStorage.setItem('dental_token', data.token);
    localStorage.setItem('dental_user', JSON.stringify(data.user));
    
    setAuthState({
      token: data.token,
      user: data.user,
      isAuthenticated: true,
    });
  };

  const logout = () => {
    localStorage.removeItem('dental_token');
    localStorage.removeItem('dental_user');
    setAuthState({
      user: null,
      token: null,
      isAuthenticated: false,
    });
  };

  return React.createElement(AuthContext.Provider, {
    value: {
      ...authState,
      login,
      logout,
      registerClinic
    }
  }, children);
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};