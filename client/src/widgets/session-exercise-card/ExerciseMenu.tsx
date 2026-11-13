import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import type { Session, SessionExercise } from '@/entities/workout';
import { canSwap, SwapSheet } from '@/features/swap-exercise';
import { makeStyles, spacing } from '@/shared/ui';

type ExerciseMenuProps = {
  sessionId: string;
  sessionExercise: SessionExercise;
  onSwapped: (session: Session) => void;
};

/**
 * A ⋯ button for a Session exercise, opening a sheet of what can be done
 * with it: Replace exercise, for one with Substitutes, opens the Swap sheet.
 */
export function ExerciseMenu({ sessionId, sessionExercise, onSwapped }: ExerciseMenuProps) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const [swapSheetOpen, setSwapSheetOpen] = useState(false);
  const name = sessionExercise.name;

  function openSwapSheet() {
    setOpen(false);
    setSwapSheetOpen(true);
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
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable accessibilityLabel="Close" style={styles.backdrop} onPress={() => setOpen(false)} />
        <View accessibilityLabel={`${name} options sheet`} style={styles.sheet}>
          <Text accessibilityRole="header" style={styles.title}>
            {name}
          </Text>
          {canSwap(sessionExercise) ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Replace exercise"
              onPress={openSwapSheet}
              style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
            >
              <Text style={styles.optionIcon}>⇄</Text>
              <Text style={styles.optionLabel}>Replace exercise</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            onPress={() => setOpen(false)}
            style={styles.cancel}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </Modal>
      <SwapSheet
        sessionId={sessionId}
        sessionExercise={sessionExercise}
        onSwapped={onSwapped}
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
  backdrop: { flex: 1, backgroundColor: colors.backdrop },
  sheet: {
    gap: spacing.xs,
    padding: spacing.md,
    paddingBottom: spacing.xl,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: colors.background,
  },
  title: { fontSize: 20, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
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
  cancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xs },
  cancelText: { fontSize: 17, fontWeight: '600', color: colors.muted },
}));
