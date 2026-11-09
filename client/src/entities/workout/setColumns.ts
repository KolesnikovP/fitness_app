import { StyleSheet } from 'react-native';

/**
 * The columns of a Session exercise's set table, shared by its header, its
 * logged Sets and the rows for Sets still to log, so they line up.
 */
export const setColumns = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  number: { width: 40 },
  // Last time's Set at the row's place.
  lastTime: { flex: 1.2 },
  weight: { flex: 1.3 },
  reps: { flex: 1 },
  rpe: { flex: 1 },
  done: { width: 40, alignItems: 'center' },
});
