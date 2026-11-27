import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';

import { useAuth } from '@/entities/auth';
import {
  discardSession,
  finishSession,
  getCurrentSession,
  hasRowsToDo,
  hasSets,
  inBlockOrder,
  NewRecordBanner,
  newRecords,
  sessionBlocks,
  withoutExercise,
  withoutSet,
  type PersonalRecord,
  type Session,
  type SessionExercise,
} from '@/entities/workout';
import { usePendingSetDeletion } from '@/features/delete-set';
import { usePendingExerciseRemoval } from '@/features/remove-exercise';
import { errorMessage } from '@/shared/api';
import { makeStyles, Screen, Spinner, UndoBar } from '@/shared/ui';
import { SessionExerciseCard, useRowsToDo } from '@/widgets/session-exercise-card';
import { SessionExerciseStrip } from '@/widgets/session-exercise-strip';

import { SessionHeader } from './SessionHeader';

/**
 * The workout in progress, one Session exercise at a time: a header of
 * session-wide controls (see SessionHeader), a strip of tiles to switch
 * between them and add another (its tiles mark each Superset), and the one
 * shown with its chips and Sets.
 */
export function CurrentSessionScreen() {
  const styles = useStyles();
  const { state } = useAuth();
  const token = state.status === 'signedIn' ? state.token : null;
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  // Which Session exercise is shown; see takeLoaded, removeExercise and undoRemoval.
  const [shownId, setShownId] = useState<string | null>(null);
  // The Session exercises as last loaded, to tell one just added; null until the first load.
  const loadedIds = useRef<Set<string> | null>(null);
  const deletion = usePendingSetDeletion(token, session?.id ?? null, setSession, setError);
  const removal = usePendingExerciseRemoval(token, session?.id ?? null, setSession, setError);
  // Kept here, so a Session exercise's rows still to do survive while another is shown.
  const rowsToDo = useRowsToDo();
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
    // A Session exercise this change brought, if any, isn't one to show on the next load.
    if (loadedIds.current) loadedIds.current = new Set(updated.exercises.map((e) => e.id));
    setSession(updated);
  }

  /**
   * Takes the Session as loaded. The first time, shows the first Session
   * exercise with a row still to do, else the first; after that, shows one
   * just added on the picker screen.
   */
  const takeLoaded = useCallback((found: Session) => {
    const before = loadedIds.current;
    loadedIds.current = new Set(found.exercises.map((e) => e.id));
    if (!before) {
      const ordered = inBlockOrder(found.exercises);
      setShownId((ordered.find(hasRowsToDo) ?? ordered[0])?.id ?? null);
    } else {
      const added = found.exercises.filter((e) => !before.has(e.id)).at(-1);
      if (added) setShownId(added.id);
    }
    setSession(found);
  }, []);

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
          else takeLoaded(found);
        })
        .catch((e) => current && setError(errorMessage(e)));
      return () => {
        current = false;
      };
    }, [token, takeLoaded]),
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
      // A Set deleted or an exercise removed just now goes before the workout
      // is finished; if it can't, the workout isn't finished either.
      if (!(await deletion.flush()) || !(await removal.flush())) {
        setFinishing(false);
        return;
      }
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

  // Discarding deletes everything, so once it has, a Set deletion or exercise
  // removal waiting out its Undo window is dropped rather than sent (as leaving
  // the screen would) to a Session that's gone.
  async function discard() {
    if (!token || !session) return;
    try {
      await discardSession(token, session.id);
      deletion.undo();
      removal.undo();
      router.back();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  // One thing can be undone at a time: deleting a Set sends an exercise's
  // pending removal, and removing an exercise sends a Set's pending deletion.
  function deleteSet(setId: string) {
    void removal.flush();
    deletion.remove(setId);
  }
  // Removing the Session exercise shown shows the next, else the previous.
  function removeExercise(sessionExerciseId: string) {
    void deletion.flush();
    if (sessionExerciseId === shownExercise?.id) {
      const i = ordered.findIndex((e) => e.id === sessionExerciseId);
      setShownId((ordered[i + 1] ?? ordered[i - 1])?.id ?? null);
    }
    removal.remove(sessionExerciseId);
  }
  // Grouping or ungrouping sends a pending removal first: the server still has
  // the exercise in its Superset until then.
  function beforeSupersetChange() {
    return removal.flush();
  }
  // Replacing sends what's pending first, as the request starts from what
  // the server has; if that fails, its error shows here and the picker doesn't open.
  async function replaceExercise(sessionExercise: SessionExercise) {
    if (!session) return;
    if (!(await deletion.flush()) || !(await removal.flush())) return;
    router.push({
      pathname: '/workout/replace-exercise',
      params: { sessionId: session.id, sessionExerciseId: sessionExercise.id, exerciseId: sessionExercise.exerciseId },
    });
  }
  // Undoing a removal shows the Session exercise again.
  function undoRemoval() {
    const restored = removal.pendingExerciseId;
    removal.undo();
    if (restored) setShownId(restored);
  }

  // A Set pending deletion or an exercise pending removal is already gone, as
  // far as the User can tell.
  let shown = session;
  if (deletion.pendingSetId) shown = withoutSet(shown, deletion.pendingSetId);
  if (removal.pendingExerciseId) shown = withoutExercise(shown, removal.pendingExerciseId);
  const canFinish = hasSets(shown);
  const ungrouped = shown.exercises.filter((e) => e.supersetId === null);
  const blocks = sessionBlocks(shown.exercises);
  const ordered = inBlockOrder(shown.exercises);
  const shownExercise = ordered.find((e) => e.id === shownId) ?? ordered[0] ?? null;
  const plannedRests = shown.exercises.flatMap((e) => (e.target?.restSeconds ? [e.target.restSeconds] : []));

  return (
    <Screen
      headerTitle="Current workout"
      header={
        <SessionHeader
          startedAt={session.startedAt}
          plannedRests={plannedRests}
          canFinish={canFinish}
          finishing={finishing}
          onFinish={finish}
          onDiscard={discard}
        />
      }
      footer={
        justSet.length > 0 || deletion.pendingSetId || removal.pendingExerciseId ? (
          <>
            {justSet.length > 0 ? <NewRecordBanner records={justSet} onDismiss={() => setJustSet([])} /> : null}
            {deletion.pendingSetId ? <UndoBar message="Set deleted." onUndo={deletion.undo} /> : null}
            {removal.pendingExerciseId ? <UndoBar message="Exercise removed." onUndo={undoRemoval} /> : null}
          </>
        ) : null
      }
    >
      <SessionExerciseStrip
        token={token}
        blocks={blocks}
        shownId={shownExercise?.id ?? null}
        onShow={setShownId}
        onAdd={() => router.push({ pathname: '/workout/add-exercise', params: { sessionId: session.id } })}
      />
      {shownExercise ? (
        <SessionExerciseCard
          key={shownExercise.id}
          sessionId={session.id}
          sessionExercise={shownExercise}
          freeToGroup={ungrouped.filter((e) => e.id !== shownExercise.id)}
          onChange={changed}
          onBeforeSupersetChange={beforeSupersetChange}
          onDeleteSet={deleteSet}
          onRemove={removeExercise}
          onReplace={replaceExercise}
          rows={rowsToDo.rowsOf(shownExercise)}
          onRowsChange={(change) => rowsToDo.change(shownExercise, change)}
        />
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </Screen>
  );
}

const RECORD_BANNER_MS = 6000;

const useStyles = makeStyles((colors) => ({
  error: { color: colors.danger, fontSize: 15 },
}));
