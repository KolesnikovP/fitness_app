// PROTOTYPE: throwaway. Lives on prototype/set-type-display only, never on main.
//
// Question: how should a Set's type (warm-up / failure / drop) show in the set table?
// Three variants of the set table on /workout/session, switchable via ?variant=A|B|C:
//   A  Letter in the number: W / F / D replaces the Set number; tap the number to pick.
//   B  Sections: warm-ups under their own heading, drop sets hang off the Set before them, failure as a line under.
//   C  Rail + chips: a coloured edge on the row and a word under it; numbers unchanged; chips under the next row.
// Logged rows already use the row fill for Record tiers, so no variant uses the fill for the type.
// Types live only in memory, by the Set's position in the table, and are not sent to the API.
import { useState, type ReactNode } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import { Button, makeStyles, spacing } from '@/shared/ui';

export type SetType = 'normal' | 'warmup' | 'failure' | 'drop';

export const SET_TYPE_VARIANTS = [
  { key: 'A', name: 'Letter in number' },
  { key: 'B', name: 'Sections' },
  { key: 'C', name: 'Rail + chips' },
] as const;

export const SET_TYPES: { value: SetType; letter: string; word: string; description: string }[] = [
  { value: 'normal', letter: '#', word: 'Normal', description: 'A working set' },
  {
    value: 'warmup',
    letter: 'W',
    word: 'Warm-up',
    description: 'Lighter, to get ready. Not counted in the set numbers',
  },
  { value: 'failure', letter: 'F', word: 'Failure', description: 'Taken until no more reps were possible' },
  { value: 'drop', letter: 'D', word: 'Drop', description: 'Straight after the set before, lighter, without rest' },
];

export const SET_TYPE_COLOURS: Record<SetType, string> = {
  normal: 'transparent',
  warmup: '#C98A2E',
  failure: '#C0503F',
  drop: '#4F82B8',
};

const info = (type: SetType) => SET_TYPES.find((t) => t.value === type)!;

/** A's numbering: warm-ups are W, failure F, drop D; the rest count up, skipping warm-ups and drops. */
export function letterNumber(types: SetType[], index: number) {
  const type = types[index] ?? 'normal';
  if (type === 'warmup') return 'W';
  if (type === 'drop') return 'D';
  if (type === 'failure') return 'F';
  return String(types.slice(0, index + 1).filter((t) => (t ?? 'normal') === 'normal' || t === 'failure').length);
}

/** B's numbering: warm-ups count 1.. among themselves, working sets count 1.. again, drops are ↳. */
export function sectionNumber(types: SetType[], index: number) {
  const type = types[index] ?? 'normal';
  if (type === 'drop') return '↳';
  const before = types.slice(0, index + 1).map((t) => t ?? 'normal');
  if (type === 'warmup') return String(before.filter((t) => t === 'warmup').length);
  return String(before.filter((t) => t === 'normal' || t === 'failure').length);
}

/** B's heading above a row, when the row starts the warm-ups or the working sets. */
export function sectionHeading(types: SetType[], index: number): string | null {
  const warm = (i: number) => types[i] === 'warmup';
  if (!types.some((t) => t === 'warmup')) return null;
  if (index === 0) return warm(0) ? 'WARM-UP' : 'WORKING SETS';
  if (warm(index) !== warm(index - 1)) return warm(index) ? 'WARM-UP' : 'WORKING SETS';
  return null;
}

/** The Set number cell as a button that opens the type sheet. */
export function TypeNumberButton({
  label,
  type,
  onChange,
}: {
  label: string;
  type: SetType;
  onChange: (type: SetType) => void;
}) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const coloured = type !== 'normal' && label !== '↳';
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Set type: ${info(type).word}`}
        onPress={() => setOpen(true)}
        hitSlop={8}
        style={styles.numberButton}
      >
        <Text style={[styles.numberText, coloured && { color: SET_TYPE_COLOURS[type], fontWeight: '800' }]}>
          {label}
        </Text>
      </Pressable>
      <TypeSheet open={open} type={type} onClose={() => setOpen(false)} onChange={onChange} />
    </>
  );
}

function TypeSheet({
  open,
  type,
  onClose,
  onChange,
}: {
  open: boolean;
  type: SetType;
  onClose: () => void;
  onChange: (type: SetType) => void;
}) {
  const styles = useStyles();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <Text style={styles.title}>Set type</Text>
        {SET_TYPES.map((t) => {
          const checked = t.value === type;
          return (
            <Pressable
              key={t.value}
              onPress={() => {
                onChange(t.value);
                onClose();
              }}
              style={[styles.option, checked && styles.optionChecked]}
            >
              <Text
                style={[
                  styles.optionLetter,
                  { color: t.value === 'normal' ? undefined : SET_TYPE_COLOURS[t.value] },
                  checked && styles.optionChecked,
                ]}
              >
                {t.value === 'normal' ? '1' : t.letter}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionWord, checked && styles.optionWordChecked]}>{t.word}</Text>
                <Text style={styles.description}>{t.description}</Text>
              </View>
            </Pressable>
          );
        })}
        <Button label="Cancel" variant="secondary" onPress={onClose} />
      </View>
    </Modal>
  );
}

/** B: a section heading. */
export function SectionHeading({ label }: { label: string }) {
  const styles = useStyles();
  return <Text style={styles.section}>{label}</Text>;
}

/** B: the failure line under a row. */
export function FailureLine() {
  const styles = useStyles();
  return <Text style={styles.failureLine}>To failure</Text>;
}

/** B: a drop set, indented and joined to the Set before it. */
export function DropIndent({ children }: { children: ReactNode }) {
  return (
    <View style={{ marginLeft: 18, paddingLeft: 6, borderLeftWidth: 2, borderLeftColor: SET_TYPE_COLOURS.drop }}>
      {children}
    </View>
  );
}

/** C: a coloured edge on the row, and the type's word under it. */
export function Rail({ type, children }: { type: SetType; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={[styles.rail, { borderLeftColor: SET_TYPE_COLOURS[type] }]}>
      {children}
      {type !== 'normal' ? (
        <Text style={[styles.railWord, { color: SET_TYPE_COLOURS[type] }]}>{info(type).word.toUpperCase()}</Text>
      ) : null}
    </View>
  );
}

/** C: chips under the next Set to do, to pick its type before logging it. */
export function TypeChips({ type, onChange }: { type: SetType; onChange: (type: SetType) => void }) {
  const styles = useStyles();
  return (
    <View style={styles.chips}>
      {SET_TYPES.map((t) => {
        const selected = t.value === type;
        return (
          <Pressable
            key={t.value}
            onPress={() => onChange(t.value)}
            style={[
              styles.chip,
              selected && {
                backgroundColor: t.value === 'normal' ? undefined : SET_TYPE_COLOURS[t.value],
                borderColor: SET_TYPE_COLOURS[t.value],
              },
              selected && t.value === 'normal' && styles.chipNormalSelected,
            ]}
          >
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{t.word}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  numberButton: { alignItems: 'center', justifyContent: 'center', minHeight: 32 },
  numberText: { fontSize: 17, color: colors.muted, textAlign: 'center', textDecorationLine: 'underline' },
  backdrop: { flex: 1, backgroundColor: colors.backdrop },
  sheet: {
    gap: spacing.sm,
    padding: spacing.md,
    paddingBottom: spacing.xl,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: colors.background,
  },
  title: { fontSize: 20, fontWeight: '600', color: colors.text },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.md,
    borderRadius: 10,
  },
  optionChecked: { backgroundColor: colors.card },
  optionLetter: { width: 28, fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center' },
  optionWord: { fontSize: 17, fontWeight: '600', color: colors.text },
  optionWordChecked: { fontWeight: '800' },
  description: { fontSize: 14, color: colors.muted },
  section: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: colors.muted, paddingTop: spacing.xs },
  failureLine: { fontSize: 13, fontWeight: '600', color: SET_TYPE_COLOURS.failure, paddingLeft: 34 },
  rail: { borderLeftWidth: 4, borderRadius: 4, paddingLeft: 4 },
  railWord: { fontSize: 10, fontWeight: '800', letterSpacing: 1, paddingLeft: 30 },
  chips: { flexDirection: 'row', gap: 6, paddingLeft: 34, paddingTop: 4, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: colors.border },
  chipNormalSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, color: colors.text },
  chipTextSelected: { color: '#fff', fontWeight: '700' },
}));
