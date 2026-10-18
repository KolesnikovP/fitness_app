import { StyleSheet, Text } from 'react-native';

import { UnitPicker } from '@/features/set-unit-preference';
import { colors, Screen } from '@/shared/ui';

export function OnboardingScreen() {
  return (
    <Screen title="Pick your units">
      <Text style={styles.subtitle}>All weights in the app will show in this unit.</Text>
      <UnitPicker />
    </Screen>
  );
}

const styles = StyleSheet.create({
  subtitle: { fontSize: 17, color: colors.muted },
});
