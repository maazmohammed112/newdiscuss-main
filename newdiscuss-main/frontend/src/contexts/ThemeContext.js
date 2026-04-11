import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('discuss_theme') || 'light';
    // Migrate old discuss-dark to discuss-light
    return saved === 'discuss-dark' ? 'discuss-light' : saved;
  });

  useEffect(() => {
    const root = document.documentElement;
    // Remove all theme classes (including new discuss-black)
    root.classList.remove('dark', 'discuss', 'discuss-light', 'discuss-black');

    if (theme === 'dark') {
      root.classList.add('dark');
    } else if (theme === 'discuss-light') {
      root.classList.add('discuss', 'discuss-light');
    } else if (theme === 'discuss-black') {
      root.classList.add('discuss-black');
    }
    // 'light' = no extra class (default)

    localStorage.setItem('discuss_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const changeTheme = (newTheme) => {
    setTheme(newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, changeTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
