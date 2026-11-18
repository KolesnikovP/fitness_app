import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { useAuth } from '@/entities/auth';
import type { Exercise } from '@/entities/exercise';
import { swapSessionExercise } from '@/entities/workout';
import { ExercisePicker } from '@/features/search-exercises';
import { errorMessage } from '@/shared/api';
import { makeStyles, Screen } from '@/shared/ui';

/**
 * Picks any Exercise from the library to Replace a Session exercise with,
 * for the workout in progress only. The Exercise it's done as now isn't
 * offered.
 */
export function ReplaceSessionExerciseScreen() {
  const styles = useStyles();
  const { sessionId, sessionExerciseId, exerciseId } = useLocalSearchParams<{
    sessionId: string;
    sessionExerciseId: string;
    exerciseId: string;
  }>();
  const { state } = useAuth();
  const token = state.status === 'signedIn' ? state.token : null;
  const [error, setError] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);

  async function replace(exercise: Exercise) {
    if (!token || replacing) return;
    setError(null);
    setReplacing(true);
    try {
      await swapSessionExercise(token, sessionId, sessionExerciseId, exercise.id);
      router.back();
    } catch (e) {
      setError(errorMessage(e));
      setReplacing(false);
    }
  }

  return (
    <Screen headerTitle="Replace exercise">
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <ExercisePicker onPick={replace} busy={replacing} hiddenIds={[exerciseId]} />
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  error: { color: colors.danger, fontSize: 15 },
}));
