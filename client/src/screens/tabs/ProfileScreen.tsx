import { StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/entities/session';
import { LogOutButton } from '@/features/log-out';
import { colors, Screen, spacing } from '@/shared/ui';

export function ProfileScreen() {
  const { state } = useSession();
  if (state.status !== 'signedIn') return null;

  return (
    <Screen title="Profile">
      <View style={styles.row}>
        <Text style={styles.label}>Email</Text>
        <Text style={styles.value}>{state.me.email}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Units</Text>
        <Text style={styles.value}>{state.me.unitPreference}</Text>
      </View>
      <LogOutButton />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.xs },
  label: { fontSize: 15, color: colors.muted },
  value: { fontSize: 17, color: colors.text },
});
