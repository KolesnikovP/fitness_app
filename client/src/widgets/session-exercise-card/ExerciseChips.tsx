import { useState } from 'react';
import { ScrollView, Text } from 'react-native';

import type { Session, SessionExercise } from '@/entities/workout';
import { ExerciseNoteSheet } from '@/features/exercise-note';
import { SupersetSheet, useUngroupSuperset } from '@/features/superset';
import { canSwap, SwapSheet } from '@/features/swap-exercise';
import { Chip, makeStyles, spacing } from '@/shared/ui';

import { ExerciseMenu } from './ExerciseMenu';

type ExerciseChipsProps = {
  sessionId: string;
  sessionExercise: SessionExercise;
  /** The Session's other exercises not in a Superset, which it can be grouped with. */
  freeToGroup: SessionExercise[];
  onChange: (session: Session) => void;
  /**
   * Sends what's waiting out an Undo window before a Superset changes, as the
   * server still has a removed exercise in its Superset until then; false if
   * that failed.
   */
  onBeforeSupersetChange: () => Promise<boolean>;
  onRemove: () => void;
  /** Opens the exercise picker to Replace it with any Exercise. */
  onReplace: () => void;
};

/**
 * A Session exercise's actions, as a sideways row of chips: Swap, for one
 * with Substitutes; Note; Superset, to group it with others not in one
 * (when there are any), or Ungroup, to split the Superset it's in; and ⋯,
 * which holds Remove exercise.
 */
export function ExerciseChips({
  sessionId,
  sessionExercise,
  freeToGroup,
  onChange,
  onBeforeSupersetChange,
  onRemove,
  onReplace,
}: ExerciseChipsProps) {
  const styles = useStyles();
  const [open, setOpen] = useState<'swap' | 'note' | 'superset' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { ungroup, ungrouping } = useUngroupSuperset(sessionId, onChange, setError);
  const close = () => setOpen(null);
  const { supersetId } = sessionExercise;

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityLabel={`${sessionExercise.name} actions`}
        contentContainerStyle={styles.row}
      >
        {canSwap(sessionExercise) ? <Chip label="Swap" onPress={() => setOpen('swap')} /> : null}
        <Chip label="Note" onPress={() => setOpen('note')} />
        {supersetId !== null ? (
          <Chip
            label="Ungroup"
            disabled={ungrouping}
            onPress={async () => {
              setError(null);
              if (await onBeforeSupersetChange()) await ungroup(supersetId);
            }}
          />
        ) : freeToGroup.length > 0 ? (
          <Chip
            label="Superset"
            onPress={() => {
              // Sent while the User picks; grouping fails as it would anyway if it can't be.
              void onBeforeSupersetChange();
              setOpen('superset');
            }}
          />
        ) : null}
        <ExerciseMenu sessionExercise={sessionExercise} onRemove={onRemove} onReplace={onReplace} />
      </ScrollView>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <SwapSheet
        sessionId={sessionId}
        sessionExercise={sessionExercise}
        onSwapped={onChange}
        onReplace={onReplace}
        open={open === 'swap'}
        onClose={close}
      />
      <ExerciseNoteSheet
        sessionId={sessionId}
        sessionExercise={sessionExercise}
        onSaved={onChange}
        open={open === 'note'}
        onClose={close}
      />
      <SupersetSheet
        sessionId={sessionId}
        sessionExercise={sessionExercise}
        others={freeToGroup}
        onGrouped={onChange}
        open={open === 'superset'}
        onClose={close}
      />
    </>
  );
}

const useStyles = makeStyles((colors) => ({
  row: { flexDirection: 'row', gap: spacing.sm },
  error: { color: colors.danger, fontSize: 15 },
}));
