import { Stack } from 'expo-router';

import { useThemedStackOptions } from '@/shared/ui';

export default function AuthLayout() {
  const themed = useThemedStackOptions();
  return (
    <Stack screenOptions={{ ...themed, headerShown: false }}>
      <Stack.Screen name="log-in" />
      <Stack.Screen name="sign-up" />
    </Stack>
  );
}
