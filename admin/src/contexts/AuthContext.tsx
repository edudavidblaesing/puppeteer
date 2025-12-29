'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';

interface User {
  id: number;
  username: string;
  role: 'superadmin' | 'admin';
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  networkError: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://pptr.davidblaesing.com';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [networkError, setNetworkError] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  // Check auth status on mount
  useEffect(() => {
    checkAuth();
  }, []);

  // Redirect to login if not authenticated and no network error
  useEffect(() => {
    if (!isLoading && !user && !networkError && pathname !== '/login') {
      router.push('/login');
    }
  }, [user, isLoading, networkError, pathname, router]);

  // Listen for 401 Unauthorized events from api.ts
  useEffect(() => {
    const handleUnauthorized = () => {
      logout();
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, []);

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      if (!token) {
        setIsLoading(false);
        return;
      }

      const response = await fetch(`${API_URL}/auth/check`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        setNetworkError(false);
      } else if (response.status === 401 || response.status === 403) {
        // Only clear token and user on explicit auth failure
        localStorage.removeItem('admin_token');
        setUser(null);
      } else {
        // Handle 5xx or other non-auth errors as network/server errors
        setNetworkError(true);
        console.error('Server error during auth check:', response.status);
      }
    } catch (error) {
      // Handle network connectivity errors
      console.error('Auth check failed:', error);
      setNetworkError(true);
      // Do NOT clear token on network error
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (username: string, password: string) => {
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Login failed' }));
        throw new Error(error.error || 'Login failed');
      }

      const data = await response.json();
      localStorage.setItem('admin_token', data.token);
      setUser(data.user);
      setNetworkError(false);
      router.push('/');
    } catch (error) {
      throw error;
    }
  };

  const logout = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      if (token && !networkError) { // Only try to call logout API if network is okay
        await fetch(`${API_URL}/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }).catch(() => { }); // Ignore errors
      }
    } finally {
      localStorage.removeItem('admin_token');
      setUser(null);
      setNetworkError(false);
      router.push('/login');
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, networkError, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
