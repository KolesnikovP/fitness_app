import { useState } from 'react';
import { Pressable, Text } from 'react-native';

import type { SessionExercise } from '@/entities/workout';
import { confirmExerciseRemoval } from '@/features/remove-exercise';
import { canSwap } from '@/features/swap-exercise';
import { Chip, makeStyles, Sheet, spacing } from '@/shared/ui';

type ExerciseMenuProps = {
  sessionExercise: SessionExercise;
  onRemove: () => void;
  onReplace: () => void;
};

/**
 * The ⋯ chip of a Session exercise, opening a sheet with Remove exercise,
 * which removes it, asking first if it has logged Sets. One without
 * Substitutes, and so no Swap chip, has Replace exercise there too, which
 * opens the exercise picker (onReplace); one with them reaches the picker
 * from the Swap sheet.
 */
export function ExerciseMenu({ sessionExercise, onRemove, onReplace }: ExerciseMenuProps) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const name = sessionExercise.name;

  function replace() {
    setOpen(false);
    onReplace();
  }

  // The sheet stays up under the question, since an alert can't open as a
  // sheet closes on iOS.
  async function remove() {
    const confirmed = await confirmExerciseRemoval(sessionExercise);
    setOpen(false);
    if (confirmed) onRemove();
  }

  return (
    <>
      <Chip label="⋯" accessibilityLabel="More" onPress={() => setOpen(true)} />
      <Sheet open={open} onClose={() => setOpen(false)} accessibilityLabel={`${name} options sheet`} title={name}>
        {canSwap(sessionExercise) ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Replace exercise"
            onPress={replace}
            style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
          >
            <Text style={styles.optionIcon}>⇄</Text>
            <Text style={styles.optionLabel}>Replace exercise</Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Remove exercise"
          onPress={remove}
          style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
        >
          <Text style={[styles.optionIcon, styles.danger]}>✕</Text>
          <Text style={[styles.optionLabel, styles.danger]}>Remove exercise</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          onPress={() => setOpen(false)}
          style={styles.cancel}
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </Sheet>
    </>
  );
}

const useStyles = makeStyles((colors) => ({
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.md,
    borderRadius: 10,
  },
  optionPressed: { backgroundColor: colors.card },
  optionIcon: { width: 24, fontSize: 20, textAlign: 'center', color: colors.text },
  optionLabel: { fontSize: 17, fontWeight: '600', color: colors.text },
  danger: { color: colors.danger },
  cancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xs },
  cancelText: { fontSize: 17, fontWeight: '600', color: colors.muted },
}));
