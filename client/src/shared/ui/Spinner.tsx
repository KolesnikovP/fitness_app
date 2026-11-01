import { ActivityIndicator } from 'react-native';

import { useTheme } from './ThemeProvider';

/** A loading spinner in the theme's colours. */
export function Spinner() {
  const { colors } = useTheme();
  return <ActivityIndicator color={colors.muted} />;
}
