import { Text, View } from 'react-native';

import { useUnitPreference } from '@/entities/auth';
import { formatSetProgress, swappedFrom, type RowsToDo, type Session, type SessionExercise } from '@/entities/workout';
import { makeStyles, spacing } from '@/shared/ui';

import { ExerciseChips } from './ExerciseChips';
import { SetTable } from './SetTable';
import type { RowsChange } from './useRowsToDo';

type SessionExerciseCardProps = {
  sessionId: string;
  sessionExercise: SessionExercise;
  /** The Session's other exercises not in a Superset, which it can be grouped with. */
  freeToGroup: SessionExercise[];
  onChange: (session: Session) => void;
  /** Called as the Superset picker opens, before anything is grouped. */
  onGroupStart: () => void;
  onDeleteSet: (setId: string) => void;
  onRemove: (sessionExerciseId: string) => void;
  /** Opens the exercise picker to Replace it with any Exercise. */
  onReplace: (sessionExercise: SessionExercise) => void;
  /** What the User did to its rows still to do, kept by the screen (see useRowsToDo). */
  rows: RowsToDo;
  onRowsChange: (change: RowsChange) => void;
};

/**
 * One exercise in the workout in progress. Its heading: its name, what it
 * was Swapped from, how far through its Sets it is with its Target (see
 * formatSetProgress), and its Exercise slot's note. Then a row of chips
 * for what can be done with it (see ExerciseChips); and its Sets as a
 * table, logged and still to do.
 */
export function SessionExerciseCard({
  sessionId,
  sessionExercise,
  freeToGroup,
  onChange,
  onGroupStart,
  onDeleteSet,
  onRemove,
  onReplace,
  rows,
  onRowsChange,
}: SessionExerciseCardProps) {
  const styles = useStyles();
  const unit = useUnitPreference();
  const slotNote = sessionExercise.target?.note;
  const swappedAway = swappedFrom(sessionExercise);

  return (
    <View accessibilityLabel={`${sessionExercise.name} card`} style={styles.card}>
      <View style={styles.header}>
        <View style={styles.heading}>
          <Text style={styles.name}>{sessionExercise.name}</Text>
          {swappedAway ? <Text style={styles.muted}>Instead of {swappedAway.name}</Text> : null}
          <Text style={styles.progress}>{formatSetProgress(sessionExercise, unit, rows)}</Text>
          {slotNote ? <Text style={styles.muted}>{slotNote}</Text> : null}
        </View>
        {/* Where the exercise's picture will go. */}
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.picture} />
      </View>
      <ExerciseChips
        sessionId={sessionId}
        sessionExercise={sessionExercise}
        freeToGroup={freeToGroup}
        onChange={onChange}
        onGroupStart={onGroupStart}
        onRemove={() => onRemove(sessionExercise.id)}
        onReplace={() => onReplace(sessionExercise)}
      />
      <SetTable
        // Starts over on a swap, from the Target for the Exercise swapped to.
        key={sessionExercise.exerciseId}
        sessionId={sessionId}
        sessionExercise={sessionExercise}
        onChange={onChange}
        onDeleteSet={onDeleteSet}
        rows={rows}
        onRowsChange={onRowsChange}
      />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.card,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  heading: { flex: 1, gap: spacing.xs },
  name: { fontSize: 20, fontWeight: '600', color: colors.text },
  muted: { fontSize: 15, color: colors.muted },
  picture: { width: 64, height: 64, borderRadius: 10, backgroundColor: colors.background },
  progress: { fontSize: 15, fontWeight: '600', color: colors.primary },
}));
