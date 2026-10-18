import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/shared/ui';

import { equipmentLabel, muscleGroupLabel, type Exercise } from './model';

export function ExerciseListItem({ exercise, onPress }: { exercise: Exercise; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={exercise.name}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.text}>
        <Text style={styles.name}>{exercise.name}</Text>
        <Text style={styles.detail}>
          {muscleGroupLabel(exercise.muscleGroup)} · {equipmentLabel(exercise.equipmentType)}
        </Text>
      </View>
      {exercise.isCustom ? <Text style={styles.badge}>Custom</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pressed: { opacity: 0.6 },
  text: { flex: 1, gap: 2 },
  name: { fontSize: 17, color: colors.text },
  detail: { fontSize: 14, color: colors.muted },
  badge: { fontSize: 13, color: colors.primary, fontWeight: '600' },
});
