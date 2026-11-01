import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useTheme } from '@/shared/ui';

export default function TabsLayout() {
  const { colors, scheme } = useTheme();
  return (
    <NativeTabs
      // Gold marks the open tab in the dark; in the light, charcoal does.
      tintColor={scheme === 'dark' ? colors.primary : colors.text}
      iconColor={colors.muted}
      backgroundColor={colors.background}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf="newspaper.fill" md="dynamic_feed" />
        <NativeTabs.Trigger.Label>Feed</NativeTabs.Trigger.Label>
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
