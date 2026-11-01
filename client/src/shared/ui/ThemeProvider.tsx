import * as SecureStore from 'expo-secure-store';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';

import { darkColors, lightColors, type Colors } from './theme';

/** What the user picked on the profile tab. 'system' follows the phone's light or dark mode. */
export type ThemePreference = 'system' | 'light' | 'dark';
export type ColorScheme = 'light' | 'dark';

const PREFERENCE_KEY = 'theme-preference';

type Theme = {
  colors: Colors;
  scheme: ColorScheme;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<Theme>({
  colors: lightColors,
  scheme: 'light',
  preference: 'system',
  setPreference: () => {},
});

function storedPreference(): ThemePreference {
  try {
    const stored = SecureStore.getItem(PREFERENCE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // Unreadable storage: follow the phone.
  }
  return 'system';
}

/**
 * Picks the light or dark palette: the user's choice if they made one, else the phone's mode.
 * The choice is kept on the device, so it applies before anyone signs in.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const phoneScheme = useColorScheme();
  const [preference, setPreferenceState] = useState(storedPreference);
  const scheme: ColorScheme = preference === 'system' ? (phoneScheme === 'dark' ? 'dark' : 'light') : preference;

  const theme = useMemo<Theme>(
    () => ({
      colors: scheme === 'dark' ? darkColors : lightColors,
      scheme,
      preference,
      setPreference: (next) => {
        setPreferenceState(next);
        // Losing the save only means the next launch follows the phone again.
        SecureStore.setItemAsync(PREFERENCE_KEY, next).catch(() => {});
      },
    }),
    [scheme, preference],
  );

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/**
 * Styles that depend on the palette. Call at module level, then call the returned hook in the
 * component: `const useStyles = makeStyles((colors) => ({ ... }))` / `const styles = useStyles()`.
 * Each palette's styles are built once.
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(build: (colors: Colors) => T) {
  const built = new Map<Colors, T>();
  return function useStyles(): T {
    const { colors } = useTheme();
    let styles = built.get(colors);
    if (!styles) {
      styles = StyleSheet.create(build(colors));
      built.set(colors, styles);
    }
    return styles;
  };
}
