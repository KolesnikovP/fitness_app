import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { useAuth } from '@/entities/auth';
import type { Exercise } from '@/entities/exercise';
import { addExerciseToSession } from '@/entities/workout';
import { ExercisePicker } from '@/features/search-exercises';
import { errorMessage } from '@/shared/api';
import { makeStyles, Screen } from '@/shared/ui';

/** Picks an exercise from the library and adds it to the workout in progress. */
export function AddSessionExerciseScreen() {
  const styles = useStyles();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { state } = useAuth();
  const token = state.status === 'signedIn' ? state.token : null;
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

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
    <Screen headerTitle="Add exercise">
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <ExercisePicker onPick={add} busy={adding} />
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  error: { color: colors.danger, fontSize: 15 },
}));
