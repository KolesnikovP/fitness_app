import { deleteSet, type Session } from '@/entities/workout';
import { errorMessage } from '@/shared/api';
import { usePendingDeletion } from '@/shared/hooks';

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
  const { pendingId, remove, undo, flush } = usePendingDeletion(
    (setId) => (token && sessionId ? deleteSet(token, sessionId, setId) : undefined),
    onDeleted,
    (e) => onError(errorMessage(e)),
  );
  return { pendingSetId: pendingId, remove, undo, flush };
}
