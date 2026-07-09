import React, { createContext, useState, useEffect } from 'react';

interface ThemeContextType {
  currentTheme: string;
  switchTheme: (themeName: string) => void;
  theme: typeof themes[keyof typeof themes];
}

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const themes = {
  blue: {
    name: 'Blue',
    primary: 'from-blue-900 to-blue-800',
    accent: 'blue-600',
    accentLight: 'blue-100',
    accentDark: 'blue-500',
    hover: 'hover:bg-blue-700',
    border: 'border-blue-700',
    text: 'text-blue-100',
    textDark: 'text-blue-600',
    bg: 'bg-blue',
  },
  purple: {
    name: 'Purple',
    primary: 'from-purple-900 to-purple-800',
    accent: 'purple-600',
    accentLight: 'purple-100',
    accentDark: 'purple-500',
    hover: 'hover:bg-purple-700',
    border: 'border-purple-700',
    text: 'text-purple-100',
    textDark: 'text-purple-600',
    bg: 'bg-purple',
  },
  indigo: {
    name: 'Indigo',
    primary: 'from-indigo-900 to-indigo-800',
    accent: 'indigo-600',
    accentLight: 'indigo-100',
    accentDark: 'indigo-500',
    hover: 'hover:bg-indigo-700',
    border: 'border-indigo-700',
    text: 'text-indigo-100',
    textDark: 'text-indigo-600',
    bg: 'bg-indigo',
  },
  slate: {
    name: 'Slate',
    primary: 'from-slate-900 to-slate-800',
    accent: 'slate-600',
    accentLight: 'slate-100',
    accentDark: 'slate-500',
    hover: 'hover:bg-slate-700',
    border: 'border-slate-700',
    text: 'text-slate-100',
    textDark: 'text-slate-600',
    bg: 'bg-slate',
  },
  green: {
    name: 'Green',
    primary: 'from-green-900 to-green-800',
    accent: 'green-600',
    accentLight: 'green-100',
    accentDark: 'green-500',
    hover: 'hover:bg-green-700',
    border: 'border-green-700',
    text: 'text-green-100',
    textDark: 'text-green-600',
    bg: 'bg-green',
  },
};

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [currentTheme, setCurrentTheme] = useState<string>('slate');
  const themeMap = themes as Record<string, typeof themes[keyof typeof themes]>;

  // Load theme from localStorage on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('v-rec-theme');
    if (savedTheme && themeMap[savedTheme]) {
      setCurrentTheme(savedTheme);
    }
  }, []);

  // Save theme to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('v-rec-theme', currentTheme);
  }, [currentTheme]);

  const switchTheme = (themeName: string) => {
    if (themeMap[themeName]) {
      setCurrentTheme(themeName);
    }
  };

  return (
    <ThemeContext.Provider value={{ currentTheme, switchTheme, theme: themeMap[currentTheme] }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = React.useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};
