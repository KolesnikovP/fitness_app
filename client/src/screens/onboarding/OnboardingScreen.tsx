import { Text } from 'react-native';

import { UnitPicker } from '@/features/set-unit-preference';
import { makeStyles, Screen } from '@/shared/ui';

export function OnboardingScreen() {
  const styles = useStyles();
  return (
    <Screen title="Pick your units">
      <Text style={styles.subtitle}>All weights in the app will show in this unit.</Text>
      <UnitPicker />
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  subtitle: { fontSize: 17, color: colors.muted },
}));
