import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/entities/auth';
import {
  addedAfterLogging,
  formatSet,
  nextSetDraft,
  pendingSetCount,
  setColumns,
  setRuns,
  type Session,
  type SessionExercise,
  type SessionSet,
  type SetDraft,
} from '@/entities/workout';
import { EditSetForm } from '@/features/edit-set';
import { PendingSetRow } from '@/features/log-set';
import { Button, colors, spacing } from '@/shared/ui';

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
 * the rows still to do.
 */
export function SetTable({ sessionId, sessionExercise, onChange, onDeleteSet }: SetTableProps) {
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

/** A logged Set as a row of the table, its values in their columns, and its note below. */
function LoggedSetRow({ set, number, unit, onPress }: LoggedSetRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Edit set ${number}`}
      accessibilityValue={{ text: formatSet(set) }}
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <View style={[setColumns.row, styles.logged]}>
        <Text style={[setColumns.number, styles.number]}>{number}</Text>
        <Text style={[setColumns.weight, styles.value]}>
          {set.weight}
          {set.weightUnit !== unit ? ` ${set.weightUnit}` : ''}
        </Text>
        <Text style={[setColumns.reps, styles.value]}>{set.reps}</Text>
        <Text style={[setColumns.rpe, styles.value]}>{set.rpe ?? '–'}</Text>
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

const styles = StyleSheet.create({
  table: { gap: spacing.xs },
  header: { paddingBottom: 2 },
  heading: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, color: colors.muted, textAlign: 'center' },
  logged: { minHeight: 40, borderRadius: 8, backgroundColor: '#EEF7EE' },
  runLabel: { fontSize: 13, fontWeight: '600', color: colors.text, paddingTop: spacing.xs },
  pressed: { opacity: 0.5 },
  number: { fontSize: 17, color: colors.muted, textAlign: 'center' },
  value: { fontSize: 17, color: colors.text, textAlign: 'center' },
  // The box a row still to do shows, ticked.
  checked: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2E9E44',
  },
  checkMark: { fontSize: 17, fontWeight: '700', color: colors.primaryText },
  note: { fontSize: 15, color: colors.muted, paddingLeft: 34, paddingTop: 2 },
});
