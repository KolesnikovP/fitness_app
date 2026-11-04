import { Text, View } from 'react-native';

import { Button, makeStyles, spacing } from '@/shared/ui';

import { formatPersonalRecord, type PersonalRecord } from './model';

/** Tells the User a Set they just logged set a Personal record, with a button to dismiss it. */
export function NewRecordBanner({ records, onDismiss }: { records: PersonalRecord[]; onDismiss: () => void }) {
  const styles = useStyles();
  return (
    <View accessibilityLabel="New personal record" accessibilityLiveRegion="polite" style={styles.banner}>
      <View style={styles.body}>
        <Text style={styles.title}>🏆 New personal record!</Text>
        {records.map((record) => (
          <Text key={`${record.setId}/${record.kind}`} style={styles.record}>
            {formatPersonalRecord(record)}
          </Text>
        ))}
      </View>
      <Button label="Dismiss" variant="link" onPress={onDismiss} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 10,
    backgroundColor: colors.primary,
  },
  body: { flex: 1, gap: 2 },
  title: { fontSize: 17, fontWeight: '700', color: colors.primaryText },
  record: { fontSize: 15, color: colors.primaryText },
}));
