import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/entities/auth';
import {
  formatClockTime,
  getCurrentSession,
  listSessionHistory,
  SessionSummaryItem,
  startSession,
  type Session,
  type SessionSummary,
} from '@/entities/workout';
import { ApiError, errorMessage } from '@/shared/api';
import { Button, colors, Screen, spacing } from '@/shared/ui';

type Loaded = { current: Session | null; history: SessionSummary[] };

/** The Workout tab: start or resume a workout, and the list of finished ones. */
export function WorkoutHomeScreen() {
  const { state } = useAuth();
  const token = state.status === 'signedIn' ? state.token : null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  // Reload on focus, so a workout finished or discarded on the next screen shows here.
  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      let current = true;
      Promise.all([getCurrentSession(token), listSessionHistory(token)])
        .then(([session, history]) => {
          if (!current) return;
          setLoaded({ current: session, history });
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
          <ActivityIndicator />
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
            History
          </Text>
          <View accessibilityLabel="Past workouts">
            {loaded.history.map((session) => (
              <SessionSummaryItem key={session.id} session={session} />
            ))}
            {loaded.history.length === 0 ? <Text style={styles.muted}>No finished workouts yet.</Text> : null}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  error: { color: colors.danger, fontSize: 15 },
  resume: { gap: spacing.sm },
  heading: { fontSize: 22, fontWeight: '700', color: colors.text, marginTop: spacing.md },
  muted: { fontSize: 17, color: colors.muted },
});
