import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { getMe, setUnitPreference as setUnitPreferenceRequest, type Me, type UnitPreference } from '@/entities/user';
import { ApiError } from '@/shared/api';

import { logInRequest, signUpRequest } from './api';
import { tokenStorage } from './token-storage';

export type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  /** A token is stored but the server can't be reached to check it. */
  | { status: 'unreachable' }
  | { status: 'signedIn'; token: string; me: Me };

type AuthContextValue = {
  state: AuthState;
  signUp: (email: string, password: string) => Promise<void>;
  logIn: (email: string, password: string) => Promise<void>;
  logOut: () => Promise<void>;
  setUnitPreference: (unit: UnitPreference) => Promise<void>;
  /** Try restoring the stored login again, after 'unreachable'. */
  retry: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  const restore = useCallback(async () => {
    const token = await tokenStorage.get();
    if (!token) {
      setState({ status: 'signedOut' });
      return;
    }
    try {
      setState({ status: 'signedIn', token, me: await getMe(token) });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        // Expired, or the account is gone: start over at login.
        await tokenStorage.clear();
        setState({ status: 'signedOut' });
      } else {
        // Keep the token; being offline shouldn't log the user out.
        setState({ status: 'unreachable' });
      }
    }
  }, []);

  useEffect(() => {
    restore();
  }, [restore]);

  const finishLogIn = useCallback(async (token: string) => {
    const me = await getMe(token);
    await tokenStorage.set(token);
    setState({ status: 'signedIn', token, me });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      signUp: async (email, password) => {
        const { token } = await signUpRequest(email, password);
        await finishLogIn(token);
      },
      logIn: async (email, password) => {
        const { token } = await logInRequest(email, password);
        await finishLogIn(token);
      },
      logOut: async () => {
        await tokenStorage.clear();
        setState({ status: 'signedOut' });
      },
      setUnitPreference: async (unit) => {
        if (state.status !== 'signedIn') return;
        const me = await setUnitPreferenceRequest(state.token, unit);
        setState({ status: 'signedIn', token: state.token, me });
      },
      retry: async () => {
        setState({ status: 'loading' });
        await restore();
      },
    }),
    [state, finishLogIn, restore],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
