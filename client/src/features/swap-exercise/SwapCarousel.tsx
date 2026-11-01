import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/entities/auth';
import { swapOptions, swapSessionExercise, type Session, type SessionExercise } from '@/entities/workout';
import { errorMessage } from '@/shared/api';
import { colors, spacing } from '@/shared/ui';

type SwapCarouselProps = {
  sessionId: string;
  sessionExercise: SessionExercise;
  onSwapped: (session: Session) => void;
};

/**
 * The Exercises a Session exercise can be swapped to, side by side: its
 * Substitutes, in the order its Routine planned them, and its planned
 * Exercise once swapped away from it. One tap swaps, for this workout only.
 */
export function SwapCarousel({ sessionId, sessionExercise, onSwapped }: SwapCarouselProps) {
  const { state } = useAuth();
  const [swapping, setSwapping] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const options = swapOptions(sessionExercise);
  if (state.status !== 'signedIn' || options.length === 0) return null;
  const { token } = state;

  async function swap(exerciseId: string) {
    setError(null);
    setSwapping(exerciseId);
    try {
      onSwapped(await swapSessionExercise(token, sessionId, sessionExercise.id, exerciseId));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSwapping(null);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Swap to</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.options}>
        {options.map((option) => (
          <Pressable
            key={option.exerciseId}
            accessibilityRole="button"
            accessibilityLabel={`Swap to ${option.name}`}
            accessibilityState={{ disabled: swapping !== null, busy: swapping === option.exerciseId }}
            disabled={swapping !== null}
            onPress={() => swap(option.exerciseId)}
            style={({ pressed }) => [styles.option, (pressed || swapping !== null) && styles.dimmed]}
          >
            <Text style={styles.optionText}>{option.name}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted },
  options: { gap: spacing.sm },
  option: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  dimmed: { opacity: 0.5 },
  optionText: { fontSize: 15, fontWeight: '500', color: colors.primary },
  error: { color: colors.danger, fontSize: 15 },
});
