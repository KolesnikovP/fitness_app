import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/entities/auth';
import { equipmentLabel, ExerciseMedia, getExercise, muscleGroupLabel, type Exercise } from '@/entities/exercise';
import { UploadMediaButton } from '@/features/upload-exercise-media';
import { errorMessage } from '@/shared/api';
import { colors, Screen, spacing } from '@/shared/ui';

export function ExerciseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useAuth();
  const token = state.status === 'signedIn' ? state.token : null;
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let current = true;
    getExercise(token, id)
      .then((found) => current && setExercise(found))
      .catch((e) => current && setError(errorMessage(e)));
    return () => {
      current = false;
    };
  }, [token, id]);

  if (!token) return null;
  if (!exercise) {
    return (
      <Screen>
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : (
          <ActivityIndicator />
        )}
      </Screen>
    );
  }

  return (
    <Screen title={exercise.name}>
      {exercise.isCustom ? <Text style={styles.badge}>Custom</Text> : null}
      <View accessibilityLabel="Muscle group" style={styles.row}>
        <Text style={styles.label}>Muscle group</Text>
        <Text style={styles.value}>{muscleGroupLabel(exercise.muscleGroup)}</Text>
      </View>
      <View accessibilityLabel="Equipment" style={styles.row}>
        <Text style={styles.label}>Equipment</Text>
        <Text style={styles.value}>{equipmentLabel(exercise.equipmentType)}</Text>
      </View>
      {exercise.animatedDemoUrl ? (
        <ExerciseMedia path={exercise.animatedDemoUrl} token={token} accessibilityLabel={`${exercise.name} animated demo`} />
      ) : null}
      {exercise.imageUrl ? (
        <ExerciseMedia path={exercise.imageUrl} token={token} accessibilityLabel={`${exercise.name} image`} />
      ) : null}
      {exercise.isCustom ? <UploadMediaButton exercise={exercise} onUploaded={setExercise} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  error: { color: colors.danger, fontSize: 15 },
  badge: { fontSize: 15, color: colors.primary, fontWeight: '600' },
  row: { gap: spacing.xs },
  label: { fontSize: 15, color: colors.muted },
  value: { fontSize: 17, color: colors.text },
});
