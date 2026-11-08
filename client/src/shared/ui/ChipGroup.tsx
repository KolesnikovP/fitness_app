import { Pressable, ScrollView, Text, View } from 'react-native';

import { spacing } from './theme';
import { makeStyles } from './ThemeProvider';

export type ChipOption<T extends string> = { value: T; label: string };

type ChipGroupProps<T extends string> = {
  label: string;
  options: readonly ChipOption<T>[];
  value: T | null;
  onChange: (value: T | null) => void;
  /** Let a second tap on the selected chip clear it, for optional filters. */
  allowDeselect?: boolean;
};

/** A labelled, horizontally scrolling row of single-choice chips. */
export function ChipGroup<T extends string>({ label, options, value, onChange, allowDeselect }: ChipGroupProps<T>) {
  const styles = useStyles();
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.row}>
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityLabel={option.label}
                accessibilityState={{ checked: selected }}
                onPress={() => onChange(selected && allowDeselect ? null : option.value)}
                style={[styles.chip, selected && styles.chipSelected]}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

type MultiChipGroupProps<T extends string> = {
  label: string;
  options: readonly ChipOption<T>[];
  /** The chosen values, in the order they were chosen. */
  value: readonly T[];
  onChange: (value: T[]) => void;
};

/** A labelled, horizontally scrolling row of chips any number of which can be chosen. */
export function MultiChipGroup<T extends string>({ label, options, value, onChange }: MultiChipGroupProps<T>) {
  const styles = useStyles();
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View accessibilityLabel={label} style={styles.row}>
          {options.map((option) => {
            const selected = value.includes(option.value);
            return (
              <Pressable
                key={option.value}
                accessibilityRole="checkbox"
                accessibilityLabel={option.label}
                accessibilityState={{ checked: selected }}
                onPress={() => onChange(selected ? value.filter((v) => v !== option.value) : [...value, option.value])}
                style={[styles.chip, selected && styles.chipSelected]}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { gap: spacing.xs },
  label: { fontSize: 15, fontWeight: '500', color: colors.text },
  row: { flexDirection: 'row', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 15, color: colors.text },
  chipTextSelected: { color: colors.primaryText, fontWeight: '600' },
}));
