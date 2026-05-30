import React, { useState } from 'react';
import { Palette } from 'lucide-react';
import { useTheme, themes } from '../context/ThemeContext';

const ThemeSwitcher = () => {
  const { currentTheme, switchTheme } = useTheme();
  const [showDropdown, setShowDropdown] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors duration-200 hover:text-blue-600"
        title="Change Theme"
      >
        <Palette size={20} />
      </button>

      {showDropdown && (
        <div className="absolute right-0 top-12 w-48 bg-white rounded-lg shadow-xl border border-gray-200 z-50">
          <div className="p-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-700">Choose Theme</p>
          </div>
          <div className="p-2 space-y-1">
            {Object.entries(themes).map(([key, theme]) => (
              <button
                key={key}
                onClick={() => {
                  switchTheme(key);
                  setShowDropdown(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 text-sm ${
                  currentTheme === key
                    ? `bg-${theme.accent} text-white font-semibold`
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-gradient-to-br ${theme.primary}`}
                />
                <span>{theme.name}</span>
                {currentTheme === key && <span className="ml-auto">✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ThemeSwitcher;
