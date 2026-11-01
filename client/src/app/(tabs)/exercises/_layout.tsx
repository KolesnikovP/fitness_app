import { Stack } from 'expo-router';

import { useThemedStackOptions } from '@/shared/ui';

export default function ExercisesLayout() {
  const themed = useThemedStackOptions();
  return (
    <Stack screenOptions={{ ...themed, title: '', headerShadowVisible: false }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}
