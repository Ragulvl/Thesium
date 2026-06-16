/* eslint-disable react-refresh/only-export-components */
// Why: Added token auto-refresh (45min timer), expiry detection, authenticatedFetch with 401 retry.
import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { logger } from '../utils/logger';
import { jwtDecode } from 'jwt-decode';

const TOKEN_KEY = 'thesium_google_token';
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

/** How often to check token expiry (ms) */
const REFRESH_CHECK_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes
/** Refresh token this far before expiry (ms) */
const REFRESH_BUFFER_MS = 10 * 60 * 1000; // 10 minutes before expiry

export interface GoogleUser {
  email: string;
  name: string;
  picture: string;
  sub: string;
  exp?: number;
}

interface AuthContextType {
  user: GoogleUser | null;
  login: (credential: string) => Promise<void>;
  logout: () => void;
  getToken: () => string | null;
  /** Wrapper for fetch that auto-attaches auth header and retries on 401 */
  authenticatedFetch: (url: string, options?: RequestInit) => Promise<Response>;
  loading: boolean;
  /** True when a silent re-auth is in progress */
  refreshing: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  login: async () => {},
  logout: () => {},
  getToken: () => null,
  authenticatedFetch: () => Promise.reject(new Error('AuthContext not initialized')),
  loading: true,
  refreshing: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Helpers ──────────────────────────────────────────────────────
  const clearAuth = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const isTokenExpired = useCallback((token: string): boolean => {
    try {
      const decoded = jwtDecode<GoogleUser>(token);
      if (!decoded.exp) return false;
      // Expired if within the buffer window
      return decoded.exp * 1000 < Date.now() + REFRESH_BUFFER_MS;
    } catch {
      return true;
    }
  }, []);

  const getTimeUntilExpiry = useCallback((token: string): number => {
    try {
      const decoded = jwtDecode<GoogleUser>(token);
      if (!decoded.exp) return Infinity;
      return decoded.exp * 1000 - Date.now();
    } catch {
      return 0;
    }
  }, []);

  // ── Silent Re-auth via Google One Tap ───────────────────────────
  const triggerSilentReauth = useCallback((): Promise<string | null> => {
    return new Promise((resolve) => {
      if (!window.google?.accounts?.id) {
        logger.warn('Google Identity Services not loaded — cannot refresh token silently');
        resolve(null);
        return;
      }

      setRefreshing(true);

      // Initialize with auto_select to try silent sign-in
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: (response: { credential: string }) => {
          setRefreshing(false);
          if (response.credential) {
            // Update stored token and user
            localStorage.setItem(TOKEN_KEY, response.credential);
            const decoded = jwtDecode<GoogleUser>(response.credential);
            setUser(decoded);
            logger.info('Token silently refreshed');
            resolve(response.credential);
          } else {
            resolve(null);
          }
        },
        auto_select: true,
      });

      // Trigger the One Tap prompt (auto_select will try silent if user previously consented)
      window.google.accounts.id.prompt((notification: any) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          setRefreshing(false);
          logger.warn({ reason: notification.getNotDisplayedReason?.() || notification.getSkippedReason?.() },
            'Silent re-auth failed — user may need to re-login');
          resolve(null);
        }
      });

      // Timeout: if things get stuck, resolve null after 10s
      setTimeout(() => {
        setRefreshing(false);
        resolve(null);
      }, 10_000);
    });
  }, []);

  // ── Auto-Refresh Timer ──────────────────────────────────────────
  const startRefreshTimer = useCallback(() => {
    // Clear any existing timer
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);

    refreshTimerRef.current = setInterval(async () => {
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) return;

      const timeLeft = getTimeUntilExpiry(token);
      logger.info({ timeLeftMin: Math.round(timeLeft / 60000) }, 'Token refresh check');

      if (timeLeft < REFRESH_BUFFER_MS) {
        logger.info('Token expiring soon — attempting silent refresh');
        const newToken = await triggerSilentReauth();
        if (!newToken) {
          logger.warn('Silent refresh failed — token will expire. User needs to re-login.');
        }
      }
    }, REFRESH_CHECK_INTERVAL_MS);
  }, [getTimeUntilExpiry, triggerSilentReauth]);

  // ── Init: Restore session from localStorage ─────────────────────
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      try {
        if (isTokenExpired(token)) {
          throw new Error('Token has expired');
        }

        const decoded = jwtDecode<GoogleUser>(token);
        setUser(decoded);
        startRefreshTimer();

        // Sync with backend on fresh load
        fetch('/api/users/sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        }).then(res => {
          if (!res.ok && (res.status === 401 || res.status === 403)) {
            clearAuth();
          }
        }).catch(e => logger.error({ err: e }, 'Failed to sync user via token'));
      } catch {
        clearAuth();
      }
    }
    setLoading(false);
  }, [isTokenExpired, clearAuth, startRefreshTimer]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, []);

  // ── Login ───────────────────────────────────────────────────────
  const login = async (credential: string) => {
    try {
      const decoded = jwtDecode<GoogleUser>(credential);
      localStorage.setItem(TOKEN_KEY, credential);
      setUser(decoded);
      startRefreshTimer();

      // Sync user with database
      await fetch('/api/users/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${credential}`
        }
      });
    } catch (e) {
      logger.error({ err: e }, 'Failed to decode JWT or sync user');
    }
  };

  // ── Logout ──────────────────────────────────────────────────────
  const logout = () => {
    clearAuth();
    // Also revoke Google session
    if (window.google?.accounts?.id) {
      window.google.accounts.id.disableAutoSelect();
    }
  };

  // ── Get Token ───────────────────────────────────────────────────
  const getToken = () => localStorage.getItem(TOKEN_KEY);

  // ── Authenticated Fetch (401 retry) ─────────────────────────────
  const authenticatedFetch = useCallback(async (url: string, options: RequestInit = {}): Promise<Response> => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) throw new Error('Not authenticated');

    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${token}`);

    const response = await fetch(url, { ...options, headers });

    // If 401, attempt silent refresh and retry once
    if (response.status === 401) {
      logger.info('Got 401 — attempting silent token refresh');
      const newToken = await triggerSilentReauth();

      if (newToken) {
        const retryHeaders = new Headers(options.headers);
        retryHeaders.set('Authorization', `Bearer ${newToken}`);
        return fetch(url, { ...options, headers: retryHeaders });
      } else {
        // Refresh failed — clear auth and throw
        clearAuth();
        throw new Error('Session expired. Please log in again.');
      }
    }

    return response;
  }, [triggerSilentReauth, clearAuth]);

  return (
    <AuthContext.Provider value={{ user, login, logout, getToken, authenticatedFetch, loading, refreshing }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useGoogleAuth = () => useContext(AuthContext);

// ── Type declarations for Google Identity Services ────────────────
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: any) => void;
          prompt: (callback?: (notification: any) => void) => void;
          disableAutoSelect: () => void;
          renderButton: (parent: HTMLElement, options: any) => void;
        };
      };
    };
  }
}
