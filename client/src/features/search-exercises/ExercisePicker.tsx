import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { useAuth } from '@/entities/auth';
import { ExerciseListItem, listExercises, type Exercise, type ExerciseFilters } from '@/entities/exercise';
import { errorMessage } from '@/shared/api';
import { useDebouncedValue } from '@/shared/hooks';
import { makeStyles, spacing, Spinner } from '@/shared/ui';

import { ExerciseSearch } from './ExerciseSearch';

const SEARCH_DELAY_MS = 250;

type ExercisePickerProps = {
  onPick: (exercise: Exercise) => void;
  /** When picking several: the ids picked so far, shown ticked. */
  selectedIds?: string[];
  /** Shows a spinner in place of the list while the pick is being saved. */
  busy?: boolean;
  /** Filters to start with; the User can change or clear them. */
  initialFilters?: Partial<ExerciseFilters>;
  /** Exercises left out of the list, as ones that can't be picked here. */
  hiddenIds?: string[];
};

/** Searches the library and picks an exercise from it, or several with selectedIds. */
export function ExercisePicker({ onPick, selectedIds, busy, initialFilters, hiddenIds }: ExercisePickerProps) {
  const styles = useStyles();
  const { state } = useAuth();
  const token = state.status === 'signedIn' ? state.token : null;
  const [filters, setFilters] = useState<ExerciseFilters>(() => ({
    query: '',
    muscleGroup: null,
    equipmentType: null,
    ...initialFilters,
  }));
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
        setExercises(hiddenIds ? found.filter((e) => !hiddenIds.includes(e.id)) : found);
        setError(null);
      })
      .catch((e) => current && setError(errorMessage(e)));
    // Drop a response that arrives after the filters have changed again.
    return () => {
      current = false;
    };
    // hiddenIds is fixed for the picker's life; a new array each render isn't a change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          <Spinner />
        )
      ) : (
        <View accessibilityLabel="Exercise list">
          {exercises.map((exercise) => (
            <ExerciseListItem
              key={exercise.id}
              exercise={exercise}
              onPress={() => onPick(exercise)}
              selected={selectedIds?.includes(exercise.id)}
            />
          ))}
          {exercises.length === 0 ? <Text style={styles.empty}>No exercises match.</Text> : null}
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  picker: { gap: spacing.md },
  error: { color: colors.danger, fontSize: 15 },
  empty: { fontSize: 17, color: colors.muted },
}));
