import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { useAuth } from '@/entities/auth';
import {
  formatClockTime,
  formatSessionDate,
  formatSet,
  getSession,
  PersonalRecordList,
  SessionStatsLine,
  setRuns,
  workoutName,
  type Session,
} from '@/entities/workout';
import { errorMessage } from '@/shared/api';
import { makeStyles, Screen, spacing, Spinner } from '@/shared/ui';

/**
 * A finished Session, read-only: its stats and Personal records, then each of
 * its Exercises with its Sets, as many as its exercise count says.
 */
export function SessionDetailScreen() {
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useAuth();
  const token = state.status === 'signedIn' ? state.token : null;
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let current = true;
    getSession(token, id)
      .then((found) => current && setSession(found))
      .catch((e) => current && setError(errorMessage(e)));
    return () => {
      current = false;
    };
  }, [token, id]);

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

  const finishedAt = session.finishedAt ?? session.startedAt;
  return (
    <Screen title={workoutName(session)}>
      <View accessibilityLabel="Workout detail" style={styles.detail}>
        <Text style={styles.muted}>
          {formatSessionDate(finishedAt)}, {formatClockTime(session.startedAt)} – {formatClockTime(finishedAt)}
        </Text>
        {session.stats ? <SessionStatsLine stats={session.stats} /> : null}
        {session.personalRecords ? <PersonalRecordList records={session.personalRecords} /> : null}
        {session.exercises.map((exercise) => (
            <View key={exercise.id} style={styles.exercise}>
              {exercise.sets.length === 0 ? (
                <>
                  <Text accessibilityRole="header" style={styles.name}>
                    {exercise.name}
                  </Text>
                  <Text style={styles.muted}>No sets logged.</Text>
                </>
              ) : null}
              {setRuns(exercise).map((run) => (
                <View key={run.sets[0].set.id} style={styles.run}>
                  <Text accessibilityRole="header" style={styles.name}>
                    {run.name}
                  </Text>
                  {run.sets.map(({ set, number }) => (
                    <View key={set.id} style={styles.set}>
                      <Text style={styles.number}>{number}</Text>
                      <View style={styles.setBody}>
                        <Text style={styles.setText}>{formatSet(set)}</Text>
                        {set.note ? <Text style={styles.muted}>{set.note}</Text> : null}
                      </View>
                    </View>
                  ))}
                </View>
              ))}
              {exercise.note ? <Text style={styles.muted}>{exercise.note}</Text> : null}
            </View>
          ))}
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  error: { color: colors.danger, fontSize: 15 },
  detail: { gap: spacing.md },
  exercise: { backgroundColor: colors.card, borderRadius: 12, padding: spacing.md, gap: spacing.sm },
  run: { gap: spacing.xs },
  name: { fontSize: 17, fontWeight: '700', color: colors.text },
  set: { flexDirection: 'row', gap: spacing.md },
  number: { width: 20, fontSize: 15, color: colors.muted },
  setBody: { flex: 1, gap: 2 },
  setText: { fontSize: 15, color: colors.text },
  muted: { fontSize: 15, color: colors.muted },
}));
