import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text } from 'react-native';

import { useAuth } from '@/entities/auth';
import {
  discardSession,
  finishSession,
  formatClockTime,
  getCurrentSession,
  hasSets,
  sessionBlocks,
  type Session,
} from '@/entities/workout';
import { RestTimer } from '@/features/rest-timer';
import { CreateSupersetForm } from '@/features/superset';
import { errorMessage } from '@/shared/api';
import { Button, colors, Screen } from '@/shared/ui';
import { SessionExerciseCard, SupersetBlock } from '@/widgets/session-exercise-card';

/**
 * The workout in progress: its exercises and Supersets with their Sets, a
 * rest timer, and finishing or discarding it.
 */
export function CurrentSessionScreen() {
  const { state } = useAuth();
  const token = state.status === 'signedIn' ? state.token : null;
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [groupingSuperset, setGroupingSuperset] = useState(false);

  // Reload on focus, so an exercise added on the picker screen shows up.
  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      let current = true;
      getCurrentSession(token)
        .then((found) => {
          if (!current) return;
          // Finished or discarded elsewhere: nothing to show here.
          if (!found) router.back();
          else setSession(found);
        })
        .catch((e) => current && setError(errorMessage(e)));
      return () => {
        current = false;
      };
    }, [token]),
  );

  if (!token) return null;
  if (!session) {
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

  async function finish() {
    if (!token || !session) return;
    setError(null);
    setFinishing(true);
    try {
      await finishSession(token, session.id);
      router.back();
    } catch (e) {
      setError(errorMessage(e));
      setFinishing(false);
    }
  }

  function confirmDiscard() {
    Alert.alert('Discard workout?', 'Everything logged in this workout will be deleted.', [
      { text: 'Keep logging', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          if (!token || !session) return;
          try {
            await discardSession(token, session.id);
            router.back();
          } catch (e) {
            setError(errorMessage(e));
          }
        },
      },
    ]);
  }

  const canFinish = hasSets(session);
  const ungrouped = session.exercises.filter((e) => e.supersetId === null);

  return (
    <Screen title="Current workout">
      <Text style={styles.muted}>Started at {formatClockTime(session.startedAt)}</Text>
      {sessionBlocks(session.exercises).map((block) =>
        block.kind === 'superset' ? (
          <SupersetBlock
            key={block.supersetId}
            sessionId={session.id}
            supersetId={block.supersetId}
            exercises={block.exercises}
            onChange={setSession}
          />
        ) : (
          <SessionExerciseCard
            key={block.exercise.id}
            sessionId={session.id}
            sessionExercise={block.exercise}
            onChange={setSession}
          />
        ),
      )}
      {groupingSuperset ? (
        <CreateSupersetForm
          sessionId={session.id}
          exercises={ungrouped}
          onCreated={(updated) => {
            setSession(updated);
            setGroupingSuperset(false);
          }}
          onCancel={() => setGroupingSuperset(false)}
        />
      ) : ungrouped.length >= 2 ? (
        <Button label="Create superset" variant="secondary" onPress={() => setGroupingSuperset(true)} />
      ) : null}
      <Button
        label="Add exercise"
        variant="secondary"
        onPress={() => router.push({ pathname: '/workout/add-exercise', params: { sessionId: session.id } })}
      />
      <RestTimer />
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <Button label="Finish workout" onPress={finish} loading={finishing} disabled={!canFinish} />
      {canFinish ? null : <Text style={styles.muted}>Log a set to finish the workout.</Text>}
      <Button label="Discard workout" variant="secondary" onPress={confirmDiscard} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  error: { color: colors.danger, fontSize: 15 },
  muted: { fontSize: 15, color: colors.muted },
});
