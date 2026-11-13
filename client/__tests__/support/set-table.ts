import { fireEvent, screen, within } from 'expo-router/testing-library';

/**
 * The logged Sets in a card's set table, in order, as each row reads out to
 * a screen reader: "140 kg × 5", "140 kg × 5 @ RPE 8", then its Set type
 * unless normal and its Record tier if any: "60 kg × 8, Warm-up",
 * "100 kg × 5, Silver" (see formatSetWithTier).
 */
export function loggedSets(card: ReturnType<typeof within>): string[] {
  return readouts(card.queryAllByRole('button', { name: /^Edit set \d+$/ }));
}

/** What a screen reader says each of these elements' value is, in order. */
export function readouts(elements: { props: { accessibilityValue?: unknown } }[]): string[] {
  return elements.map((element) => (element.props.accessibilityValue as { text: string }).text);
}

/**
 * How many rows a card's set table shows for Sets still to do: one "Log set
 * N" box each.
 */
export function rowsToDo(card: ReturnType<typeof within>): number {
  return card.queryAllByRole('button', { name: /^Log set \d+$/ }).length;
}

/**
 * Gives Set n of a card's set table a Set type ("Warm-up", "Drop"...) by
 * tapping its mark and picking from the options, whether it's logged or
 * still to do.
 */
export async function chooseSetType(card: ReturnType<typeof within>, n: number, type: string) {
  await fireEvent.press(card.getByRole('button', { name: `Set ${n} type` }));
  await fireEvent.press(within(screen.getByLabelText(`Set ${n} type options`)).getByRole('radio', { name: type }));
}
