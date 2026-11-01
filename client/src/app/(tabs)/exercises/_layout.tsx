import { Stack } from 'expo-router';

import { useTheme } from '@/shared/ui';

export default function ExercisesLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        title: '',
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.primary,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}
