import { Redirect, router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect } from 'react';

import { useAuth } from '@/entities/auth';

/**
 * Development only: logs in with ?token= and goes on to ?next= (the Workout
 * tab without one), so scripts/sim-seed.mjs can put the simulator in a
 * seeded account. Outside development it only goes home.
 */
export default function DevLogIn() {
  const { token, next } = useLocalSearchParams<{ token?: string; next?: string }>();
  const { logInWithToken } = useAuth();

  useEffect(() => {
    if (!__DEV__ || !token) return;
    logInWithToken(token).then(() => router.replace((next ?? '/workout') as Href));
  }, [token, next, logInWithToken]);

  if (!__DEV__ || !token) return <Redirect href="/" />;
  return null;
}
