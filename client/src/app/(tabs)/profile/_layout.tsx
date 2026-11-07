import { Stack } from 'expo-router';

import { useThemedStackOptions } from '@/shared/ui';

export default function ProfileLayout() {
  const themed = useThemedStackOptions();
  return (
    <Stack screenOptions={{ ...themed, title: '', headerShadowVisible: false }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="edit" options={{ presentation: 'modal', headerShown: false }} />
    </Stack>
  );
}
