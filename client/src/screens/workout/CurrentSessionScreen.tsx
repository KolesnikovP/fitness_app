import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Text } from 'react-native';

import { useAuth } from '@/entities/auth';
import {
  discardSession,
  finishSession,
  formatClockTime,
  getCurrentSession,
  hasSets,
  NewRecordBanner,
  newRecords,
  sessionBlocks,
  withoutSet,
  type PersonalRecord,
  type Session,
} from '@/entities/workout';
import { SetDeletedBar, usePendingSetDeletion } from '@/features/delete-set';
import { RestTimer } from '@/features/rest-timer';
import { CreateSupersetForm } from '@/features/superset';
import { errorMessage } from '@/shared/api';
import { Button, makeStyles, Screen, Spinner } from '@/shared/ui';
import { SessionExerciseCard, SupersetBlock } from '@/widgets/session-exercise-card';

/**
 * The workout in progress: its exercises and Supersets with their Sets, a
 * rest timer, and finishing or discarding it.
 */
export function CurrentSessionScreen() {
  const styles = useStyles();
  const { state } = useAuth();
  const token = state.status === 'signedIn' ? state.token : null;
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [groupingSuperset, setGroupingSuperset] = useState(false);
  const deletion = usePendingSetDeletion(token, session?.id ?? null, setSession, setError);
  // Records a Set just set, shown until dismissed or for a few seconds.
  const [justSet, setJustSet] = useState<PersonalRecord[]>([]);

  useEffect(() => {
    if (justSet.length === 0) return;
    const timer = setTimeout(() => setJustSet([]), RECORD_BANNER_MS);
    return () => clearTimeout(timer);
  }, [justSet]);

  /** Takes the Session as a change left it, telling the User of any record that change set. */
  function changed(updated: Session) {
    if (session) {
      const records = newRecords(session, updated);
      if (records.length > 0) setJustSet(records);
    }
    setSession(updated);
  }

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
          <Spinner />
        )}
      </Screen>
    );
  }

  async function finish() {
    if (!token || !session) return;
    setError(null);
    setFinishing(true);
    try {
      // A Set deleted just now goes before the workout is finished.
      await deletion.flush();
      const finished = await finishSession(token, session.id);
      // A Freeform session can be saved as a Routine; any can have set Personal records.
      const freeform = session.routineId === null;
      if (freeform || finished.personalRecords.length > 0) {
        router.replace({
          pathname: '/workout/finished',
          params: { sessionId: session.id, freeform: String(freeform) },
        });
      } else {
        router.back();
      }
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

  // A Set pending deletion is already gone, as far as the User can tell.
  const shown = deletion.pendingSetId ? withoutSet(session, deletion.pendingSetId) : session;
  const canFinish = hasSets(shown);
  const ungrouped = shown.exercises.filter((e) => e.supersetId === null);
  const recordSetIds = new Set(shown.personalRecords.map((r) => r.setId));
  const plannedRests = shown.exercises.flatMap((e) => (e.target?.restSeconds ? [e.target.restSeconds] : []));

  return (
    <Screen
      title="Current workout"
      footer={
        justSet.length > 0 || deletion.pendingSetId ? (
          <>
            {justSet.length > 0 ? <NewRecordBanner records={justSet} onDismiss={() => setJustSet([])} /> : null}
            {deletion.pendingSetId ? <SetDeletedBar onUndo={deletion.undo} /> : null}
          </>
        ) : null
      }
    >
      <Text style={styles.muted}>Started at {formatClockTime(session.startedAt)}</Text>
      {sessionBlocks(shown.exercises).map((block) =>
        block.kind === 'superset' ? (
          <SupersetBlock
            key={block.supersetId}
            sessionId={session.id}
            supersetId={block.supersetId}
            exercises={block.exercises}
            recordSetIds={recordSetIds}
            onChange={changed}
            onDeleteSet={deletion.remove}
          />
        ) : (
          <SessionExerciseCard
            key={block.exercise.id}
            sessionId={session.id}
            sessionExercise={block.exercise}
            recordSetIds={recordSetIds}
            onChange={changed}
            onDeleteSet={deletion.remove}
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
      <RestTimer plannedSeconds={plannedRests} />
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <Button label="Finish workout" onPress={finish} loading={finishing} disabled={!canFinish} />
      {canFinish ? null : <Text style={styles.muted}>Log a set to finish the workout.</Text>}
      <Button label="Discard workout" variant="secondary" tone="danger" onPress={confirmDiscard} />
    </Screen>
  );
}

const RECORD_BANNER_MS = 6000;

const useStyles = makeStyles((colors) => ({
  error: { color: colors.danger, fontSize: 15 },
  muted: { fontSize: 15, color: colors.muted },
}));
