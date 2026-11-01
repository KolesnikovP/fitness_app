import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, spacing } from '@/shared/ui';

import type { RoutineSummary } from './model';

/** One Routine in the list of them: its name and exercises. */
export function RoutineSummaryItem({ routine, onPress }: { routine: RoutineSummary; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={routine.name}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Text style={styles.name}>{routine.name}</Text>
      <Text style={styles.exercises}>{routine.exerciseNames.join(', ')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: 2,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pressed: { opacity: 0.6 },
  name: { fontSize: 17, fontWeight: '600', color: colors.text },
  exercises: { fontSize: 15, color: colors.muted },
});
