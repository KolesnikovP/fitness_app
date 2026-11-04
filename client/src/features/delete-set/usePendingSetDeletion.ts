import { useCallback, useEffect, useRef, useState } from 'react';

import { deleteSet, type Session } from '@/entities/workout';
import { errorMessage } from '@/shared/api';

/** How long the User has to undo deleting a Set. */
export const UNDO_MS = 5_000;

type Pending = { setId: string; timer: ReturnType<typeof setTimeout> };

/**
 * Deletes a Set after a moment to undo it. Until then the Set is only
 * pending: the caller hides it, and nothing has been sent. Deleting another
 * Set, leaving the screen or calling flush sends the pending one at once.
 */
export function usePendingSetDeletion(
  token: string | null,
  sessionId: string | null,
  onDeleted: (session: Session) => void,
  onError: (message: string) => void,
) {
  const [pendingSetId, setPendingSetId] = useState<string | null>(null);
  const pending = useRef<Pending | null>(null);
  // The latest callbacks, so a timer set earlier reports to the current ones.
  const callbacks = useRef({ onDeleted, onError });
  // eslint-disable-next-line react-hooks/refs -- predates the linter; refactor when next touched.
  callbacks.current = { onDeleted, onError };

  const send = useCallback(async () => {
    const current = pending.current;
    if (!current || !token || !sessionId) return;
    clearTimeout(current.timer);
    pending.current = null;
    try {
      callbacks.current.onDeleted(await deleteSet(token, sessionId, current.setId));
    } catch (e) {
      callbacks.current.onError(errorMessage(e));
    } finally {
      setPendingSetId((id) => (id === current.setId ? null : id));
    }
  }, [token, sessionId]);

  const remove = useCallback(
    (setId: string) => {
      void send();
      pending.current = { setId, timer: setTimeout(() => void send(), UNDO_MS) };
      setPendingSetId(setId);
    },
    [send],
  );

  const undo = useCallback(() => {
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = null;
    setPendingSetId(null);
  }, []);

  // Leaving the screen doesn't cancel a deletion the User didn't undo.
  useEffect(() => () => void send(), [send]);

  return { pendingSetId, remove, undo, flush: send };
}
