// PROTOTYPE: throwaway. Question: what should swapping an exercise for a
// Substitute look like mid-workout, so it's obvious *why* it's there (the
// bench or bar is taken: do something else for the same muscles)? Variants
// of the top of a Session exercise card, switchable via ?variant=A|B|C|D on
// /workout/session. A is what's built today; round 1's tabs were dropped.
//
// Swaps hit the real API on your own workout in progress; every variant can
// swap back, so nothing is lost.
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { ExerciseRef } from '@/entities/exercise';
import { useAuth } from '@/entities/auth';
import { equipmentLabel, getExercise } from '@/entities/exercise';
import { swappedFrom, swapSessionExercise, type Session, type SessionExercise } from '@/entities/workout';
import { errorMessage } from '@/shared/api';
import { colors, spacing } from '@/shared/ui';

import { SwapCarousel } from './SwapCarousel';

export const SWAP_VARIANTS = [
  { key: 'A', name: 'Chip row' },
  { key: 'B', name: 'Swipe pages' },
  { key: 'C', name: 'Swap sheet' },
  { key: 'D', name: 'One-tap fallback' },
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

/** Each option's equipment label ("Barbell"), by exercise id, loaded as it comes. */
function useEquipment(options: ExerciseRef[]): Record<string, string> {
  const { state } = useAuth();
  const [equipment, setEquipment] = useState<Record<string, string>>({});
  const ids = options.map((o) => o.exerciseId).join(',');
  useEffect(() => {
    if (state.status !== 'signedIn') return;
    for (const id of ids.split(',').filter(Boolean)) {
      getExercise(state.token, id)
        .then((e) => setEquipment((current) => ({ ...current, [id]: equipmentLabel(e.equipmentType) })))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);
  return equipment;
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
 * B: the name IS the carousel. Each option is a full-width page with its
 * equipment; the next one peeks in from the right, and a line says why to
 * swipe. Letting go on a page swaps to it.
 */
function VariantB(props: Props) {
  const e = props.sessionExercise;
  const options = allOptions(e);
  const equipment = useEquipment(options);
  const { swap, busy, error } = useSwap(props);
  const [width, setWidth] = useState(0);
  const scroller = useRef<ScrollView>(null);
  const currentIndex = Math.max(0, options.findIndex((o) => o.exerciseId === e.exerciseId));
  const planned = swappedFrom(e);
  // Pages narrower than the card, so the next one peeks in.
  const page = Math.max(0, width - 48);

  useEffect(() => {
    if (page > 0) scroller.current?.scrollTo({ x: currentIndex * page, animated: false });
  }, [page, currentIndex]);

  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={styles.gapXs}>
      {page > 0 ? (
        <ScrollView
          ref={scroller}
          horizontal
          snapToInterval={page}
          decelerationRate="fast"
          scrollEnabled={!busy}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(event) => {
            const index = Math.round(event.nativeEvent.contentOffset.x / page);
            if (options[index]) swap(options[index].exerciseId);
          }}
        >
          {options.map((option, i) => {
            const doing = i === currentIndex;
            return (
              <View key={option.exerciseId} style={[styles.bPage, { width: page - 8 }, doing && styles.bPageDoing]}>
                <Text style={styles.pageRole}>
                  {doing ? 'Doing now' : roleOf(e, option)}
                  {equipment[option.exerciseId] ? ` · ${equipment[option.exerciseId]}` : ''}
                </Text>
                <Text style={styles.name} numberOfLines={1}>
                  {option.name}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      ) : null}
      <View style={styles.dots}>
        {options.map((option, i) => (
          <View key={option.exerciseId} style={[styles.dot, i === currentIndex && styles.dotActive]} />
        ))}
        <Text style={styles.hint}>
          {busy
            ? '  Swapping…'
            : planned
              ? `  Swipe back to ${planned.name} when it's free`
              : '  Equipment taken? Swipe for a substitute →'}
        </Text>
      </View>
      <ErrorText error={error} />
    </View>
  );
}

/**
 * C: out of the way until needed, but saying what it's for. Under the name, a
 * tappable "Equipment taken?" line opens a sheet that explains the
 * substitutes (same muscles, routine unchanged), each with its equipment.
 */
function VariantC(props: Props) {
  const e = props.sessionExercise;
  const planned = swappedFrom(e);
  const options = allOptions(e);
  const { swap, busy, error } = useSwap(props);
  const [open, setOpen] = useState(false);
  const equipment = useEquipment(open ? options : []);
  return (
    <>
      <Text style={styles.name}>{e.name}</Text>
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={styles.cPrompt}>
        <Text style={styles.cPromptText}>
          {planned ? `Doing this instead of ${planned.name}. ` : `${e.name} taken? `}
          <Text style={styles.cPromptAction}>{planned ? 'Change ›' : 'Swap to a substitute ›'}</Text>
        </Text>
      </Pressable>
      <ErrorText error={error} />
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Can't do {(planned ?? e).name} right now?</Text>
          <Text style={styles.muted}>
            Bench or bar taken? Do one of these instead. They work the same muscles, so you stay on plan. Only
            this workout changes, not your routine.
          </Text>
          <View style={styles.sheetList}>
            {options.map((option) => {
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
                    <Text style={styles.muted}>
                      {roleOf(e, option)}
                      {equipment[option.exerciseId] ? ` · ${equipment[option.exerciseId]}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.sheetMark}>{doing ? '✓ Doing now' : 'Swap'}</Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable onPress={() => setOpen(false)} style={styles.sheetCancel}>
            <Text style={styles.cPromptAction}>Cancel</Text>
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

/**
 * D: built for the gym moment. Under the name, a banner offers the first
 * Substitute (the one the User ranked best) as a one-tap fallback: "Bench
 * taken? Do Dumbbell Bench Press instead". The rest are a tap further. Once
 * swapped, the banner turns into the way back.
 */
function VariantD(props: Props) {
  const e = props.sessionExercise;
  const planned = swappedFrom(e);
  const options = allOptions(e);
  const equipment = useEquipment(options);
  const { swap, busy, error } = useSwap(props);
  const [more, setMore] = useState(false);
  const first = e.substitutes.find((s) => s.exerciseId !== e.exerciseId);
  const others = options.filter((o) => o.exerciseId !== e.exerciseId && o.exerciseId !== (planned ? planned.exerciseId : first?.exerciseId));
  const gear = (id: string) => (equipment[id] ? ` (${equipment[id].toLowerCase()})` : '');
  return (
    <>
      <Text style={styles.name}>{e.name}</Text>
      {planned ? (
        <Pressable
          disabled={busy}
          onPress={() => swap(planned.exerciseId)}
          style={({ pressed }) => [styles.dBanner, styles.dBannerSwapped, pressed && styles.pressed]}
        >
          <Text style={styles.dIcon}>↩</Text>
          <Text style={styles.dText}>
            Doing this instead of {planned.name}.{' '}
            <Text style={styles.dAction}>Back to {planned.name}</Text>
          </Text>
        </Pressable>
      ) : first ? (
        <Pressable
          disabled={busy}
          onPress={() => swap(first.exerciseId)}
          style={({ pressed }) => [styles.dBanner, pressed && styles.pressed]}
        >
          <Text style={styles.dIcon}>⇄</Text>
          <Text style={styles.dText}>
            {equipment[e.exerciseId] ?? 'Equipment'} taken?{' '}
            <Text style={styles.dAction}>
              Do {first.name}
              {gear(first.exerciseId)} instead
            </Text>
          </Text>
        </Pressable>
      ) : null}
      {others.length > 0 ? (
        more ? (
          <View style={styles.dMore}>
            {others.map((option) => (
              <Pressable
                key={option.exerciseId}
                disabled={busy}
                onPress={() => {
                  setMore(false);
                  swap(option.exerciseId);
                }}
                style={({ pressed }) => [styles.dMoreRow, pressed && styles.pressed]}
              >
                <Text style={styles.dMoreText}>
                  {option.name}
                  <Text style={styles.muted}>{gear(option.exerciseId)}</Text>
                </Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Pressable onPress={() => setMore(true)}>
            <Text style={styles.hint}>
              {others.length} other substitute{others.length === 1 ? '' : 's'} ›
            </Text>
          </Pressable>
        )
      ) : null}
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
  gapXs: { gap: spacing.xs },
  // B
  bPage: {
    gap: 2,
    marginRight: 8,
    padding: spacing.sm,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bPageDoing: { borderColor: colors.primary, backgroundColor: '#F2F8FF' },
  pageRole: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: colors.primary },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.primary, width: 18 },
  hint: { fontSize: 14, color: colors.muted },
  // C
  cPrompt: { alignSelf: 'flex-start', paddingVertical: 4 },
  cPromptText: { fontSize: 15, color: colors.muted },
  cPromptAction: { fontSize: 15, fontWeight: '600', color: colors.primary },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: {
    gap: spacing.sm,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: colors.background,
  },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  sheetList: { marginTop: spacing.sm },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  sheetName: { fontSize: 17, color: colors.text },
  doing: { fontWeight: '700' },
  sheetMark: { fontSize: 15, fontWeight: '600', color: colors.primary },
  sheetCancel: { alignItems: 'center', paddingTop: spacing.md },
  // D
  dBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: 10,
    backgroundColor: '#FFF6E5',
  },
  dBannerSwapped: { backgroundColor: '#EAF3FF' },
  dIcon: { fontSize: 18, color: colors.text },
  dText: { flex: 1, fontSize: 15, color: colors.text },
  dAction: { fontWeight: '600', color: colors.primary },
  dMore: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  dMoreRow: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm },
  dMoreText: { fontSize: 16, color: colors.text },
});
