import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { useAuth } from '@/entities/auth';
import { equipmentLabel, ExerciseMedia, getExercise, muscleGroupLabel, type Exercise } from '@/entities/exercise';
import { ExerciseBestsCard } from '@/entities/workout';
import { UploadMediaButton } from '@/features/upload-exercise-media';
import { ExerciseProgressChart } from '@/widgets/exercise-progress-chart';
import { errorMessage } from '@/shared/api';
import { makeStyles, Screen, SegmentedControl, spacing, Spinner, type ChipOption } from '@/shared/ui';

type Tab = 'performance' | 'howTo';

const TABS: readonly ChipOption<Tab>[] = [
  { value: 'performance', label: 'Performance' },
  { value: 'howTo', label: 'How to' },
];

export function ExerciseDetailScreen() {
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useAuth();
  const token = state.status === 'signedIn' ? state.token : null;
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('performance');

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
          <Spinner />
        )}
      </Screen>
    );
  }

  return (
    <Screen title={exercise.name}>
      <View accessibilityLabel="About this exercise" style={styles.about}>
        <Text style={styles.detail}>{equipmentLabel(exercise.equipmentType)}</Text>
        <Text style={styles.detail}>Primary: {muscleGroupLabel(exercise.muscleGroup)}</Text>
        {exercise.secondaryMuscles.length > 0 ? (
          <Text style={styles.detail}>Secondary: {exercise.secondaryMuscles.map(muscleGroupLabel).join(', ')}</Text>
        ) : null}
        {exercise.isCustom ? <Text style={styles.badge}>Custom</Text> : null}
      </View>
      <SegmentedControl label="Exercise sections" options={TABS} value={tab} onChange={setTab} />
      {/* Both tabs stay mounted, so switching keeps the chart's metric and range and doesn't refetch. */}
      <View style={[styles.tab, tab !== 'performance' && styles.hidden]}>
        <ExerciseProgressChart token={token} exerciseId={exercise.id} />
        <ExerciseBestsCard token={token} exerciseId={exercise.id} />
      </View>
      <View style={[styles.tab, tab !== 'howTo' && styles.hidden]}>
        <HowTo exercise={exercise} token={token} onUploaded={setExercise} />
      </View>
    </Screen>
  );
}

type HowToProps = { exercise: Exercise; token: string; onUploaded: (exercise: Exercise) => void };

/**
 * How to do an Exercise: its media (the animated demo, else the image) in a
 * slot kept for it even when there is none, then its Instructions. A Custom
 * exercise's User can add media.
 */
function HowTo({ exercise, token, onUploaded }: HowToProps) {
  const styles = useStyles();
  const media = exercise.animatedDemoUrl
    ? { path: exercise.animatedDemoUrl, label: `${exercise.name} animated demo` }
    : exercise.imageUrl
      ? { path: exercise.imageUrl, label: `${exercise.name} image` }
      : null;
  return (
    <>
      <View accessibilityLabel="Media" style={styles.mediaSlot}>
        {media ? <ExerciseMedia path={media.path} token={token} accessibilityLabel={media.label} fill /> : null}
      </View>
      <View accessibilityLabel="Instructions" style={styles.steps}>
        {exercise.instructions.length === 0 ? (
          <Text style={styles.muted}>No instructions yet.</Text>
        ) : (
          exercise.instructions.map((step, i) => (
            <View key={i} style={styles.step}>
              <Text style={styles.stepNumber}>{i + 1}.</Text>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))
        )}
      </View>
      {exercise.isCustom ? <UploadMediaButton exercise={exercise} onUploaded={onUploaded} /> : null}
    </>
  );
}

const useStyles = makeStyles((colors) => ({
  error: { color: colors.danger, fontSize: 15 },
  badge: { fontSize: 15, color: colors.primary, fontWeight: '600' },
  about: { gap: spacing.xs, marginTop: -spacing.md },
  tab: { gap: spacing.md },
  hidden: { display: 'none' },
  detail: { fontSize: 15, color: colors.muted },
  mediaSlot: { width: '100%', aspectRatio: 16 / 9, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.card },
  steps: { gap: spacing.sm },
  step: { flexDirection: 'row', gap: spacing.sm },
  stepNumber: { fontSize: 17, fontWeight: '600', color: colors.text, minWidth: 24 },
  stepText: { flex: 1, fontSize: 17, color: colors.text },
  muted: { fontSize: 15, color: colors.muted },
}));
