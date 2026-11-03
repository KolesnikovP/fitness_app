import { Text, View } from 'react-native';

import { makeStyles, spacing } from '@/shared/ui';

import { formatPersonalRecord, type PersonalRecord } from './model';

/** The Personal records a finished Session set, or nothing when it set none. */
export function PersonalRecordList({ records }: { records: PersonalRecord[] }) {
  const styles = useStyles();
  if (records.length === 0) return null;
  return (
    <View accessibilityLabel="Personal records" style={styles.card}>
      <Text accessibilityRole="header" style={styles.title}>
        Personal records
      </Text>
      {records.map((record) => (
        <Text key={`${record.setId}/${record.kind}`} style={styles.record}>
          {formatPersonalRecord(record)}
        </Text>
      ))}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: { backgroundColor: colors.card, borderRadius: 12, padding: spacing.md, gap: spacing.xs },
  title: { fontSize: 17, fontWeight: '700', color: colors.primary },
  record: { fontSize: 15, color: colors.text },
}));
