import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthProvider, useAuth } from '@/entities/auth';
import { ThemeProvider, useTheme, useThemedStackOptions } from '@/shared/ui';

// Keep the splash screen up until the stored login has been checked, so a
// signed-in user never sees the login screen flash.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // Charts (victory-native) take touches through gesture handler, which
  // needs its root view above them.
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const { state } = useAuth();
  const { scheme } = useTheme();
  const themed = useThemedStackOptions();

  useEffect(() => {
    if (state.status !== 'loading') SplashScreen.hide();
  }, [state.status]);

  const signedIn = state.status === 'signedIn';
  const onboarded = signedIn && state.me.unitPreference !== null;

  // Each group is only reachable in its state; navigating anywhere else
  // redirects to the first screen that is.
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ ...themed, headerShown: false }}>
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
          <Stack.Screen name="index" />
          <Stack.Screen name="(tabs)" />
          {/* Over whichever tab it's opened from. */}
          <Stack.Screen name="edit-workout/[id]" options={{ presentation: 'fullScreenModal' }} />
        </Stack.Protected>
        {/* Reachable in every state: scripts/sim-seed.mjs opens it to log in. */}
        <Stack.Screen name="dev-log-in" />
      </Stack>
    </>
  );
}
