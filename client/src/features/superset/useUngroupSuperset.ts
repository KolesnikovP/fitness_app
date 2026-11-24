import { useState } from 'react';

import { useAuth } from '@/entities/auth';
import { ungroupSuperset, type Session } from '@/entities/workout';
import { errorMessage } from '@/shared/api';

/**
 * Takes a Superset's exercises out of it; Sets already logged keep the
 * Superset. Hands the Session on to onUngrouped, or what went wrong to
 * onError.
 */
export function useUngroupSuperset(
  sessionId: string,
  onUngrouped: (session: Session) => void,
  onError: (message: string) => void,
) {
  const { state } = useAuth();
  const [ungrouping, setUngrouping] = useState(false);

  async function ungroup(supersetId: string) {
    if (state.status !== 'signedIn') return;
    setUngrouping(true);
    try {
      onUngrouped(await ungroupSuperset(state.token, sessionId, supersetId));
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      setUngrouping(false);
    }
  }

  return { ungroup, ungrouping };
}
