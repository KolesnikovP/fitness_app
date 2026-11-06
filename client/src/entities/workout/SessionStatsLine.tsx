import { Text } from 'react-native';

import { makeStyles } from '@/shared/ui';

import { formatStats, type SessionStats } from './model';

/** A finished Session's duration, Volume, exercise count and set count, on one line. */
export function SessionStatsLine({ stats }: { stats: SessionStats }) {
  const styles = useStyles();
  return <Text style={styles.stats}>{formatStats(stats)}</Text>;
}

const useStyles = makeStyles((colors) => ({
  stats: { fontSize: 15, color: colors.muted },
}));
