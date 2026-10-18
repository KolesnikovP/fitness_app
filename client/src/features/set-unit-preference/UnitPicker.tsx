import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/entities/auth';
import type { UnitPreference } from '@/entities/user';
import { colors, spacing } from '@/shared/ui';

const OPTIONS: { value: UnitPreference; title: string; detail: string }[] = [
  { value: 'kg', title: 'Kilograms', detail: 'kg' },
  { value: 'lb', title: 'Pounds', detail: 'lb' },
];

/** Saves the unit preference as soon as an option is tapped. */
export function UnitPicker() {
  const { setUnitPreference } = useAuth();
  const [saving, setSaving] = useState<UnitPreference | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(unit: UnitPreference) {
    setError(null);
    setSaving(unit);
    try {
      await setUnitPreference(unit);
    } catch {
      setError("Couldn't save your choice. Please try again.");
      setSaving(null);
    }
  }

  return (
    <View style={styles.list}>
      {OPTIONS.map((option) => (
        <Pressable
          key={option.value}
          accessibilityRole="button"
          accessibilityLabel={option.title}
          accessibilityState={{ disabled: saving !== null, busy: saving === option.value }}
          disabled={saving !== null}
          onPress={() => choose(option.value)}
          style={({ pressed }) => [styles.option, (pressed || saving === option.value) && styles.optionActive]}
        >
          <Text style={styles.optionTitle}>{option.title}</Text>
          <Text style={styles.optionDetail}>{option.detail}</Text>
        </Pressable>
      ))}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  option: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionActive: { borderColor: colors.primary, backgroundColor: '#EEF5FF' },
  optionTitle: { fontSize: 19, fontWeight: '600', color: colors.text },
  optionDetail: { fontSize: 17, color: colors.muted },
  error: { color: colors.danger, fontSize: 15 },
});
