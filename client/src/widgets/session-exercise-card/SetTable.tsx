import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useAuth } from '@/entities/auth';
import {
  addedAfterLogging,
  formatSet,
  nextSetDraft,
  pendingSetCount,
  recordTierLabels,
  recordTierMedals,
  setColumns,
  setRuns,
  type RecordTier,
  type Session,
  type SessionExercise,
  type SessionSet,
  type SetDraft,
} from '@/entities/workout';
import { EditSetForm } from '@/features/edit-set';
import { PendingSetRow } from '@/features/log-set';
import { Button, makeStyles, spacing } from '@/shared/ui';

type SetTableProps = {
  sessionId: string;
  sessionExercise: SessionExercise;
  onChange: (session: Session) => void;
  onDeleteSet: (setId: string) => void;
};

/**
 * A Session exercise's Sets as a table, a column each for weight, reps and
 * RPE: the logged ones (tap one to correct or delete it), then a row for each
 * Set still to do, ready at the Target, with a box to tick to log it. "Add
 * set" adds another row. Once a swap means the Sets were done with more than
 * one Exercise, each run of them is labelled with its Exercise, and so are
 * the rows still to do. A logged Set with a Record tier is filled in its
 * colour and shows its medal.
 */
export function SetTable({ sessionId, sessionExercise, onChange, onDeleteSet }: SetTableProps) {
  const styles = useStyles();
  const { state } = useAuth();
  const unit = state.status === 'signedIn' ? (state.me.unitPreference ?? 'kg') : 'kg';
  const [editingSetId, setEditingSetId] = useState<string | null>(null);
  // Rows the User added beyond the Target, and what they've typed in each
  // row still to do, by position; a row they haven't touched follows the
  // last Set logged.
  const [added, setAdded] = useState(0);
  const [drafts, setDrafts] = useState<(SetDraft | undefined)[]>([]);

  const logged = sessionExercise.sets;
  const runs = setRuns(sessionExercise);
  const labelled = runs.some((run) => run.exerciseId !== sessionExercise.exerciseId);
  // Rows still to do are for the Exercise being done now; they start a new
  // run when the last Sets were done with another.
  const pendingLabel = labelled && runs.at(-1)?.exerciseId !== sessionExercise.exerciseId;
  const pending = pendingSetCount(sessionExercise, added);
  const fresh = nextSetDraft(sessionExercise, unit);

  function changeDraft(index: number, draft: SetDraft) {
    setDrafts((current) => {
      const next = [...current];
      next[index] = draft;
      return next;
    });
  }

  function onLogged(index: number, session: Session) {
    setAdded((n) => addedAfterLogging(sessionExercise, n));
    setDrafts((current) => current.filter((_, i) => i !== index));
    onChange(session);
  }

  return (
    <View accessibilityLabel="Sets" style={styles.table}>
      <View style={[setColumns.row, styles.header]}>
        <Text style={[setColumns.number, styles.heading]}>SET</Text>
        <Text style={[setColumns.weight, styles.heading]}>{unit.toUpperCase()}</Text>
        <Text style={[setColumns.reps, styles.heading]}>REPS</Text>
        <Text style={[setColumns.rpe, styles.heading]}>RPE</Text>
        <View style={setColumns.done} />
      </View>
      {runs.map((run, r) => (
        <View key={`run-${r}`} style={styles.table}>
          {labelled ? <RunLabel name={run.name} /> : null}
          {run.sets.map(({ set, number }) =>
            set.id === editingSetId ? (
              <EditSetForm
                key={set.id}
                sessionId={sessionId}
                set={set}
                number={number}
                onSaved={(session) => {
                  setEditingSetId(null);
                  onChange(session);
                }}
                onDelete={() => {
                  setEditingSetId(null);
                  onDeleteSet(set.id);
                }}
                onCancel={() => setEditingSetId(null)}
              />
            ) : (
              <LoggedSetRow
                key={set.id}
                set={set}
                number={number}
                unit={unit}
                onPress={() => setEditingSetId(set.id)}
              />
            ),
          )}
        </View>
      ))}
      {pendingLabel && pending > 0 ? <RunLabel name={sessionExercise.name} /> : null}
      {Array.from({ length: pending }, (_, i) => (
        <PendingSetRow
          key={`pending-${i}`}
          sessionId={sessionId}
          sessionExerciseId={sessionExercise.id}
          number={logged.length + i + 1}
          draft={drafts[i] ?? fresh}
          onChange={(draft) => changeDraft(i, draft)}
          weightUnit={unit}
          onLogged={(session) => onLogged(i, session)}
        />
      ))}
      <Button label="+ Add set" variant="link" onPress={() => setAdded((n) => n + 1)} />
    </View>
  );
}

/** The Exercise a run of Sets was done with, above them. */
function RunLabel({ name }: { name: string }) {
  const styles = useStyles();
  return (
    <Text accessibilityRole="header" style={styles.runLabel}>
      {name}
    </Text>
  );
}

type LoggedSetRowProps = {
  set: SessionSet;
  number: number;
  /** The table's unit; a Set logged in the other one says so. */
  unit: string;
  onPress: () => void;
};

/**
 * A logged Set as a row of the table, its values in their columns, and its
 * note below. A Set with a Record tier is filled in the tier's colour, with
 * its medal by the Set number, and says its tier after its values.
 */
function LoggedSetRow({ set, number, unit, onPress }: LoggedSetRowProps) {
  const styles = useStyles();
  const tier = set.recordTier;
  const text = tier ? styles[`${tier}Text`] : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Edit set ${number}`}
      accessibilityValue={{ text: tier ? `${formatSet(set)}, ${recordTierLabels[tier]}` : formatSet(set) }}
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <View style={[setColumns.row, styles.logged, tier && styles[tier]]}>
        <Text style={[setColumns.number, styles.number, text]}>
          {number}
          {tier ? <Medal tier={tier} /> : null}
        </Text>
        <Text style={[setColumns.weight, styles.value, text]}>
          {set.weight}
          {set.weightUnit !== unit ? ` ${set.weightUnit}` : ''}
        </Text>
        <Text style={[setColumns.reps, styles.value, text]}>{set.reps}</Text>
        <Text style={[setColumns.rpe, styles.value, text]}>{set.rpe ?? '–'}</Text>
        <View style={setColumns.done}>
          <View style={styles.checked}>
            <Text style={styles.checkMark}>✓</Text>
          </View>
        </View>
      </View>
      {set.note ? <Text style={styles.note}>{set.note}</Text> : null}
    </Pressable>
  );
}

/** A Record tier's medal, after the Set number; the row's value says the tier. */
function Medal({ tier }: { tier: RecordTier }) {
  const styles = useStyles();
  return (
    <Text importantForAccessibility="no" style={styles.medal}>
      {' '}
      {recordTierMedals[tier]}
    </Text>
  );
}

const useStyles = makeStyles((colors) => ({
  table: { gap: spacing.xs },
  header: { paddingBottom: 2 },
  heading: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, color: colors.muted, textAlign: 'center' },
  logged: { minHeight: 40, borderRadius: 8, backgroundColor: colors.successSubtle },
  runLabel: { fontSize: 13, fontWeight: '600', color: colors.text, paddingTop: spacing.xs },
  pressed: { opacity: 0.5 },
  number: { fontSize: 17, color: colors.muted, textAlign: 'center' },
  medal: { fontSize: 13 },
  gold: { backgroundColor: colors.gold },
  goldText: { color: colors.goldText },
  silver: { backgroundColor: colors.silver },
  silverText: { color: colors.silverText },
  bronze: { backgroundColor: colors.bronze },
  bronzeText: { color: colors.bronzeText },
  value: { fontSize: 17, color: colors.text, textAlign: 'center' },
  // The box a row still to do shows, ticked.
  checked: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.success,
  },
  checkMark: { fontSize: 17, fontWeight: '700', color: colors.successText },
  note: { fontSize: 15, color: colors.muted, paddingLeft: 34, paddingTop: 2 },
}));
