import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { useAuth } from '@/entities/auth';
import {
  getTotals,
  listSessionHistory,
  SessionSummaryItem,
  TotalsCard,
  weekAround,
  type SessionSummary,
  type Totals,
} from '@/entities/workout';
import { errorMessage } from '@/shared/api';
import { makeStyles, Screen, spacing, Spinner } from '@/shared/ui';
import { TrainingCalendar } from '@/widgets/training-calendar';

type Loaded = { history: SessionSummary[]; week: Totals };

/**
 * The History tab: this week's totals, a calendar of the days the User
 * trained, and their finished Sessions, newest first.
 */
export function HistoryScreen() {
  const styles = useStyles();
  const { state } = useAuth();
  const token = state.status === 'signedIn' ? state.token : null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reload on focus, so a workout finished on the Workout tab shows here.
  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      let current = true;
      const { from, to } = weekAround(new Date());
      Promise.all([listSessionHistory(token), getTotals(token, from, to)])
        .then(([history, week]) => {
          if (!current) return;
          setLoaded({ history, week });
          setError(null);
        })
        .catch((e) => current && setError(errorMessage(e)));
      return () => {
        current = false;
      };
    }, [token]),
  );

  return (
    <Screen title="History">
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
          <TotalsCard title="This week" totals={loaded.week} />
          <TrainingCalendar finishedAt={loaded.history.map((s) => s.finishedAt)} />
          <Text accessibilityRole="header" style={styles.heading}>
            Workouts
          </Text>
          <View accessibilityLabel="Past workouts">
            {loaded.history.map((session) => (
              <SessionSummaryItem
                key={session.id}
                session={session}
                onPress={() => router.push({ pathname: '/sessions/[id]', params: { id: session.id } })}
              />
            ))}
            {loaded.history.length === 0 ? <Text style={styles.muted}>No finished workouts yet.</Text> : null}
          </View>
        </>
      )}
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  error: { color: colors.danger, fontSize: 15 },
  heading: { fontSize: 22, fontWeight: '700', color: colors.text, marginTop: spacing.sm },
  muted: { fontSize: 17, color: colors.muted },
}));
