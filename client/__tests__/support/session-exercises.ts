import { fireEvent, screen, within } from 'expo-router/testing-library';

/** The strip of tiles on the workout in progress, one per Session exercise. */
export function strip() {
  return within(screen.getByLabelText('Exercises in this workout'));
}

/** Shows one Session exercise of the workout in progress by tapping its tile. */
export async function showExercise(name: string) {
  await fireEvent.press(strip().getByRole('tab', { name }));
}

/** Shows one Session exercise of the workout in progress, and returns its card. */
export async function exerciseCard(name: string) {
  await showExercise(name);
  return within(screen.getByLabelText(`${name} card`));
}

/** The names on the strip's tiles, in order. */
export function tileNames(): string[] {
  return strip()
    .getAllByRole('tab')
    .map((tile) => tile.props.accessibilityLabel);
}

/** The name on the tile shown. */
export function shownTile(): string | undefined {
  return strip().queryByRole('tab', { selected: true })?.props.accessibilityLabel;
}
