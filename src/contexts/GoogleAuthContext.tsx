import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { logger } from '../utils/logger';
import { jwtDecode } from 'jwt-decode';

export interface GoogleUser {
  email: string;
  name: string;
  picture: string;
  sub: string;
}

interface AuthContextType {
  user: GoogleUser | null;
  login: (credential: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  login: async () => {},
  logout: () => {},
  loading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('thesium_google_token');
    if (token) {
      try {
        const decoded = jwtDecode<GoogleUser>(token);
        setUser(decoded);

        // Sync with backend on fresh load
        fetch('http://localhost:3001/api/users/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: decoded.sub,
            email: decoded.email,
            name: decoded.name,
            picture: decoded.picture
          })
        }).catch(e => logger.error({ err: e }, "Failed to sync user via token"));
      } catch (e) {
        localStorage.removeItem('thesium_google_token');
      }
    }
    setLoading(false);
  }, []);

  const login = async (credential: string) => {
    try {
      const decoded = jwtDecode<GoogleUser>(credential);
      localStorage.setItem('thesium_google_token', credential);
      setUser(decoded);

      // Sync user with the Neon database upon explicit login
      await fetch('http://localhost:3001/api/users/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: decoded.sub,
          email: decoded.email,
          name: decoded.name,
          picture: decoded.picture
        })
      });
    } catch (e) {
      logger.error({ err: e }, 'Failed to decode JWT or sync user');
    }
  };

  const logout = () => {
    localStorage.removeItem('thesium_google_token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useGoogleAuth = () => useContext(AuthContext);
