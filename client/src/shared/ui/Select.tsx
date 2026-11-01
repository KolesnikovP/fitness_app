import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from './Button';
import { spacing } from './theme';
import { makeStyles } from './ThemeProvider';

export type SelectOption<T> = { value: T; label: string; description?: string };

type SelectProps<T> = {
  label: string;
  options: readonly SelectOption<T>[];
  value: T | null;
  onChange: (value: T | null) => void;
  /** Shown when nothing is picked. */
  placeholder?: string;
  /** Offers a button to clear the value, for an optional field. */
  clearLabel?: string;
  /** For a table cell: the label only for screen readers and the sheet's title, no chevron, centred. */
  dense?: boolean;
};

/**
 * A labelled field that opens a sheet of options, each with an optional line
 * saying what it means to help the User choose. Once picked, the field shows
 * only the option's label.
 */
export function Select<T>({
  label,
  options,
  value,
  onChange,
  placeholder = 'Choose',
  clearLabel,
  dense,
}: SelectProps<T>) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value) ?? null;
  const shown = selected ? selected.label : placeholder;

  function pick(next: T | null) {
    onChange(next);
    setOpen(false);
  }

  return (
    <View style={styles.container}>
      {dense ? null : <Text style={styles.label}>{label}</Text>}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: shown }}
        onPress={() => setOpen(true)}
        style={[styles.field, dense && styles.denseField]}
      >
        <Text style={[styles.value, !selected && styles.placeholder, dense && styles.denseValue]} numberOfLines={1}>
          {shown}
        </Text>
        {dense ? null : <Text style={styles.chevron}>▾</Text>}
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable accessibilityLabel={`Close ${label}`} style={styles.backdrop} onPress={() => setOpen(false)} />
        <View accessibilityLabel={`${label} options`} style={styles.sheet}>
          <Text accessibilityRole="header" style={styles.title}>
            {label}
          </Text>
          <ScrollView accessibilityRole="radiogroup">
            {options.map((option) => {
              const checked = option.value === value;
              return (
                <Pressable
                  key={option.label}
                  accessibilityRole="radio"
                  accessibilityLabel={option.label}
                  accessibilityHint={option.description}
                  accessibilityState={{ checked }}
                  onPress={() => pick(option.value)}
                  style={[styles.option, checked && styles.optionChecked]}
                >
                  <Text style={[styles.optionLabel, checked && styles.optionLabelChecked]}>{option.label}</Text>
                  {option.description ? <Text style={styles.description}>{option.description}</Text> : null}
                </Pressable>
              );
            })}
          </ScrollView>
          {clearLabel && selected ? <Button label={clearLabel} variant="secondary" onPress={() => pick(null)} /> : null}
          <Button label="Cancel" variant="secondary" onPress={() => setOpen(false)} />
        </View>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { gap: spacing.xs },
  label: { fontSize: 15, fontWeight: '500', color: colors.text },
  field: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.sm,
  },
  value: { flex: 1, fontSize: 17, color: colors.text },
  placeholder: { color: colors.muted },
  chevron: { fontSize: 15, color: colors.muted },
  denseField: { minHeight: 40, paddingHorizontal: spacing.xs },
  denseValue: { textAlign: 'center' },
  backdrop: { flex: 1, backgroundColor: colors.backdrop },
  sheet: {
    maxHeight: '70%',
    gap: spacing.sm,
    padding: spacing.md,
    paddingBottom: spacing.xl,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: colors.background,
  },
  title: { fontSize: 20, fontWeight: '600', color: colors.text },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    borderRadius: 10,
  },
  optionChecked: { backgroundColor: colors.primary },
  optionLabel: { width: 28, fontSize: 20, fontWeight: '700', color: colors.text },
  optionLabelChecked: { color: colors.primaryText },
  description: { flex: 1, fontSize: 15, color: colors.muted },
}));
