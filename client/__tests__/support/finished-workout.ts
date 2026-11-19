import { router } from 'expo-router';
import { act, screen } from 'expo-router/testing-library';

/**
 * Opens a finished Session's workout screen from Profile and waits for its
 * Carousel. Its Sets are listed there, each with its mark; the "Workout
 * finished" screen after Finish workout lists none.
 */
export async function openFinishedWorkout(sessionId: string) {
  await act(async () => router.navigate(`/profile/workouts/${sessionId}`));
  await screen.findByLabelText('Carousel');
}
