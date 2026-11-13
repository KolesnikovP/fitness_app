import { fireEvent, screen, within } from 'expo-router/testing-library';

/** Opens the Swap sheet for a Session exercise: its card's ⋯ menu, then Replace exercise. */
export async function openSwapSheet(name: string) {
  await fireEvent.press(screen.getByRole('button', { name: `${name} options` }));
  await fireEvent.press(
    within(await screen.findByLabelText(`${name} options sheet`)).getByRole('button', { name: 'Replace exercise' }),
  );
}
