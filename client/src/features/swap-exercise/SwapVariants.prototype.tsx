// PROTOTYPE: throwaway. Question: what should swapping an exercise for a
// Substitute look like mid-workout? Four variants of the top of a Session
// exercise card (its name, what it replaced, and how to swap), switchable via
// ?variant=A|B|C|D on /workout/session. A is what's built today.
//
// Swaps hit the real API on your own workout in progress; every variant can
// swap back, so nothing is lost.
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { ExerciseRef } from '@/entities/exercise';
import { useAuth } from '@/entities/auth';
import { swappedFrom, swapSessionExercise, type Session, type SessionExercise } from '@/entities/workout';
import { errorMessage } from '@/shared/api';
import { colors, spacing } from '@/shared/ui';

import { SwapCarousel } from './SwapCarousel';

export const SWAP_VARIANTS = [
  { key: 'A', name: 'Chip row' },
  { key: 'B', name: 'Swipe pages' },
  { key: 'C', name: 'Swap sheet' },
  { key: 'D', name: 'Segmented tabs' },
] as const;

type Props = { sessionId: string; sessionExercise: SessionExercise; onSwapped: (session: Session) => void };

/** The planned Exercise, then its Substitutes: every Exercise this one can be done as. */
function allOptions(e: SessionExercise): ExerciseRef[] {
  return e.planned ? [e.planned, ...e.substitutes] : [];
}

function roleOf(e: SessionExercise, option: ExerciseRef): string {
  if (option.exerciseId === e.planned?.exerciseId) return 'Planned';
  return `Substitute ${e.substitutes.findIndex((s) => s.exerciseId === option.exerciseId) + 1}`;
}

function useSwap({ sessionId, sessionExercise, onSwapped }: Props) {
  const { state } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function swap(exerciseId: string) {
    if (state.status !== 'signedIn' || exerciseId === sessionExercise.exerciseId) return;
    setBusy(true);
    setError(null);
    try {
      onSwapped(await swapSessionExercise(state.token, sessionId, sessionExercise.id, exerciseId));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return { swap, busy, error };
}

function ErrorText({ error }: { error: string | null }) {
  return error ? <Text style={styles.error}>{error}</Text> : null;
}

/** A: today's design. Name, "Instead of", and a row of "Swap to" chips. */
function VariantA(props: Props) {
  const planned = swappedFrom(props.sessionExercise);
  return (
    <>
      <Text style={styles.name}>{props.sessionExercise.name}</Text>
      {planned ? <Text style={styles.muted}>Instead of {planned.name}</Text> : null}
      <SwapCarousel sessionId={props.sessionId} sessionExercise={props.sessionExercise} onSwapped={props.onSwapped} />
    </>
  );
}

/**
 * B: the name IS the carousel. Each option is a full-width page; swipe
 * sideways and letting go on a page swaps to it. Dots show where you are.
 */
function VariantB(props: Props) {
  const e = props.sessionExercise;
  const options = allOptions(e);
  const { swap, busy, error } = useSwap(props);
  const [width, setWidth] = useState(0);
  const scroller = useRef<ScrollView>(null);
  const currentIndex = Math.max(0, options.findIndex((o) => o.exerciseId === e.exerciseId));

  // Snap back to the exercise being done if the swap failed or it changed elsewhere.
  useEffect(() => {
    if (width > 0) scroller.current?.scrollTo({ x: currentIndex * width, animated: false });
  }, [width, currentIndex]);

  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {width > 0 ? (
        <ScrollView
          ref={scroller}
          horizontal
          pagingEnabled
          scrollEnabled={!busy}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(event) => {
            const page = Math.round(event.nativeEvent.contentOffset.x / width);
            if (options[page]) swap(options[page].exerciseId);
          }}
        >
          {options.map((option) => (
            <View key={option.exerciseId} style={[styles.page, { width }]}>
              <Text style={styles.pageRole}>{roleOf(e, option)}</Text>
              <Text style={styles.name}>{option.name}</Text>
            </View>
          ))}
        </ScrollView>
      ) : null}
      <View style={styles.dots}>
        {options.map((option, i) => (
          <View key={option.exerciseId} style={[styles.dot, i === currentIndex && styles.dotActive]} />
        ))}
        <Text style={styles.hint}>{busy ? 'Swapping…' : '  swipe to swap'}</Text>
      </View>
      <ErrorText error={error} />
    </View>
  );
}

/**
 * C: out of the way until needed. A small "Swap" button beside the name opens
 * a bottom sheet listing every option with its role; tap one to swap.
 */
function VariantC(props: Props) {
  const e = props.sessionExercise;
  const planned = swappedFrom(e);
  const { swap, busy, error } = useSwap(props);
  const [open, setOpen] = useState(false);
  return (
    <>
      <View style={styles.titleRow}>
        <View style={styles.flex}>
          <Text style={styles.name}>{e.name}</Text>
          {planned ? <Text style={styles.muted}>Instead of {planned.name}</Text> : null}
        </View>
        <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={styles.swapButton}>
          <Text style={styles.swapButtonText}>⇄ Swap</Text>
        </Pressable>
      </View>
      <ErrorText error={error} />
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Do instead</Text>
          {allOptions(e).map((option) => {
            const doing = option.exerciseId === e.exerciseId;
            return (
              <Pressable
                key={option.exerciseId}
                disabled={doing || busy}
                onPress={async () => {
                  await swap(option.exerciseId);
                  setOpen(false);
                }}
                style={({ pressed }) => [styles.sheetRow, pressed && styles.pressed]}
              >
                <View style={styles.flex}>
                  <Text style={[styles.sheetName, doing && styles.doing]}>{option.name}</Text>
                  <Text style={styles.muted}>{roleOf(e, option)}</Text>
                </View>
                <Text style={styles.sheetMark}>{doing ? '✓ Doing now' : '›'}</Text>
              </Pressable>
            );
          })}
          <Pressable onPress={() => setOpen(false)} style={styles.sheetCancel}>
            <Text style={styles.swapButtonText}>Cancel</Text>
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

/**
 * D: a selector, not a list of actions. Every option is a tab above the name,
 * the one being done is selected; tap another tab to swap.
 */
function VariantD(props: Props) {
  const e = props.sessionExercise;
  const planned = swappedFrom(e);
  const { swap, busy, error } = useSwap(props);
  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {allOptions(e).map((option) => {
          const selected = option.exerciseId === e.exerciseId;
          return (
            <Pressable
              key={option.exerciseId}
              disabled={busy}
              onPress={() => swap(option.exerciseId)}
              style={[styles.tab, selected && styles.tabSelected]}
            >
              <Text style={[styles.tabText, selected && styles.tabTextSelected]} numberOfLines={1}>
                {option.exerciseId === e.planned?.exerciseId ? '★ ' : ''}
                {option.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Text style={styles.name}>{e.name}</Text>
      {planned ? <Text style={styles.muted}>Instead of {planned.name} ★</Text> : null}
      <ErrorText error={error} />
    </>
  );
}

/** The top of a Session exercise card, as the chosen variant draws it. */
export function SwapVariant({ variant, ...props }: Props & { variant: string }) {
  if (allOptions(props.sessionExercise).length < 2) return <VariantA {...props} />;
  switch (variant) {
    case 'B':
      return <VariantB {...props} />;
    case 'C':
      return <VariantC {...props} />;
    case 'D':
      return <VariantD {...props} />;
    default:
      return <VariantA {...props} />;
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  name: { fontSize: 20, fontWeight: '600', color: colors.text },
  muted: { fontSize: 15, color: colors.muted },
  error: { color: colors.danger, fontSize: 15 },
  pressed: { opacity: 0.5 },
  // B
  page: { gap: 2, paddingVertical: spacing.xs },
  pageRole: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: colors.primary },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.xs },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.primary, width: 18 },
  hint: { fontSize: 13, color: colors.muted },
  // C
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  swapButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#EAF3FF',
  },
  swapButtonText: { fontSize: 15, fontWeight: '600', color: colors.primary },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: {
    gap: spacing.xs,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: colors.background,
  },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  sheetName: { fontSize: 17, color: colors.text },
  doing: { fontWeight: '700' },
  sheetMark: { fontSize: 15, color: colors.primary },
  sheetCancel: { alignItems: 'center', paddingTop: spacing.md },
  // D
  tabs: { flexDirection: 'row', padding: 3, gap: 3, borderRadius: 10, backgroundColor: '#F0F0F2' },
  tab: { paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: 8, maxWidth: 200 },
  tabSelected: {
    backgroundColor: colors.background,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  tabText: { fontSize: 14, color: colors.muted },
  tabTextSelected: { color: colors.text, fontWeight: '600' },
});
