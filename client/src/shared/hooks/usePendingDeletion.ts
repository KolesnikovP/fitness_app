import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/** How long the User has to undo a deletion. */
export const UNDO_MS = 5_000;

type Pending = { id: string; timer: ReturnType<typeof setTimeout> };

/**
 * Deletes something after a moment to undo it. Until then it's only pending:
 * the caller hides it, and nothing has been sent. Deleting another, leaving
 * the screen or calling flush sends the pending one at once. request may
 * return undefined when it can't be sent, such as once signed out.
 */
export function usePendingDeletion<R>(
  request: (id: string) => Promise<R> | undefined,
  onDeleted: (result: R) => void,
  onError: (error: unknown) => void,
) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const pending = useRef<Pending | null>(null);
  // The latest callbacks, so a timer set earlier reports to the current ones.
  const latest = useRef({ request, onDeleted, onError });
  useLayoutEffect(() => {
    latest.current = { request, onDeleted, onError };
  });

  const flush = useCallback(async () => {
    const current = pending.current;
    if (!current) return;
    const sent = latest.current.request(current.id);
    if (!sent) return;
    clearTimeout(current.timer);
    pending.current = null;
    try {
      latest.current.onDeleted(await sent);
    } catch (e) {
      latest.current.onError(e);
    } finally {
      setPendingId((id) => (id === current.id ? null : id));
    }
  }, []);

  const remove = useCallback(
    (id: string) => {
      void flush();
      pending.current = { id, timer: setTimeout(() => void flush(), UNDO_MS) };
      setPendingId(id);
    },
    [flush],
  );

  const undo = useCallback(() => {
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = null;
    setPendingId(null);
  }, []);

  // Leaving the screen doesn't cancel a deletion the User didn't undo.
  useEffect(() => () => void flush(), [flush]);

  return { pendingId, remove, undo, flush };
}
