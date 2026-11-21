import { useState } from 'react';
import { Pressable, Text } from 'react-native';

import type { Session, SessionExercise } from '@/entities/workout';
import { confirmExerciseRemoval } from '@/features/remove-exercise';
import { canSwap, SwapSheet } from '@/features/swap-exercise';
import { makeStyles, Sheet, spacing } from '@/shared/ui';

type ExerciseMenuProps = {
  sessionId: string;
  sessionExercise: SessionExercise;
  onSwapped: (session: Session) => void;
  onRemove: () => void;
  onReplace: () => void;
};

/**
 * A ⋯ button for a Session exercise, opening a sheet of what can be done
 * with it: Replace exercise opens the Swap sheet for one with Substitutes,
 * and the exercise picker (onReplace) for one without; Remove exercise
 * removes it, asking first if it has logged Sets.
 */
export function ExerciseMenu({ sessionId, sessionExercise, onSwapped, onRemove, onReplace }: ExerciseMenuProps) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const [swapSheetOpen, setSwapSheetOpen] = useState(false);
  const name = sessionExercise.name;

  function replace() {
    setOpen(false);
    if (canSwap(sessionExercise)) setSwapSheetOpen(true);
    else onReplace();
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${name} options`}
        hitSlop={10}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.dots, pressed && styles.pressed]}
      >
        <Text style={styles.dotsText}>⋯</Text>
      </Pressable>
      <Sheet open={open} onClose={() => setOpen(false)} accessibilityLabel={`${name} options sheet`} title={name}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Replace exercise"
          onPress={replace}
          style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
        >
          <Text style={styles.optionIcon}>⇄</Text>
          <Text style={styles.optionLabel}>Replace exercise</Text>
        </Pressable>
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
      <SwapSheet
        sessionId={sessionId}
        sessionExercise={sessionExercise}
        onSwapped={onSwapped}
        onReplace={onReplace}
        open={swapSheetOpen}
        onClose={() => setSwapSheetOpen(false)}
      />
    </>
  );
}

const useStyles = makeStyles((colors) => ({
  dots: { width: 36, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  pressed: { backgroundColor: colors.background },
  dotsText: { fontSize: 24, lineHeight: 26, fontWeight: '700', color: colors.muted },
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
