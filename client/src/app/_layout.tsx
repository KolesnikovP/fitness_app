import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { AuthProvider, useAuth } from '@/entities/auth';

// Keep the splash screen up until the stored login has been checked, so a
// signed-in user never sees the login screen flash.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}

function RootNavigator() {
  const { state } = useAuth();

  useEffect(() => {
    if (state.status !== 'loading') SplashScreen.hide();
  }, [state.status]);

  const signedIn = state.status === 'signedIn';
  const onboarded = signedIn && state.me.unitPreference !== null;

  // Each group is only reachable in its state; navigating anywhere else
  // redirects to the first screen that is.
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={state.status === 'loading' || state.status === 'signedOut'}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={state.status === 'unreachable'}>
        <Stack.Screen name="unavailable" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !onboarded}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={onboarded}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
    </Stack>
  );
}
