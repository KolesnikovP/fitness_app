import type { within } from 'expo-router/testing-library';

/**
 * The logged Sets in a card's set table, in order, as each row reads out to
 * a screen reader: "140 kg × 5", "140 kg × 5 @ RPE 8".
 */
export function loggedSets(card: ReturnType<typeof within>): string[] {
  return card
    .queryAllByRole('button', { name: /^Edit set \d+$/ })
    .map((row) => (row.props.accessibilityValue as { text: string }).text);
}
