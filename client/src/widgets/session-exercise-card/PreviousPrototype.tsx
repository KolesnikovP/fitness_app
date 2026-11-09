// PROTOTYPE: throwaway. Lives on prototype/* branches only, never on main.
//
// Question: how should the set table show what you did last time with an
// Exercise, start rows with values already in, and let you repeat the set
// above without typing it twice? Three variants on /workout/session,
// switchable via ?variant=A|B|C. "Last time" is faked in memory (no API).
import { Pressable, Text, View } from 'react-native';

import { currentTarget, type SessionExercise, type SetDraft } from '@/entities/workout';
import type { UnitPreference } from '@/shared/model';
import { makeStyles, spacing } from '@/shared/ui';

export const PREVIOUS_VARIANTS = [
  // The table as it is today, so tests and a bare route see no change.
  { key: '0', name: 'Today' },
  { key: 'A', name: 'Previous column' },
  { key: 'B', name: 'Ghost values' },
  { key: 'C', name: 'Last-time card' },
] as const;

export const PREVIOUS_DATE = 'Thu, Nov 5';

/**
 * FAKE: the Exercise's Sets in the last finished workout, by position. Built
 * from the Target, or 60 kg / 135 lb × 8 when there's none, tiring a little
 * by the last Set.
 */
export function fakePrevious(exercise: SessionExercise, unit: UnitPreference): SetDraft[] {
  const target = currentTarget(exercise);
  const weight = target && target.weight !== 0 ? target.weight : unit === 'kg' ? 60 : 135;
  const reps = target?.reps ?? 8;
  const set = (w: number, r: number, rpe: number | null): SetDraft => ({
    weight: String(w),
    reps: String(r),
    rpe,
    note: '',
    type: 'normal',
  });
  return [set(weight, reps, 7), set(weight, reps, 8), set(weight, Math.max(reps - 1, 1), null)];
}

/** "60 × 8" */
export function shortSet(draft: SetDraft | undefined): string {
  return draft ? `${draft.weight} × ${draft.reps}` : '–';
}

/** A: the PREV column's width, and its heading. */
export const prevColumn = { width: 62 };

export function PrevHeading() {
  const styles = useStyles();
  return <Text style={[prevColumn, styles.heading]}>PREV</Text>;
}

/** A: a cell of the PREV column; tap it to put last time's Set into the row. */
export function PrevCell({ draft, onUse }: { draft: SetDraft | undefined; onUse?: () => void }) {
  const styles = useStyles();
  // Last time's RPE, when one was entered, under its weight × reps.
  const text = (
    <>
      <Text style={styles.prevText}>{shortSet(draft)}</Text>
      {draft?.rpe != null ? <Text style={styles.prevRpe}>@ {draft.rpe}</Text> : null}
    </>
  );
  if (!onUse || !draft) return <View style={[prevColumn, styles.prevCell]}>{text}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Use last time's ${shortSet(draft)}${draft.rpe != null ? ` @ RPE ${draft.rpe}` : ''}`}
      onPress={onUse}
      style={({ pressed }) => [prevColumn, styles.prevCell, pressed && styles.pressed]}
    >
      {text}
    </Pressable>
  );
}

/** C: last time's Sets above the table, and a button that fills every row still to do with them. */
export function LastTimeCard({ previous, onFill }: { previous: SetDraft[]; onFill: () => void }) {
  const styles = useStyles();
  return (
    <View style={styles.card}>
      <View style={styles.cardText}>
        <Text style={styles.cardTitle}>Last time · {PREVIOUS_DATE}</Text>
        <Text style={styles.cardSets}>{previous.map(shortSet).join('   ·   ')}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onFill}
        style={({ pressed }) => [styles.fill, pressed && styles.pressed]}
      >
        <Text style={styles.fillText}>Fill</Text>
      </Pressable>
    </View>
  );
}

/** C: under a row still to do, a chip that copies the Set above into it. */
export function SameAsAbove({ label, onCopy }: { label: string; onCopy: () => void }) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onCopy}
      style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
    >
      <Text style={styles.chipText}>⎘ {label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  heading: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, color: colors.muted, textAlign: 'center' },
  prevCell: { minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  prevText: { fontSize: 14, color: colors.muted },
  prevRpe: { fontSize: 12, color: colors.muted },
  pressed: { opacity: 0.5 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: 10,
    backgroundColor: colors.primarySubtle,
  },
  cardText: { flex: 1, gap: 2 },
  cardTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  cardSets: { fontSize: 15, color: colors.muted },
  fill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 8,
    backgroundColor: colors.primary,
  },
  fillText: { fontSize: 15, fontWeight: '700', color: colors.primaryText },
  chip: {
    alignSelf: 'flex-start',
    marginLeft: 46,
    marginTop: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.fieldBorder,
  },
  chipText: { fontSize: 13, color: colors.muted },
}));
