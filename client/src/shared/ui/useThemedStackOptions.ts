import { useTheme } from './ThemeProvider';

/** Header and background colours for a Stack's screenOptions; spread it and add the stack's own options. */
export function useThemedStackOptions() {
  const { colors } = useTheme();
  return {
    headerStyle: { backgroundColor: colors.background },
    headerTintColor: colors.primary,
    headerTitleStyle: { color: colors.text },
    contentStyle: { backgroundColor: colors.background },
  };
}
