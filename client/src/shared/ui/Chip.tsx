import { Pressable, Text } from 'react-native';

import { spacing } from './theme';
import { makeStyles } from './ThemeProvider';

type ChipProps = {
  /** What it reads; also what a screen reader calls it, unless accessibilityLabel says otherwise. */
  label: string;
  accessibilityLabel?: string;
  onPress: () => void;
  disabled?: boolean;
};

/** A small rounded button for an action, as in a row of them. */
export function Chip({ label, accessibilityLabel, onPress, disabled }: ChipProps) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, (pressed || disabled) && styles.dimmed]}
    >
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  chip: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  dimmed: { opacity: 0.5 },
  text: { fontSize: 15, fontWeight: '600', color: colors.text },
}));
