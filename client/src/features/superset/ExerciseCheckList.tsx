import { Pressable, Text, View } from 'react-native';

import { makeStyles, spacing } from '@/shared/ui';

type ExerciseCheckListProps = {
  exercises: { id: string; name: string }[];
  /** The ids ticked. */
  selected: string[];
  onToggle: (id: string) => void;
};

/** Exercises to tick, one checkbox each, to group into a Superset. */
export function ExerciseCheckList({ exercises, selected, onToggle }: ExerciseCheckListProps) {
  const styles = useStyles();
  return (
    <>
      {exercises.map((exercise) => {
        const checked = selected.includes(exercise.id);
        return (
          <Pressable
            key={exercise.id}
            accessibilityRole="checkbox"
            accessibilityLabel={exercise.name}
            accessibilityState={{ checked }}
            onPress={() => onToggle(exercise.id)}
            style={styles.option}
          >
            <View style={[styles.box, checked && styles.boxChecked]}>
              {checked ? <Text style={styles.check}>✓</Text> : null}
            </View>
            <Text style={styles.optionText}>{exercise.name}</Text>
          </Pressable>
        );
      })}
    </>
  );
}

/** Ticks id if it isn't, else unticks it. */
export function toggled(selected: string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
}

const useStyles = makeStyles((colors) => ({
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
  box: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  check: { color: colors.primaryText, fontWeight: '700' },
  optionText: { fontSize: 17, color: colors.text },
}));
