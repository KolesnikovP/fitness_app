import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { useAuth } from '@/entities/auth';
import {
  formatClockTime,
  formatSessionDate,
  formatSet,
  formatSetWithTier,
  getSession,
  PersonalRecordList,
  RecordTierMedal,
  SessionStatsLine,
  setRuns,
  workoutName,
  type Session,
  type SessionSet,
  useRecordTierColours,
} from '@/entities/workout';
import { errorMessage } from '@/shared/api';
import { makeStyles, Screen, spacing, Spinner } from '@/shared/ui';

/**
 * A finished Session, read-only: its stats and Personal records, then each of
 * its Exercises with its Sets, as many as its exercise count says. A Set
 * with a Record tier is filled in its colour and shows its medal.
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
        <PersonalRecordList records={session.personalRecords} />
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
                  <SetLine key={set.id} set={set} number={number} />
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

/**
 * A Set as a line: its number and values, and its note below. A Set with a
 * Record tier is filled in the tier's colour, ends in its medal, and says its
 * tier after its values, as in the set table. The note is read on its own.
 */
function SetLine({ set, number }: { set: SessionSet; number: number }) {
  const styles = useStyles();
  const tier = set.recordTier;
  const colours = useRecordTierColours(tier);
  return (
    <View style={[styles.line, tier && [styles.tiered, colours.fill]]}>
      <View
        accessible
        accessibilityLabel={`Set ${number}`}
        accessibilityValue={{ text: formatSetWithTier(set) }}
        style={styles.set}
      >
        <Text style={[styles.number, colours.text]}>{number}</Text>
        <Text style={[styles.setText, colours.text]}>{formatSet(set)}</Text>
        {tier ? <RecordTierMedal tier={tier} /> : null}
      </View>
      {set.note ? <Text style={[styles.muted, styles.note, colours.text]}>{set.note}</Text> : null}
    </View>
  );
}

/** The Set number's column. */
const NUMBER_WIDTH = 20;

const useStyles = makeStyles((colors) => ({
  error: { color: colors.danger, fontSize: 15 },
  detail: { gap: spacing.md },
  exercise: { backgroundColor: colors.card, borderRadius: 12, padding: spacing.md, gap: spacing.sm },
  run: { gap: spacing.xs },
  name: { fontSize: 17, fontWeight: '700', color: colors.text },
  line: { gap: 2 },
  set: { flexDirection: 'row', gap: spacing.md },
  number: { width: NUMBER_WIDTH, fontSize: 15, color: colors.muted },
  // Under the values, past the number.
  note: { paddingLeft: NUMBER_WIDTH + spacing.md },
  tiered: { borderRadius: 8, marginHorizontal: -spacing.xs, paddingHorizontal: spacing.xs, paddingVertical: 2 },
  setText: { flex: 1, fontSize: 15, color: colors.text },
  muted: { fontSize: 15, color: colors.muted },
}));
