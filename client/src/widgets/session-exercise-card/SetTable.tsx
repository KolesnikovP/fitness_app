import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useAuth } from '@/entities/auth';
import {
  formatSetWithTier,
  LastTimeCell,
  lastTimeAtPlaces,
  type LastTimeSet,
  pendingSetDrafts,
  RecordTierMedal,
  setColumns,
  setMarks,
  setRuns,
  type Session,
  type SessionExercise,
  type SessionSet,
  rowsAfterLogging,
  rowKeys,
  rowsAfterRemoving,
  type RowsToDo,
  withRowsUsedUp,
  withRowAdded,
  withRowTyped,
  useRecordTierColours,
} from '@/entities/workout';
import { EditSetForm, LoggedSetTypeSelect } from '@/features/edit-set';
import { PendingSetRow } from '@/features/log-set';
import { Button, makeStyles, spacing, SwipeToDelete } from '@/shared/ui';

import type { RowsChange } from './useRowsToDo';

type SetTableProps = {
  sessionId: string;
  sessionExercise: SessionExercise;
  onChange: (session: Session) => void;
  onDeleteSet: (setId: string) => void;
  /** What the User did to its rows still to do, kept by the screen (see useRowsToDo). */
  rows: RowsToDo;
  onRowsChange: (change: RowsChange) => void;
};

/**
 * A Session exercise's Sets as a table, a column each for Last time's Set at
 * the same place, weight, reps and RPE: the logged ones (tap one to correct
 * or delete it, or swipe it left to delete it), then a row for each Set
 * still to do, ready from Last time or the row above, else at the Target
 * (see pendingSetDrafts), with a box to tick to log it. Each row starts with
 * the Set's mark, its number or its type's letter, tapped to change its Set
 * type. "Add set" adds another row. Once a swap means the Sets were done with
 * more than one Exercise, each run of them is labelled with its Exercise, and
 * so are the rows still to do. A logged Set with a Record tier is filled in
 * its colour and shows its medal.
 */
export function SetTable({ sessionId, sessionExercise, onChange, onDeleteSet, rows, onRowsChange }: SetTableProps) {
  const styles = useStyles();
  const { state } = useAuth();
  const unit = state.status === 'signedIn' ? (state.me.unitPreference ?? 'kg') : 'kg';
  const [editingSetId, setEditingSetId] = useState<string | null>(null);

  const logged = sessionExercise.sets;
  const runs = setRuns(sessionExercise);
  const labelled = runs.some((run) => run.exerciseId !== sessionExercise.exerciseId);
  // Rows still to do are for the Exercise being done now; they start a new
  // run when the last Sets were done with another.
  const pendingLabel = labelled && runs.at(-1)?.exerciseId !== sessionExercise.exerciseId;
  const pendingDrafts = pendingSetDrafts(sessionExercise, unit, rows);
  const pending = pendingDrafts.length;
  const keys = rowKeys(sessionExercise, rows);
  const pendingTypes = pendingDrafts.map((d) => d.type);
  const marks = setMarks([...logged.map((s) => s.type), ...pendingTypes]);
  const lastTime = lastTimeAtPlaces(sessionExercise, pendingTypes, rows);

  // By key, not position: rows above may be removed while the Set is on its way.
  function onLogged(key: number, session: Session) {
    const after = session.exercises.find((e) => e.id === sessionExercise.id) ?? sessionExercise;
    onRowsChange((current) => rowsAfterLogging(sessionExercise, after, current, key));
    onChange(session);
  }

  // A logged Set deleted or changed leaves the rows it used up used up (see
  // withRowsUsedUp).
  function deleteSet(setId: string) {
    onRowsChange((current) => withRowsUsedUp(sessionExercise, current));
    onDeleteSet(setId);
  }
  function setChanged(session: Session) {
    onRowsChange((current) => withRowsUsedUp(sessionExercise, current));
    onChange(session);
  }

  return (
    <View accessibilityLabel="Sets" style={styles.table}>
      <View style={[setColumns.row, styles.header]}>
        <Text style={[setColumns.number, styles.heading]}>SET</Text>
        <Text style={[setColumns.lastTime, styles.heading]}>PREV</Text>
        <Text style={[setColumns.weight, styles.heading]}>{unit.toUpperCase()}</Text>
        <Text style={[setColumns.reps, styles.heading]}>REPS</Text>
        <Text style={[setColumns.rpe, styles.heading]}>RPE</Text>
        <View style={setColumns.done} />
      </View>
      {runs.map((run) => (
        <View key={run.sets[0].set.id} style={styles.table}>
          {labelled ? <RunLabel name={run.name} /> : null}
          {run.sets.map(({ set, number, mark }) =>
            set.id === editingSetId ? (
              <EditSetForm
                key={set.id}
                sessionId={sessionId}
                set={set}
                number={number}
                onSaved={(session) => {
                  setEditingSetId(null);
                  setChanged(session);
                }}
                onDelete={() => {
                  setEditingSetId(null);
                  deleteSet(set.id);
                }}
                onCancel={() => setEditingSetId(null)}
              />
            ) : (
              <SwipeToDelete key={set.id} deleteLabel={`Delete set ${number}`} onDelete={() => deleteSet(set.id)}>
                <LoggedSetRow
                  sessionId={sessionId}
                  set={set}
                  number={number}
                  mark={mark}
                  unit={unit}
                  lastTime={lastTime[number - 1]}
                  onPress={() => setEditingSetId(set.id)}
                  onChange={setChanged}
                />
              </SwipeToDelete>
            ),
          )}
        </View>
      ))}
      {pendingLabel && pending > 0 ? <RunLabel name={sessionExercise.name} /> : null}
      {keys.map((key, i) => (
        <SwipeToDelete
          key={`pending-${key}`}
          deleteLabel={`Delete set ${logged.length + i + 1}`}
          onDelete={() => onRowsChange((current) => rowsAfterRemoving(sessionExercise, current, key))}
        >
          <PendingSetRow
            sessionId={sessionId}
            sessionExerciseId={sessionExercise.id}
            number={logged.length + i + 1}
            mark={marks[logged.length + i]}
            draft={pendingDrafts[i]}
            lastTime={lastTime[logged.length + i]}
            onChange={(draft) => onRowsChange((current) => withRowTyped(current, i, draft))}
            weightUnit={unit}
            onLogged={(session) => onLogged(key, session)}
          />
        </SwipeToDelete>
      ))}
      <Button label="+ Add set" variant="link" onPress={() => onRowsChange(withRowAdded)} />
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
  sessionId: string;
  set: SessionSet;
  number: number;
  /** What marks it in the number column (see setMarks). */
  mark: string;
  /** The table's unit; a Set logged in the other one says so. */
  unit: string;
  /** Last time's Set at its place, if there was one. */
  lastTime: LastTimeSet | undefined;
  onPress: () => void;
  onChange: (session: Session) => void;
};

/**
 * A logged Set as a row of the table: its mark, tapped to change its Set
 * type, then last time's Set at its place, then its values in their columns,
 * tapped to correct it, and its note below. A Set with a Record tier is filled in the tier's colour, with its
 * medal on its mark's corner, and says its tier after its values.
 */
function LoggedSetRow({ sessionId, set, number, mark, unit, lastTime, onPress, onChange }: LoggedSetRowProps) {
  const styles = useStyles();
  const tier = set.recordTier;
  const { fill, text } = useRecordTierColours(tier);
  return (
    <View>
      <View style={[setColumns.row, styles.logged, fill]}>
        <View style={[setColumns.number, styles.markCell]}>
          <LoggedSetTypeSelect
            sessionId={sessionId}
            set={set}
            number={number}
            mark={mark}
            textStyle={text}
            onSaved={onChange}
          />
          {tier ? (
            <View style={styles.medal} pointerEvents="none">
              <RecordTierMedal tier={tier} />
            </View>
          ) : null}
        </View>
        <LastTimeCell number={number} set={lastTime} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Edit set ${number}`}
          accessibilityValue={{ text: formatSetWithTier(set) }}
          onPress={onPress}
          style={({ pressed }) => [setColumns.values, styles.values, pressed && styles.pressed]}
        >
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
        </Pressable>
      </View>
      {set.note ? <Text style={styles.note}>{set.note}</Text> : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  table: { gap: spacing.xs },
  header: { paddingBottom: 2 },
  heading: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, color: colors.muted, textAlign: 'center' },
  logged: { minHeight: 40, borderRadius: 8, backgroundColor: colors.successSubtle },
  runLabel: { fontSize: 13, fontWeight: '600', color: colors.text, paddingTop: spacing.xs },
  pressed: { opacity: 0.5 },
  markCell: { justifyContent: 'center' },
  // A badge on the corner of the mark's box.
  medal: { position: 'absolute', top: -6, right: -8 },
  // The values and tick, tapped to correct the Set; the mark before them is its own button.
  values: { alignSelf: 'stretch' },
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
  note: { fontSize: 15, color: colors.muted, paddingLeft: 46, paddingTop: 2 },
}));
