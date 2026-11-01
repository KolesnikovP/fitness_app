import { Text, View } from 'react-native';

import { useAuth } from '@/entities/auth';
import { LogOutButton } from '@/features/log-out';
import { ThemePicker } from '@/features/set-theme-preference';
import { makeStyles, Screen, spacing } from '@/shared/ui';

export function ProfileScreen() {
  const styles = useStyles();
  const { state } = useAuth();
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
      <ThemePicker />
      <LogOutButton />
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  row: { gap: spacing.xs },
  label: { fontSize: 15, color: colors.muted },
  value: { fontSize: 17, color: colors.text },
}));
