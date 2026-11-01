import { parseReps, parseWeight, type WeightUnit } from '@/entities/workout';

/**
 * One Exercise slot of a Routine: the Exercise and its Target. targetWeight
 * is in weightUnit. restSeconds is null when no rest is planned. Slots
 * sharing a supersetGroup are a planned Superset.
 */
export type RoutineSlot = {
  id: string;
  exerciseId: string;
  name: string;
  targetSets: number;
  targetReps: number;
  targetWeight: number;
  weightUnit: WeightUnit;
  restSeconds: number | null;
  note: string;
  supersetGroup: number | null;
};

/** A saved Routine, its slots in order. */
export type Routine = { id: string; name: string; updatedAt: string; slots: RoutineSlot[] };

/** A Routine as the list of them shows it. */
export type RoutineSummary = { id: string; name: string; updatedAt: string; exerciseNames: string[] };

/** A Routine to save, as the API takes it. */
export type RoutineInput = { name: string; slots: Omit<RoutineSlot, 'id' | 'name'>[] };

/** An Exercise slot as the User is editing it. key tells slots apart while editing. */
export type SlotDraft = {
  key: string;
  exerciseId: string;
  name: string;
  sets: string;
  reps: string;
  weight: string;
  weightUnit: WeightUnit;
  restSeconds: number | null;
  note: string;
  supersetGroup: number | null;
};

/** A Routine as the User is building or editing it. */
export type RoutineDraft = { name: string; slots: SlotDraft[] };

export const emptyRoutineDraft: RoutineDraft = { name: '', slots: [] };

export const MAX_TARGET_SETS = 20;

/** The rests a slot can plan, in seconds. */
export const REST_OPTIONS: readonly number[] = [60, 90, 120, 180, 240, 300];

/** How the slots of a Routine are laid out: single slots and Supersets. */
export type SlotBlock =
  | { kind: 'slot'; slot: SlotDraft }
  | { kind: 'superset'; group: number; slots: SlotDraft[] };

let lastKey = 0;
function newKey(): string {
  lastKey += 1;
  return `new-${lastKey}`;
}

/**
 * Groups slots into blocks. A Superset takes the place of its first slot,
 * with the rest of its slots right after it.
 */
export function slotBlocks<T extends { supersetGroup: number | null }>(
  slots: T[],
): ({ kind: 'slot'; slot: T } | { kind: 'superset'; group: number; slots: T[] })[] {
  const blocks: ({ kind: 'slot'; slot: T } | { kind: 'superset'; group: number; slots: T[] })[] = [];
  const groups = new Map<number, T[]>();
  for (const slot of slots) {
    if (slot.supersetGroup === null) {
      blocks.push({ kind: 'slot', slot });
      continue;
    }
    const members = groups.get(slot.supersetGroup);
    if (members) {
      members.push(slot);
    } else {
      const started = [slot];
      groups.set(slot.supersetGroup, started);
      blocks.push({ kind: 'superset', group: slot.supersetGroup, slots: started });
    }
  }
  return blocks;
}

function flatten(blocks: SlotBlock[]): SlotDraft[] {
  return blocks.flatMap((block) => (block.kind === 'slot' ? [block.slot] : block.slots));
}

/** A draft holding a saved Routine, to edit it. */
export function routineDraftOf(routine: Routine): RoutineDraft {
  const slots = routine.slots.map(
    (slot): SlotDraft => ({
      key: slot.id,
      exerciseId: slot.exerciseId,
      name: slot.name,
      sets: String(slot.targetSets),
      reps: String(slot.targetReps),
      weight: String(slot.targetWeight),
      weightUnit: slot.weightUnit,
      restSeconds: slot.restSeconds,
      note: slot.note,
      supersetGroup: slot.supersetGroup,
    }),
  );
  // Each Superset's slots together, as they're shown.
  return { name: routine.name, slots: flatten(slotBlocks(slots)) };
}

/** Keeps only digits as the User types target sets, at most 2. */
export function setsInput(text: string): string {
  return text.replace(/\D/g, '').slice(0, 2);
}

/** Target sets from 1 to 20; null otherwise. */
export function parseSets(text: string): number | null {
  const sets = parseReps(text);
  return sets !== null && sets <= MAX_TARGET_SETS ? sets : null;
}

/** The Routine a draft describes, or null while it has no name, no slots or an incomplete slot. */
export function parseRoutineDraft(draft: RoutineDraft): RoutineInput | null {
  const name = draft.name.trim();
  if (name === '' || draft.slots.length === 0) return null;
  const slots: RoutineInput['slots'] = [];
  for (const slot of draft.slots) {
    const targetSets = parseSets(slot.sets);
    const targetReps = parseReps(slot.reps);
    const targetWeight = parseWeight(slot.weight);
    if (targetSets === null || targetReps === null || targetWeight === null) return null;
    slots.push({
      exerciseId: slot.exerciseId,
      targetSets,
      targetReps,
      targetWeight,
      weightUnit: slot.weightUnit,
      restSeconds: slot.restSeconds,
      note: slot.note.trim(),
      supersetGroup: slot.supersetGroup,
    });
  }
  return { name, slots };
}

/** The draft with a slot for exercise added at the end, 3 × 10 at a weight still to fill in. */
export function withSlotAdded(
  draft: RoutineDraft,
  exercise: { id: string; name: string },
  weightUnit: WeightUnit,
): RoutineDraft {
  const slot: SlotDraft = {
    key: newKey(),
    exerciseId: exercise.id,
    name: exercise.name,
    sets: '3',
    reps: '10',
    weight: '',
    weightUnit,
    restSeconds: null,
    note: '',
    supersetGroup: null,
  };
  return { ...draft, slots: [...draft.slots, slot] };
}

export function withSlotChanged(draft: RoutineDraft, key: string, patch: Partial<SlotDraft>): RoutineDraft {
  return { ...draft, slots: draft.slots.map((slot) => (slot.key === key ? { ...slot, ...patch } : slot)) };
}

/** The draft without the slot. A Superset left with one slot is ungrouped. */
export function withSlotRemoved(draft: RoutineDraft, key: string): RoutineDraft {
  const removed = draft.slots.find((slot) => slot.key === key);
  const slots = draft.slots.filter((slot) => slot.key !== key);
  const group = removed?.supersetGroup ?? null;
  if (group !== null && slots.filter((slot) => slot.supersetGroup === group).length < 2) {
    return { ...draft, slots: slots.map((slot) => (slot.supersetGroup === group ? { ...slot, supersetGroup: null } : slot)) };
  }
  return { ...draft, slots };
}

/** The draft with the block holding the slot (the slot, or its whole Superset) moved one place up or down. */
export function withBlockMoved(draft: RoutineDraft, key: string, direction: -1 | 1): RoutineDraft {
  const blocks = slotBlocks(draft.slots);
  const from = blocks.findIndex((block) =>
    block.kind === 'slot' ? block.slot.key === key : block.slots.some((slot) => slot.key === key),
  );
  const to = from + direction;
  if (from === -1 || to < 0 || to >= blocks.length) return draft;
  [blocks[from], blocks[to]] = [blocks[to], blocks[from]];
  return { ...draft, slots: flatten(blocks) };
}

/** The draft with the slots grouped into a new Superset, in the place of the first of them. */
export function withSuperset(draft: RoutineDraft, keys: string[]): RoutineDraft {
  const group = Math.max(0, ...draft.slots.map((slot) => slot.supersetGroup ?? 0)) + 1;
  return {
    ...draft,
    slots: flatten(
      slotBlocks(draft.slots.map((slot) => (keys.includes(slot.key) ? { ...slot, supersetGroup: group } : slot))),
    ),
  };
}

/** The draft with a Superset's slots taken out of it. */
export function withoutSuperset(draft: RoutineDraft, group: number): RoutineDraft {
  return {
    ...draft,
    slots: draft.slots.map((slot) => (slot.supersetGroup === group ? { ...slot, supersetGroup: null } : slot)),
  };
}
