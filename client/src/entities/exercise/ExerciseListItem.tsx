import { Pressable, StyleSheet, Text, View } from 'react-native';

import { makeStyles, spacing } from '@/shared/ui';

import { equipmentLabel, muscleGroupLabel, type Exercise } from './model';

type ExerciseListItemProps = {
  exercise: Exercise;
  onPress: () => void;
  /** Set when picking several: the row is then a checkbox, ticked when selected. */
  selected?: boolean;
};

export function ExerciseListItem({ exercise, onPress, selected }: ExerciseListItemProps) {
  const styles = useStyles();
  const checkable = selected !== undefined;
  return (
    <Pressable
      accessibilityRole={checkable ? 'checkbox' : 'button'}
      accessibilityLabel={exercise.name}
      accessibilityState={checkable ? { checked: selected } : undefined}
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
      {checkable ? (
        <View style={[styles.box, selected && styles.boxChecked]}>
          {selected ? <Text style={styles.check}>✓</Text> : null}
        </View>
      ) : null}
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
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
  box: {
    width: 24,
    height: 24,
    marginLeft: spacing.md,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  check: { color: colors.primaryText, fontWeight: '700' },
}));
