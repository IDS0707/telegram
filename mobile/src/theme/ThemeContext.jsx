import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';
import { Colors } from './colors';

export const ThemeContext = createContext({
  mode: 'dark',
  colors: Colors.dark,
  isDark: true,
  toggleTheme: () => {},
  setMode: () => {},
});

export function ThemeProvider({ children }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState('dark');

  useEffect(() => {
    AsyncStorage.getItem('theme_mode').then((v) => {
      if (v === 'light' || v === 'dark' || v === 'system') {
        setModeState(v);
      }
    });
  }, []);

  const isDark = mode === 'dark' || (mode === 'system' && system === 'dark');
  const colors = isDark ? Colors.dark : Colors.light;

  const setMode = (m) => {
    setModeState(m);
    AsyncStorage.setItem('theme_mode', m);
  };

  const toggleTheme = () => setMode(isDark ? 'light' : 'dark');

  return (
    <ThemeContext.Provider value={{ mode, colors, isDark, toggleTheme, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
