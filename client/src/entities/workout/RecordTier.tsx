import { Text } from 'react-native';

import { makeStyles } from '@/shared/ui';

import { recordTierMedals, type RecordTier } from './model';

/**
 * A Record tier's fill and the text on it, for a Set's row or line; none for a
 * Set without a tier, so it looks as it always has.
 */
export function useRecordTierColours(tier: RecordTier | null) {
  const styles = useStyles();
  if (!tier) return { fill: null, text: null };
  return { fill: styles[tier], text: styles[`${tier}Text`] };
}

/** A Record tier's medal. Hidden from screen readers: the Set's value says its tier. */
export function RecordTierMedal({ tier }: { tier: RecordTier }) {
  const styles = useStyles();
  return (
    <Text importantForAccessibility="no" style={styles.medal}>
      {recordTierMedals[tier]}
    </Text>
  );
}

const useStyles = makeStyles((colors) => ({
  medal: { fontSize: 13 },
  gold: { backgroundColor: colors.gold },
  goldText: { color: colors.goldText },
  silver: { backgroundColor: colors.silver },
  silverText: { color: colors.silverText },
  bronze: { backgroundColor: colors.bronze },
  bronzeText: { color: colors.bronzeText },
}));
