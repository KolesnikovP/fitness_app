import { ActivityIndicator, Pressable, Text } from 'react-native';

import { spacing } from './theme';
import { makeStyles, useTheme } from './ThemeProvider';

type ButtonProps = {
  label: string;
  onPress: () => void;
  /** link: a small text-only button, for secondary actions like revealing a field. */
  variant?: 'primary' | 'secondary' | 'link';
  loading?: boolean;
  disabled?: boolean;
  /** What a screen reader says, when the label alone doesn't say what it acts on. Defaults to label. */
  accessibilityLabel?: string;
};

export function Button({ label, onPress, variant = 'primary', loading, disabled, accessibilityLabel }: ButtonProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const isPrimary = variant === 'primary';
  const isLink = variant === 'link';
  const inactive = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        isLink ? styles.link : styles.base,
        isPrimary ? styles.primary : styles.secondary,
        (pressed || inactive) && styles.dimmed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? colors.primaryText : colors.primary} />
      ) : (
        <Text
          style={[styles.label, isLink && styles.linkLabel, { color: isPrimary ? colors.primaryText : colors.primary }]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  base: {
    minHeight: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: 'transparent' },
  link: { minHeight: 32, alignSelf: 'flex-start', justifyContent: 'center' },
  dimmed: { opacity: 0.6 },
  label: { fontSize: 17, fontWeight: '600' },
  linkLabel: { fontSize: 15, fontWeight: '500' },
}));
