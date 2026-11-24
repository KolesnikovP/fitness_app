import { fireEvent, screen, within } from 'expo-router/testing-library';

import { showExercise } from './session-exercises';

/** The row of chips under a shown Session exercise's heading. */
export function chips(name: string) {
  return within(screen.getByLabelText(`${name} actions`));
}

/** What each chip of a shown Session exercise reads, in order; ⋯ reads More. */
export function chipNames(name: string): string[] {
  return chips(name)
    .getAllByRole('button')
    .map((chip) => chip.props.accessibilityLabel);
}

/** Shows a Session exercise and taps its chip labelled chip. */
export async function pressChip(name: string, chip: 'Swap' | 'Note' | 'Superset' | 'Ungroup' | 'More') {
  await showExercise(name);
  await fireEvent.press(chips(name).getByRole('button', { name: chip }));
}

/** Shows a Session exercise and chooses item in the sheet its ⋯ chip opens. */
export async function openExerciseMenuItem(name: string, item: 'Replace exercise' | 'Remove exercise') {
  await pressChip(name, 'More');
  await fireEvent.press(
    within(await screen.findByLabelText(`${name} options sheet`)).getByRole('button', { name: item }),
  );
}

/** Opens the Swap sheet for a Session exercise with Substitutes, from its Swap chip. */
export async function openSwapSheet(name: string) {
  await pressChip(name, 'Swap');
}

/**
 * Swaps a Session exercise with Substitutes from the Exercise done now
 * (from) to another (to) through its Swap sheet, and returns the card it
 * becomes.
 */
export async function swap(from: string, to: string) {
  await openSwapSheet(from);
  await fireEvent.press(
    within(await screen.findByLabelText(/^Substitutes for /)).getByRole('button', { name: `Swap to ${to}` }),
  );
  return within(await screen.findByLabelText(`${to} card`));
}

/** Shows a Session exercise and chooses Remove exercise in the sheet of its ⋯ chip. */
export async function removeExercise(name: string) {
  await openExerciseMenuItem(name, 'Remove exercise');
}
