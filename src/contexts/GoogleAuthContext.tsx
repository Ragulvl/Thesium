/* eslint-disable react-refresh/only-export-components */
// v3: httpOnly cookie auth.
//   On login: sends Google credential to POST /api/auth/session (backend sets httpOnly cookie)
//   On init:  calls GET /api/auth/me to restore session (cookie sent automatically)
//   All API requests use credentials: 'include' so the browser sends the cookie
//   No sensitive token is stored in localStorage or accessible to JavaScript
import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { logger } from '../utils/logger';
import { jwtDecode } from 'jwt-decode';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export interface GoogleUser {
  id: string;
  email: string;
  name: string;
  picture: string;
  role: string;
  tier?: string;
}

interface AuthContextType {
  user: GoogleUser | null;
  login: (credential: string) => Promise<void>;
  logout: () => Promise<void>;
  /** @deprecated — returns null (no token in JS). Use credentials:'include' on all fetches. */
  getToken: () => null;
  loading: boolean;
  refreshing: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  login: async () => {},
  logout: async () => {},
  getToken: () => null,
  loading: true,
  refreshing: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Silent Re-auth via Google One Tap ───────────────────────────
  const triggerSilentReauth = useCallback((): Promise<string | null> => {
    return new Promise((resolve) => {
      if (!window.google?.accounts?.id) {
        logger.warn('Google Identity Services not loaded — cannot refresh token silently');
        resolve(null);
        return;
      }
      setRefreshing(true);
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: (response: { credential: string }) => {
          setRefreshing(false);
          resolve(response.credential ? response.credential : null);
        },
        auto_select: true,
      });
      window.google.accounts.id.prompt((notification: any) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          setRefreshing(false);
          logger.warn('Silent re-auth not displayed or skipped');
          resolve(null);
        }
      });
      setTimeout(() => { setRefreshing(false); resolve(null); }, 10_000);
    });
  }, []);

  // ── Restore session from backend on page load ────────────────────
  useEffect(() => {
    const restore = async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (res.ok) {
          const profile = await res.json();
          setUser(profile);

          // Start a periodic check — if /api/auth/me returns 401, trigger re-auth
          if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
          refreshTimerRef.current = setInterval(async () => {
            const check = await fetch('/api/auth/me', { credentials: 'include' }).catch(() => null);
            if (!check || check.status === 401) {
              logger.info('Session expired — attempting silent re-auth');
              const newCred = await triggerSilentReauth();
              if (newCred) {
                // Re-establish cookie with fresh credential
                const refreshRes = await fetch('/api/auth/session', {
                  method: 'POST',
                  credentials: 'include',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ credential: newCred }),
                });
                if (refreshRes.ok) {
                  const refreshed = await refreshRes.json();
                  setUser(refreshed);
                } else {
                  setUser(null);
                }
              } else {
                setUser(null);
              }
            }
          }, 5 * 60 * 1000); // Check every 5 minutes
        }
      } catch (e) {
        logger.warn({ err: e }, 'Session restore failed — user not authenticated');
      } finally {
        setLoading(false);
      }
    };
    restore();
    return () => { if (refreshTimerRef.current) clearInterval(refreshTimerRef.current); };
  }, [triggerSilentReauth]);

  // ── Login ───────────────────────────────────────────────────────
  const login = async (credential: string) => {
    try {
      // Decode locally ONLY for display (sub, name, email, picture)
      const decoded = jwtDecode<{ email: string; name: string; picture: string; sub: string }>(credential);
      logger.info({ email: decoded.email }, 'Logging in');

      // Send to backend — backend verifies and sets httpOnly cookie
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential }),
      });

      if (!res.ok) {
        const { error } = await res.json().catch(() => ({}));
        throw new Error(error || 'Login failed');
      }

      const profile = await res.json();
      setUser(profile);
    } catch (e) {
      logger.error({ err: e }, 'Login failed');
      throw e;
    }
  };

  // ── Logout ──────────────────────────────────────────────────────
  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    setUser(null);
    if (refreshTimerRef.current) { clearInterval(refreshTimerRef.current); refreshTimerRef.current = null; }
    if (window.google?.accounts?.id) window.google.accounts.id.disableAutoSelect();
  };

  // getToken is kept for backward compat with any components that call it
  // Returns null — callers should use credentials:'include' instead
  const getToken = () => null;

  return (
    <AuthContext.Provider value={{ user, login, logout, getToken, loading, refreshing }}>
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
