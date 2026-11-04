import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useTheme } from '@/shared/ui';

export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <NativeTabs tintColor={colors.tabActive} iconColor={colors.muted} backgroundColor={colors.background}>
      <NativeTabs.Trigger name="(history)">
        <NativeTabs.Trigger.Icon sf="clock.arrow.circlepath" md="history" />
        <NativeTabs.Trigger.Label>History</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="workout">
        <NativeTabs.Trigger.Icon sf="dumbbell.fill" md="fitness_center" />
        <NativeTabs.Trigger.Label>Workout</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="exercises">
        <NativeTabs.Trigger.Icon sf="list.bullet" md="list" />
        <NativeTabs.Trigger.Label>Exercises</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Icon sf="person.crop.circle" md="person" />
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
