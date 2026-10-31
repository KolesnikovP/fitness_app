import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/entities/auth';
import { ExerciseListItem, listExercises, type Exercise, type ExerciseFilters } from '@/entities/exercise';
import { addExerciseToSession } from '@/entities/workout';
import { ExerciseSearch } from '@/features/search-exercises';
import { errorMessage } from '@/shared/api';
import { useDebouncedValue } from '@/shared/hooks';
import { colors, Screen, spacing } from '@/shared/ui';

const SEARCH_DELAY_MS = 250;

/** Picks an exercise from the library and adds it to the workout in progress. */
export function AddSessionExerciseScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { state } = useAuth();
  const token = state.status === 'signedIn' ? state.token : null;
  const [filters, setFilters] = useState<ExerciseFilters>({ query: '', muscleGroup: null, equipmentType: null });
  const query = useDebouncedValue(filters.query, SEARCH_DELAY_MS);
  const { muscleGroup, equipmentType } = filters;
  const [exercises, setExercises] = useState<Exercise[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

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

  async function add(exercise: Exercise) {
    if (!token || adding) return;
    setError(null);
    setAdding(true);
    try {
      await addExerciseToSession(token, sessionId, exercise.id);
      router.back();
    } catch (e) {
      setError(errorMessage(e));
      setAdding(false);
    }
  }

  return (
    <Screen title="Add exercise">
      <View accessibilityLabel="Exercise picker" style={styles.picker}>
        <ExerciseSearch filters={filters} onChange={setFilters} />
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}
        {exercises === null || adding ? (
          error ? null : (
            <ActivityIndicator />
          )
        ) : (
          <View accessibilityLabel="Exercise list">
            {exercises.map((exercise) => (
              <ExerciseListItem key={exercise.id} exercise={exercise} onPress={() => add(exercise)} />
            ))}
            {exercises.length === 0 ? <Text style={styles.empty}>No exercises match.</Text> : null}
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  picker: { gap: spacing.md },
  error: { color: colors.danger, fontSize: 15 },
  empty: { fontSize: 17, color: colors.muted },
});
