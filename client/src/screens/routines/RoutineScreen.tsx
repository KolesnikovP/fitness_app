import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { useAuth } from '@/entities/auth';
import {
  deleteRoutine,
  getRoutine,
  needsStartingWeight,
  slotBlocks,
  updateRoutine,
  withStartingWeights,
  type Routine,
  type RoutineSlot,
} from '@/entities/routine';
import { formatRest, formatTarget, parseWeight, startSession, weightInput } from '@/entities/workout';
import { errorMessage } from '@/shared/api';
import { Button, makeStyles, Screen, spacing, Spinner, TextField } from '@/shared/ui';

/** "Rest 3:00 · Pause on the chest", or "" with neither. */
function slotDetail(slot: RoutineSlot): string {
  const rest = slot.restSeconds === null ? null : `Rest ${formatRest(slot.restSeconds)}`;
  return [rest, slot.note || null].filter(Boolean).join(' · ');
}

function SlotSummary({ slot }: { slot: RoutineSlot }) {
  const styles = useStyles();
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
      {slot.substitutes.length > 0 ? (
        <Text style={styles.muted}>Substitutes: {slot.substitutes.map((sub) => sub.name).join(', ')}</Text>
      ) : null}
    </View>
  );
}

/**
 * The weights typed for slots with none yet, by slot id, leaving out blank
 * ones (and 0, which is still none); null while one isn't a number.
 */
function parseStartingWeights(typed: Record<string, string>): Record<string, number> | null {
  const weights: Record<string, number> = {};
  for (const [slotId, text] of Object.entries(typed)) {
    if (text.trim() === '') continue;
    const weight = parseWeight(text);
    if (weight === null) return null;
    if (weight > 0) weights[slotId] = weight;
  }
  return weights;
}

/**
 * One Routine: what it plans, starting a workout from it (asking first for a
 * starting weight for any exercise planned without one), editing and
 * deleting it.
 */
export function RoutineScreen() {
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useAuth();
  const token = state.status === 'signedIn' ? state.token : null;
  const [routine, setRoutine] = useState<Routine | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [typedWeights, setTypedWeights] = useState<Record<string, string>>({});

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
          <Spinner />
        )}
      </Screen>
    );
  }

  const unweighted = routine.slots.filter(needsStartingWeight);
  const startingWeights = parseStartingWeights(typedWeights);

  async function start() {
    if (!token || !routine || !startingWeights) return;
    setError(null);
    setStarting(true);
    try {
      // Saved to the Routine, so they aren't asked for again.
      if (Object.keys(startingWeights).length > 0) {
        setRoutine(await updateRoutine(token, routine.id, withStartingWeights(routine, startingWeights)));
        setTypedWeights({});
      }
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
    <Screen headerTitle={routine.name}>
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
      {unweighted.length > 0 ? (
        <View accessibilityLabel="Starting weights" style={styles.startingWeights}>
          <Text style={styles.heading}>Starting weights</Text>
          <Text style={styles.muted}>
            What will you start with? It's saved to the routine. Not sure yet? Leave it blank and fill it in as you log.
          </Text>
          {unweighted.map((slot) => (
            <TextField
              key={slot.id}
              label={`${slot.name} weight (${slot.weightUnit})`}
              placeholder="Optional"
              value={typedWeights[slot.id] ?? ''}
              onChangeText={(text) => setTypedWeights((typed) => ({ ...typed, [slot.id]: weightInput(text) }))}
              keyboardType="decimal-pad"
            />
          ))}
        </View>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <Button label="Start workout" onPress={start} loading={starting} disabled={!startingWeights} />
      <Button
        label="Edit routine"
        variant="secondary"
        onPress={() => router.push({ pathname: '/workout/routines/[id]/edit', params: { id: routine.id } })}
      />
      <Button label="Delete routine" variant="secondary" tone="danger" onPress={confirmDelete} />
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
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
  startingWeights: { gap: spacing.sm },
  heading: { fontSize: 20, fontWeight: '600', color: colors.text },
  error: { color: colors.danger, fontSize: 15 },
  muted: { fontSize: 15, color: colors.muted },
}));
