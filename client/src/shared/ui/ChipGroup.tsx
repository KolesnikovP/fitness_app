import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from './theme';

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

const styles = StyleSheet.create({
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
});
