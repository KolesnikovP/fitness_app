import { useCallback, useState } from 'react';

import { untouchedRows, type RowsToDo, type SessionExercise } from '@/entities/workout';

/** A change to a set table's rows still to do, given them as they are now. */
export type RowsChange = (rows: RowsToDo) => RowsToDo;

/**
 * What the User did to each Session exercise's rows still to do (see
 * RowsToDo), kept by the screen rather than the set table, so it survives
 * while another Session exercise is shown. A Swap starts them over, from the
 * Exercise swapped to.
 */
export function useRowsToDo() {
  const [byExercise, setByExercise] = useState<Record<string, { exerciseId: string; rows: RowsToDo }>>({});

  const rowsOf = (sessionExercise: SessionExercise): RowsToDo => {
    const kept = byExercise[sessionExercise.id];
    return kept && kept.exerciseId === sessionExercise.exerciseId ? kept.rows : untouchedRows;
  };

  const change = useCallback((sessionExercise: SessionExercise, update: RowsChange) => {
    const { id, exerciseId } = sessionExercise;
    setByExercise((current) => {
      const kept = current[id];
      const rows = kept && kept.exerciseId === exerciseId ? kept.rows : untouchedRows;
      return { ...current, [id]: { exerciseId, rows: update(rows) } };
    });
  }, []);

  return { rowsOf, change };
}
