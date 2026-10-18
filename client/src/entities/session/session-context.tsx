import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { getMe, setUnitPreference as setUnitPreferenceRequest, type Me, type UnitPreference } from '@/entities/user';
import { ApiError } from '@/shared/api';

import { logInRequest, signUpRequest } from './api';
import { tokenStorage } from './token-storage';

export type SessionState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  /** A token is stored but the server can't be reached to check it. */
  | { status: 'unreachable' }
  | { status: 'signedIn'; token: string; me: Me };

type SessionContextValue = {
  state: SessionState;
  signUp: (email: string, password: string) => Promise<void>;
  logIn: (email: string, password: string) => Promise<void>;
  logOut: () => Promise<void>;
  setUnitPreference: (unit: UnitPreference) => Promise<void>;
  /** Try restoring the stored session again, after 'unreachable'. */
  retry: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' });

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

  const startSession = useCallback(async (token: string) => {
    const me = await getMe(token);
    await tokenStorage.set(token);
    setState({ status: 'signedIn', token, me });
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      state,
      signUp: async (email, password) => {
        const { token } = await signUpRequest(email, password);
        await startSession(token);
      },
      logIn: async (email, password) => {
        const { token } = await logInRequest(email, password);
        await startSession(token);
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
    [state, startSession, restore],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>');
  return value;
}
