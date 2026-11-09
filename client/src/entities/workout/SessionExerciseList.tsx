import { Text, View } from 'react-native';

import { makeStyles, spacing } from '@/shared/ui';

import { formatSet, formatSetWithTier, setRuns, type SessionExercise, type SessionSet } from './model';
import { RecordTierMedal, useRecordTierColours } from './RecordTier';

/**
 * A Session's Exercises, read-only, each with every one of its Sets. A Set
 * with a Record tier is filled in its colour and shows its medal.
 */
export function SessionExerciseList({ exercises }: { exercises: SessionExercise[] }) {
  const styles = useStyles();
  return (
    <>
      {exercises.map((exercise) => (
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
              {run.sets.map(({ set, number, mark }) => (
                <SetLine key={set.id} set={set} number={number} mark={mark} />
              ))}
            </View>
          ))}
          {exercise.note ? <Text style={styles.muted}>{exercise.note}</Text> : null}
        </View>
      ))}
    </>
  );
}

/**
 * A Set as a line: its mark (its number, or its type's letter, as in the set
 * table) and values, and its note below. A Set with a
 * Record tier is filled in the tier's colour, ends in its medal, and says its
 * tier after its values, as in the set table. The note is read on its own.
 */
function SetLine({ set, number, mark }: { set: SessionSet; number: number; mark: string }) {
  const styles = useStyles();
  const tier = set.recordTier;
  const colours = useRecordTierColours(tier);
  return (
    <View style={[styles.line, tier && styles.tiered, colours.fill]}>
      <View
        accessible
        accessibilityLabel={`Set ${number}`}
        accessibilityValue={{ text: formatSetWithTier(set) }}
        style={styles.set}
      >
        <Text style={[styles.number, colours.text, set.type !== 'normal' && [styles.letter, styles[set.type]]]}>
          {mark}
        </Text>
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
  exercise: { backgroundColor: colors.card, borderRadius: 12, padding: spacing.md, gap: spacing.sm },
  run: { gap: spacing.xs },
  name: { fontSize: 17, fontWeight: '700', color: colors.text },
  line: { gap: 2 },
  set: { flexDirection: 'row', gap: spacing.md },
  number: { width: NUMBER_WIDTH, fontSize: 15, color: colors.muted },
  letter: { fontWeight: '800' },
  warmup: { color: colors.link },
  failure: { color: colors.danger },
  drop: { color: colors.dropSet },
  // Under the values, past the number.
  note: { paddingLeft: NUMBER_WIDTH + spacing.md },
  tiered: { borderRadius: 8, marginHorizontal: -spacing.xs, paddingHorizontal: spacing.xs, paddingVertical: 2 },
  setText: { flex: 1, fontSize: 15, color: colors.text },
  muted: { fontSize: 15, color: colors.muted },
}));
