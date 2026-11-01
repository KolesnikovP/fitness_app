import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/entities/auth';
import { deleteRoutine, getRoutine, slotBlocks, type Routine, type RoutineSlot } from '@/entities/routine';
import { formatRest, formatTarget, startSession } from '@/entities/workout';
import { errorMessage } from '@/shared/api';
import { Button, colors, Screen, spacing } from '@/shared/ui';

/** "Rest 3:00 · Pause on the chest", or "" with neither. */
function slotDetail(slot: RoutineSlot): string {
  const rest = slot.restSeconds === null ? null : `Rest ${formatRest(slot.restSeconds)}`;
  return [rest, slot.note || null].filter(Boolean).join(' · ');
}

function SlotSummary({ slot }: { slot: RoutineSlot }) {
  const detail = slotDetail(slot);
  return (
    <View style={styles.slot}>
      <Text style={styles.slotName}>{slot.name}</Text>
      <Text style={styles.slotTarget}>
        {formatTarget({
          sets: slot.targetSets,
          reps: slot.targetReps,
          weight: slot.targetWeight,
          weightUnit: slot.weightUnit,
        })}
      </Text>
      {detail ? <Text style={styles.muted}>{detail}</Text> : null}
    </View>
  );
}

/** One Routine: what it plans, starting a workout from it, editing and deleting it. */
export function RoutineScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useAuth();
  const token = state.status === 'signedIn' ? state.token : null;
  const [routine, setRoutine] = useState<Routine | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  // Reload on focus, so an edit saved on the next screen shows here.
  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      let current = true;
      getRoutine(token, id)
        .then((found) => {
          if (!current) return;
          setRoutine(found);
          setError(null);
        })
        .catch((e) => current && setError(errorMessage(e)));
      return () => {
        current = false;
      };
    }, [token, id]),
  );

  if (!token) return null;
  if (!routine) {
    return (
      <Screen>
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : (
          <ActivityIndicator />
        )}
      </Screen>
    );
  }

  async function start() {
    if (!token || !routine) return;
    setError(null);
    setStarting(true);
    try {
      await startSession(token, routine.id);
      // In place of this screen, so finishing goes back to the Workout tab.
      router.replace('/workout/session');
    } catch (e) {
      setError(errorMessage(e));
      setStarting(false);
    }
  }

  function confirmDelete() {
    Alert.alert('Delete routine?', 'Workouts already logged from it are kept.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!token || !routine) return;
          try {
            await deleteRoutine(token, routine.id);
            router.back();
          } catch (e) {
            setError(errorMessage(e));
          }
        },
      },
    ]);
  }

  return (
    <Screen title={routine.name}>
      <View accessibilityLabel="Planned exercises" style={styles.plan}>
        {slotBlocks(routine.slots).map((block) =>
          block.kind === 'slot' ? (
            <SlotSummary key={block.slot.id} slot={block.slot} />
          ) : (
            <View key={`superset-${block.group}`} style={styles.superset}>
              <Text style={styles.supersetLabel}>Superset</Text>
              {block.slots.map((slot) => (
                <SlotSummary key={slot.id} slot={slot} />
              ))}
            </View>
          ),
        )}
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <Button label="Start workout" onPress={start} loading={starting} />
      <Button
        label="Edit routine"
        variant="secondary"
        onPress={() => router.push({ pathname: '/workout/routines/[id]/edit', params: { id: routine.id } })}
      />
      <Button label="Delete routine" variant="secondary" onPress={confirmDelete} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  plan: { gap: spacing.md },
  slot: { gap: 2 },
  slotName: { fontSize: 17, fontWeight: '600', color: colors.text },
  slotTarget: { fontSize: 17, color: colors.text },
  superset: {
    gap: spacing.md,
    paddingLeft: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  supersetLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.primary,
  },
  error: { color: colors.danger, fontSize: 15 },
  muted: { fontSize: 15, color: colors.muted },
});
