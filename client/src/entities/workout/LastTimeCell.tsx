import { Pressable, Text, View } from 'react-native';

import { makeStyles } from '@/shared/ui';

import { formatLastTimeSet, formatSet, type LastTimeSet } from './model';
import { setColumns } from './setColumns';

type LastTimeCellProps = {
  /** The Set's place in its exercise, from 1. */
  number: number;
  /** Last time's Set at that place; none when last time had fewer. */
  set: LastTimeSet | undefined;
  /** Puts last time's weight and reps into the row; a logged Set's cell can't be tapped. */
  onUse?: () => void;
};

/**
 * A row's cell in the set table's Last time column: last time's Set at its place,
 * "60 × 10" with "@ 7" under it when it had an RPE, or "–" when there was none.
 */
export function LastTimeCell({ number, set, onUse }: LastTimeCellProps) {
  const styles = useStyles();
  const label = `Set ${number} last time`;
  const value = { text: set ? formatSet(set) : 'None' };
  const content = set ? (
    <>
      <Text style={styles.text} numberOfLines={1} adjustsFontSizeToFit>
        {formatLastTimeSet(set)}
      </Text>
      {set.rpe !== null ? <Text style={styles.rpe}>@ {set.rpe}</Text> : null}
    </>
  ) : (
    <Text style={styles.text}>–</Text>
  );
  if (!onUse || !set) {
    return (
      <View accessible accessibilityLabel={label} accessibilityValue={value} style={[setColumns.lastTime, styles.cell]}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityValue={value}
      accessibilityHint="Puts it into this set"
      onPress={onUse}
      style={({ pressed }) => [setColumns.lastTime, styles.cell, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  cell: { minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  text: { fontSize: 14, color: colors.muted },
  rpe: { fontSize: 12, color: colors.muted },
  pressed: { opacity: 0.5 },
}));
