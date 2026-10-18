import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/entities/auth';
import { ExerciseListItem, listExercises, type Exercise, type ExerciseFilters } from '@/entities/exercise';
import { ExerciseSearch } from '@/features/search-exercises';
import { errorMessage } from '@/shared/api';
import { useDebouncedValue } from '@/shared/hooks';
import { Button, colors, Screen } from '@/shared/ui';

const SEARCH_DELAY_MS = 250;

export function ExerciseLibraryScreen() {
  const { state } = useAuth();
  const token = state.status === 'signedIn' ? state.token : null;
  const [filters, setFilters] = useState<ExerciseFilters>({ query: '', muscleGroup: null, equipmentType: null });
  const query = useDebouncedValue(filters.query, SEARCH_DELAY_MS);
  const { muscleGroup, equipmentType } = filters;
  const [exercises, setExercises] = useState<Exercise[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reload on focus too, so an exercise created on another screen shows up.
  useFocusEffect(
    useCallback(() => {
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
    }, [token, query, muscleGroup, equipmentType]),
  );

  return (
    <Screen title="Exercises">
      <Button label="New exercise" variant="secondary" onPress={() => router.push('/exercises/new')} />
      <ExerciseSearch filters={filters} onChange={setFilters} />
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      {exercises === null ? (
        error ? null : <ActivityIndicator />
      ) : (
        <View accessibilityLabel="Exercise list">
          {exercises.map((exercise) => (
            <ExerciseListItem
              key={exercise.id}
              exercise={exercise}
              onPress={() => router.push(`/exercises/${exercise.id}`)}
            />
          ))}
          {exercises.length === 0 ? <Text style={styles.empty}>No exercises match.</Text> : null}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  error: { color: colors.danger, fontSize: 15 },
  empty: { fontSize: 17, color: colors.muted },
});
