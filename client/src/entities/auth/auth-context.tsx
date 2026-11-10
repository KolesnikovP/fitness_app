import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { getMe, setUnitPreference as setUnitPreferenceRequest, type Me } from '@/entities/user/@x/auth';
import { ApiError } from '@/shared/api';
import type { UnitPreference } from '@/shared/model';

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
  /** Show me as the signed-in User, after a change to their Profile was saved. */
  setMe: (me: Me) => void;
  /** Try restoring the stored login again, after 'unreachable'. */
  retry: () => Promise<void>;
  /** Development only: log in with a token the API issued, as scripts/sim-seed.mjs does through /dev-log-in. */
  logInWithToken: (token: string) => Promise<void>;
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- predates the linter; refactor when next touched.
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
      setMe: (me) => {
        if (state.status !== 'signedIn') return;
        setState({ status: 'signedIn', token: state.token, me });
      },
      retry: async () => {
        setState({ status: 'loading' });
        await restore();
      },
      logInWithToken: finishLogIn,
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
