import { removeSessionExercise, type Session } from '@/entities/workout';
import { errorMessage } from '@/shared/api';
import { usePendingDeletion } from '@/shared/hooks';

/**
 * Removes a Session exercise, with its Sets, after a moment to undo it. Until
 * then it's only pending: the caller hides it, and nothing has been sent.
 * Removing another, leaving the screen or calling flush sends the pending one
 * at once.
 */
export function usePendingExerciseRemoval(
  token: string | null,
  sessionId: string | null,
  onRemoved: (session: Session) => void,
  onError: (message: string) => void,
) {
  const { pendingId, remove, undo, flush } = usePendingDeletion(
    (sessionExerciseId) =>
      token && sessionId ? removeSessionExercise(token, sessionId, sessionExerciseId) : undefined,
    onRemoved,
    (e) => onError(errorMessage(e)),
  );
  return { pendingExerciseId: pendingId, remove, undo, flush };
}
