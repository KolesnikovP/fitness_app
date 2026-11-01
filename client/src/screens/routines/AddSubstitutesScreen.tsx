import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text } from 'react-native';

import { useAuth } from '@/entities/auth';
import { getExercise, type Exercise } from '@/entities/exercise';
import { MAX_SUBSTITUTES } from '@/entities/routine';
import { ExercisePicker } from '@/features/search-exercises';
import { errorMessage } from '@/shared/api';
import { Button, makeStyles, Screen } from '@/shared/ui';

/**
 * Picks Substitutes for one Exercise slot of a Routine being built, from the
 * whole library, starting filtered to the slot's muscle group. Then goes back
 * to the editor (returnTo) with them, in the order picked, for slotKey.
 */
export function AddSubstitutesScreen() {
  const styles = useStyles();
  const { returnTo, slotKey, exerciseId, taken } = useLocalSearchParams<{
    returnTo: string;
    slotKey: string;
    exerciseId: string;
    /** The slot's Substitutes so far, as a JSON array of exercise ids. */
    taken: string;
  }>();
  const { state } = useAuth();
  const token = state.status === 'signedIn' ? state.token : null;
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Exercise[]>([]);
  const takenIds = JSON.parse(taken || '[]') as string[];
  const room = MAX_SUBSTITUTES - takenIds.length;

  useEffect(() => {
    if (!token) return;
    let current = true;
    getExercise(token, exerciseId)
      .then((found) => current && setExercise(found))
      .catch((e) => current && setError(errorMessage(e)));
    return () => {
      current = false;
    };
  }, [token, exerciseId]);

  function toggle(picked: Exercise) {
    setSelected((current) =>
      current.some((e) => e.id === picked.id)
        ? current.filter((e) => e.id !== picked.id)
        : current.length < room
          ? [...current, picked]
          : current,
    );
  }

  function add() {
    const picked = JSON.stringify(selected.map(({ id, name }) => ({ exerciseId: id, name })));
    router.dismissTo(
      `${returnTo}?substitutesFor=${encodeURIComponent(slotKey)}&pickedSubstitutes=${encodeURIComponent(picked)}`,
    );
  }

  const count = selected.length;
  const label = count === 0 ? 'Add substitutes' : `Add ${count} ${count === 1 ? 'substitute' : 'substitutes'}`;

  return (
    <Screen title="Add substitutes" footer={<Button label={label} onPress={add} disabled={count === 0} />}>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : !exercise ? (
        <ActivityIndicator />
      ) : (
        <>
          <Text style={styles.muted}>
            To swap to when {exercise.name} isn't free. These train the same muscles; change the filters to pick
            anything else.
          </Text>
          {count >= room ? (
            <Text style={styles.muted}>
              That's the most: an exercise can have {MAX_SUBSTITUTES} substitutes.
            </Text>
          ) : null}
          <ExercisePicker
            onPick={toggle}
            selectedIds={selected.map((e) => e.id)}
            initialFilters={{ muscleGroup: exercise.muscleGroup }}
            hiddenIds={[exercise.id, ...takenIds]}
          />
        </>
      )}
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  error: { color: colors.danger, fontSize: 15 },
  muted: { fontSize: 15, color: colors.muted },
}));
