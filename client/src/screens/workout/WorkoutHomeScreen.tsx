import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { useAuth } from '@/entities/auth';
import { listRoutines, RoutineSummaryItem, type RoutineSummary } from '@/entities/routine';
import { formatClockTime, getCurrentSession, startSession, type Session } from '@/entities/workout';
import { ApiError, errorMessage } from '@/shared/api';
import { Button, makeStyles, Screen, spacing, Spinner } from '@/shared/ui';

type Loaded = { current: Session | null; routines: RoutineSummary[] };

/**
 * The Workout tab: start or resume a workout, and the Routines to start one
 * from. Finished ones are on the History tab.
 */
export function WorkoutHomeScreen() {
  const styles = useStyles();
  const { state } = useAuth();
  const token = state.status === 'signedIn' ? state.token : null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  // Reload on focus, so a workout or routine changed on another screen shows here.
  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      let current = true;
      Promise.all([getCurrentSession(token), listRoutines(token)])
        .then(([session, routines]) => {
          if (!current) return;
          setLoaded({ current: session, routines });
          setError(null);
        })
        .catch((e) => current && setError(errorMessage(e)));
      return () => {
        current = false;
      };
    }, [token]),
  );

  async function start() {
    if (!token) return;
    setError(null);
    setStarting(true);
    try {
      await startSession(token);
    } catch (e) {
      // Started on another device: open that one instead.
      if (!(e instanceof ApiError && e.code === 'session_in_progress')) {
        setError(errorMessage(e));
        setStarting(false);
        return;
      }
    }
    setStarting(false);
    router.push('/workout/session');
  }

  return (
    <Screen title="Workout">
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      {loaded === null ? (
        error ? null : (
          <Spinner />
        )
      ) : (
        <>
          {loaded.current ? (
            <View style={styles.resume}>
              <Text style={styles.muted}>Workout in progress since {formatClockTime(loaded.current.startedAt)}</Text>
              <Button label="Resume workout" onPress={() => router.push('/workout/session')} />
            </View>
          ) : (
            <Button label="Start Workout" onPress={start} loading={starting} />
          )}
          <Text accessibilityRole="header" style={styles.heading}>
            Routines
          </Text>
          <View accessibilityLabel="Routines">
            {loaded.routines.map((routine) => (
              <RoutineSummaryItem
                key={routine.id}
                routine={routine}
                onPress={() => router.push({ pathname: '/workout/routines/[id]', params: { id: routine.id } })}
              />
            ))}
            {loaded.routines.length === 0 ? <Text style={styles.muted}>No routines yet.</Text> : null}
          </View>
          <Button label="New routine" variant="secondary" onPress={() => router.push('/workout/routines/new')} />
        </>
      )}
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  error: { color: colors.danger, fontSize: 15 },
  resume: { gap: spacing.sm },
  heading: { fontSize: 22, fontWeight: '700', color: colors.text, marginTop: spacing.md },
  muted: { fontSize: 17, color: colors.muted },
}));
