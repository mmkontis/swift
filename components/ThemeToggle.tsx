import React from 'react';
import { useTheme } from './ThemeProvider';

export const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="fixed top-4 right-4 p-2 rounded-full dark:bg-gray-200 bg-gray-800"
    >
      {theme === 'light' ? '🌙' : '☀️'}
    </button>
  );
};