import { Stack } from 'expo-router';

export default function ExercisesLayout() {
  return (
    <Stack screenOptions={{ title: '', headerShadowVisible: false }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}
