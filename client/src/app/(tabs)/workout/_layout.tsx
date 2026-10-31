import { Stack } from 'expo-router';

export default function WorkoutLayout() {
  return (
    <Stack screenOptions={{ title: '', headerShadowVisible: false }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}
