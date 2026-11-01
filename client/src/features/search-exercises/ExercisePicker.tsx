import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/entities/auth';
import { ExerciseListItem, listExercises, type Exercise, type ExerciseFilters } from '@/entities/exercise';
import { errorMessage } from '@/shared/api';
import { useDebouncedValue } from '@/shared/hooks';
import { colors, spacing } from '@/shared/ui';

import { ExerciseSearch } from './ExerciseSearch';

const SEARCH_DELAY_MS = 250;

type ExercisePickerProps = {
  onPick: (exercise: Exercise) => void;
  /** Shows a spinner in place of the list while the pick is being saved. */
  busy?: boolean;
};

/** Searches the library and picks one exercise from it. */
export function ExercisePicker({ onPick, busy }: ExercisePickerProps) {
  const { state } = useAuth();
  const token = state.status === 'signedIn' ? state.token : null;
  const [filters, setFilters] = useState<ExerciseFilters>({ query: '', muscleGroup: null, equipmentType: null });
  const query = useDebouncedValue(filters.query, SEARCH_DELAY_MS);
  const { muscleGroup, equipmentType } = filters;
  const [exercises, setExercises] = useState<Exercise[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let current = true;
    listExercises(token, { query, muscleGroup, equipmentType })
      .then((found) => {
        if (!current) return;
        setExercises(found);
        setError(null);
      })
      .catch((e) => current && setError(errorMessage(e)));
    // Drop a response that arrives after the filters have changed again.
    return () => {
      current = false;
    };
  }, [token, query, muscleGroup, equipmentType]);

  return (
    <View accessibilityLabel="Exercise picker" style={styles.picker}>
      <ExerciseSearch filters={filters} onChange={setFilters} />
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      {exercises === null || busy ? (
        error ? null : (
          <ActivityIndicator />
        )
      ) : (
        <View accessibilityLabel="Exercise list">
          {exercises.map((exercise) => (
            <ExerciseListItem key={exercise.id} exercise={exercise} onPress={() => onPick(exercise)} />
          ))}
          {exercises.length === 0 ? <Text style={styles.empty}>No exercises match.</Text> : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  picker: { gap: spacing.md },
  error: { color: colors.danger, fontSize: 15 },
  empty: { fontSize: 17, color: colors.muted },
});
