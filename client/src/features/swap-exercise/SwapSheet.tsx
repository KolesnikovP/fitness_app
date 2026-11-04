import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/entities/auth';
import { equipmentLabel, getExercise, type ExerciseRef } from '@/entities/exercise';
import { swapChoices, swappedFrom, swapSessionExercise, type Session, type SessionExercise } from '@/entities/workout';
import { errorMessage } from '@/shared/api';
import { makeStyles, spacing } from '@/shared/ui';

type SwapSheetProps = {
  sessionId: string;
  sessionExercise: SessionExercise;
  onSwapped: (session: Session) => void;
};

/**
 * A Swap button for a Session exercise with Substitutes, after a line saying
 * what it's for ("Equipment taken?"), or what it was swapped from. It opens a
 * sheet for when the equipment is taken: every Exercise it can be done as, with its
 * equipment, and the one being done marked. Tapping one swaps to it for this
 * workout only.
 */
export function SwapSheet({ sessionId, sessionExercise, onSwapped }: SwapSheetProps) {
  const styles = useStyles();
  const { state } = useAuth();
  const [open, setOpen] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const choices = swapChoices(sessionExercise);
  const equipment = useEquipment(open ? choices : []);

  if (state.status !== 'signedIn' || !sessionExercise.planned || choices.length < 2) return null;
  const { token } = state;
  const planned = sessionExercise.planned;
  const swappedAway = swappedFrom(sessionExercise);

  async function swap(exerciseId: string) {
    setError(null);
    setSwapping(true);
    try {
      onSwapped(await swapSessionExercise(token, sessionId, sessionExercise.id, exerciseId));
      setOpen(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSwapping(false);
    }
  }

  function close() {
    setOpen(false);
    setError(null);
  }

  function detail(choice: ExerciseRef, doing: boolean): string {
    const role = doing
      ? 'Doing now'
      : choice.exerciseId === planned.exerciseId
        ? 'Planned'
        : `Substitute ${sessionExercise.substitutes.findIndex((s) => s.exerciseId === choice.exerciseId) + 1}`;
    const gear = equipment[choice.exerciseId];
    return gear ? `${role} · ${gear}` : role;
  }

  return (
    <>
      <View style={styles.prompt}>
        <Text style={styles.promptText}>{swappedAway ? `Instead of ${swappedAway.name}` : 'Equipment taken?'}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Swap ${sessionExercise.name}`}
          onPress={() => setOpen(true)}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <Text style={styles.buttonText}>⇄ Swap</Text>
        </Pressable>
      </View>
      <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
        <Pressable accessibilityLabel="Close" style={styles.backdrop} onPress={close} />
        <View accessibilityLabel={`Substitutes for ${planned.name}`} style={styles.sheet}>
          <Text accessibilityRole="header" style={styles.title}>
            Can't do {planned.name} right now?
          </Text>
          <Text style={styles.muted}>
            Bench or bar taken? Do one of these instead. They work the same muscles, so you stay on plan. Only this
            workout changes, not your routine.
          </Text>
          <View style={styles.list}>
            {choices.map((choice) => {
              const doing = choice.exerciseId === sessionExercise.exerciseId;
              return (
                <Pressable
                  key={choice.exerciseId}
                  accessibilityRole="button"
                  accessibilityLabel={doing ? `${choice.name}, doing now` : `Swap to ${choice.name}`}
                  accessibilityState={{ disabled: doing || swapping }}
                  disabled={doing || swapping}
                  onPress={() => swap(choice.exerciseId)}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                >
                  <View style={styles.rowText}>
                    <Text style={[styles.name, doing && styles.doing]}>{choice.name}</Text>
                    <Text style={styles.muted}>{detail(choice, doing)}</Text>
                  </View>
                  <Text style={styles.action}>{doing ? '✓' : 'Swap'}</Text>
                </Pressable>
              );
            })}
          </View>
          {error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={close} style={styles.cancel}>
            <Text style={styles.action}>Cancel</Text>
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

/**
 * The equipment label ("Barbell") of each choice, by exercise id, loaded once
 * the sheet opens; a choice is shown without one until it arrives.
 */
function useEquipment(choices: ExerciseRef[]): Record<string, string> {
  const { state } = useAuth();
  const token = state.status === 'signedIn' ? state.token : null;
  const [equipment, setEquipment] = useState<Record<string, string>>({});
  const ids = choices.map((c) => c.exerciseId).join(',');

  useEffect(() => {
    if (!token || ids === '') return;
    let current = true;
    for (const id of ids.split(',')) {
      getExercise(token, id)
        .then((e) => current && setEquipment((known) => ({ ...known, [id]: equipmentLabel(e.equipmentType) })))
        // Only a detail: the choice still shows, without its equipment.
        .catch(() => {});
    }
    return () => {
      current = false;
    };
  }, [token, ids]);
  return equipment;
}

const useStyles = makeStyles((colors) => ({
  prompt: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  promptText: { fontSize: 15, color: colors.muted },
  button: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.primarySubtle,
  },
  buttonText: { fontSize: 15, fontWeight: '600', color: colors.primary },
  pressed: { opacity: 0.5 },
  backdrop: { flex: 1, backgroundColor: colors.backdrop },
  sheet: {
    gap: spacing.sm,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: colors.background,
  },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  muted: { fontSize: 15, color: colors.muted },
  list: { marginTop: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowText: { flex: 1, gap: 2 },
  name: { fontSize: 17, color: colors.text },
  doing: { fontWeight: '700' },
  action: { fontSize: 15, fontWeight: '600', color: colors.primary },
  error: { color: colors.danger, fontSize: 15 },
  cancel: { alignItems: 'center', paddingTop: spacing.md },
}));
