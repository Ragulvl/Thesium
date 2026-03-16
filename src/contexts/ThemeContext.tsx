import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export type Theme = 'Dark (Premium)' | 'Light' | 'System Theme';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem('thesium-theme') as Theme) || 'Dark (Premium)';
  });

  useEffect(() => {
    localStorage.setItem('thesium-theme', theme);

    const applyTheme = (t: Theme) => {
      const root = document.documentElement;
      if (t === 'Light') {
        root.classList.remove('dark');
        root.setAttribute('data-theme', 'light');
      } else if (t === 'Dark (Premium)') {
        root.classList.add('dark');
        root.removeAttribute('data-theme');
      } else if (t === 'System Theme') {
        const isLight = window.matchMedia('(prefers-color-scheme: light)').matches;
        if (isLight) {
          root.classList.remove('dark');
          root.setAttribute('data-theme', 'light');
        } else {
          root.classList.add('dark');
          root.removeAttribute('data-theme');
        }
      }
    };

    applyTheme(theme);

    if (theme === 'System Theme') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
      const handler = (e: MediaQueryListEvent) => {
        if (e.matches) {
          document.documentElement.classList.remove('dark');
          document.documentElement.setAttribute('data-theme', 'light');
        } else {
          document.documentElement.classList.add('dark');
          document.documentElement.removeAttribute('data-theme');
        }
      };
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    }
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
