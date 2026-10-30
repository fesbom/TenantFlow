import React, { useState, createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { User, AuthState } from '@/types';
import { apiRequest } from '@/lib/api';

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  updateCurrentUser: (updates: Pick<User, 'fullName' | 'email'>) => void;
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
  // Lê o localStorage de forma síncrona no estado inicial. Ler num useEffect criava uma
  // condição de corrida: no 1º render isAuthenticated=false fazia o ProtectedRoute montar
  // o <Login/>, que disparava fetches públicos sem token (401) e derrubava a sessão.
  const [authState, setAuthState] = useState<AuthState>(() => {
    try {
      const token = localStorage.getItem('dental_token');
      const user = localStorage.getItem('dental_user');
      if (token && user) {
        return { token, user: JSON.parse(user), isAuthenticated: true };
      }
    } catch {
      // JSON inválido ou storage indisponível: segue deslogado
    }
    return { user: null, token: null, isAuthenticated: false };
  });

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

  const updateCurrentUser = (updates: Pick<User, 'fullName' | 'email'>) => {
    setAuthState((current) => {
      if (!current.user) return current;
      const user = { ...current.user, ...updates };
      localStorage.setItem('dental_user', JSON.stringify(user));
      return { ...current, user };
    });
  };

  return React.createElement(AuthContext.Provider, {
    value: {
      ...authState,
      login,
      logout,
      updateCurrentUser,
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