import { StyleSheet } from 'react-native';

const GAP = 6;
const DONE_WIDTH = 40;
const WEIGHT = 1.3;
const REPS = 1;
const RPE = 1;

/**
 * The columns of a Session exercise's set table, shared by its header, its
 * logged Sets and the rows for Sets still to log, so they line up.
 */
export const setColumns = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: GAP },
  number: { width: 40 },
  // Last time's Set at the row's place.
  lastTime: { flex: 1.2 },
  weight: { flex: WEIGHT },
  reps: { flex: REPS },
  rpe: { flex: RPE },
  done: { width: DONE_WIDTH, alignItems: 'center' },
  // The weight, reps, RPE and done columns held together in one row, as a
  // logged Set's tappable values are: it takes the room the four columns and
  // the gaps between them take in the header, so the values line up.
  values: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: GAP,
    flexGrow: WEIGHT + REPS + RPE,
    flexShrink: 1,
    flexBasis: DONE_WIDTH + 3 * GAP,
  },
});
