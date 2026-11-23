import { useColorScheme } from 'react-native';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { readSecure, StorageKeys, writeSecure } from '../lib/storage';
import { palettes, type Palette, type ResolvedTheme, type ThemeMode } from './tokens';

interface ThemeContextValue {
  mode: ThemeMode;
  theme: ResolvedTheme;
  colors: Palette;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    let active = true;
    void readSecure(StorageKeys.theme).then((stored) => {
      if (active && isThemeMode(stored)) setModeState(stored);
    });
    return () => {
      active = false;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    void writeSecure(StorageKeys.theme, next);
  }, []);

  const theme: ResolvedTheme = mode === 'system' ? (scheme === 'dark' ? 'dark' : 'light') : mode;

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, theme, colors: palettes[theme], setMode }),
    [mode, theme, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }
  return context;
}
