import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/entities/auth';
import { equipmentLabel, listSubstituteSuggestions, type Exercise, type ExerciseRef } from '@/entities/exercise';
import { errorMessage } from '@/shared/api';
import { Button, colors, spacing } from '@/shared/ui';

type SubstitutePickerProps = {
  /** The slot's Exercise, to suggest Substitutes for. */
  exercise: ExerciseRef;
  /** Whether a suggestion can still be added; the others aren't offered. */
  canAdd: (exerciseId: string) => boolean;
  /** Called with a suggestion as it's tapped, to add it as the last Substitute. */
  onAdd: (exercise: ExerciseRef) => void;
  /** Closes the picker. */
  onDone: () => void;
};

/**
 * Suggests Substitutes for an Exercise slot: the exercises training the same
 * muscle group, those with the same equipment first. Each tap adds one.
 */
export function SubstitutePicker({ exercise, canAdd, onAdd, onDone }: SubstitutePickerProps) {
  const { state } = useAuth();
  const token = state.status === 'signedIn' ? state.token : null;
  const [suggestions, setSuggestions] = useState<Exercise[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let current = true;
    listSubstituteSuggestions(token, exercise.exerciseId)
      .then((found) => current && setSuggestions(found))
      .catch((e) => current && setError(errorMessage(e)));
    return () => {
      current = false;
    };
  }, [token, exercise.exerciseId]);

  const offered = suggestions?.filter((s) => canAdd(s.id)) ?? [];

  return (
    <View accessibilityLabel={`Substitutes for ${exercise.name}`} style={styles.container}>
      <Text style={styles.muted}>Swap to these in a workout when {exercise.name} isn't free.</Text>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : !suggestions ? (
        <ActivityIndicator />
      ) : offered.length === 0 ? (
        <Text style={styles.muted}>Nothing else trains the same muscles.</Text>
      ) : (
        offered.map((suggestion) => (
          <Pressable
            key={suggestion.id}
            accessibilityRole="button"
            accessibilityLabel={`Add ${suggestion.name} as a substitute`}
            onPress={() => onAdd({ exerciseId: suggestion.id, name: suggestion.name })}
            style={({ pressed }) => [styles.option, pressed && styles.pressed]}
          >
            <Text style={styles.plus}>+</Text>
            <Text style={styles.optionName}>{suggestion.name}</Text>
            <Text style={styles.muted}>{equipmentLabel(suggestion.equipmentType)}</Text>
          </Pressable>
        ))
      )}
      <Button label="Done" variant="secondary" onPress={onDone} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  pressed: { opacity: 0.5 },
  plus: { width: 20, fontSize: 20, color: colors.primary, textAlign: 'center' },
  optionName: { flex: 1, fontSize: 17, color: colors.text },
  muted: { fontSize: 15, color: colors.muted },
  error: { color: colors.danger, fontSize: 15 },
});
