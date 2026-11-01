import type { ExerciseRef } from '@/entities/exercise';
import { parseReps, parseWeight, type WeightUnit } from '@/entities/workout';

/** The most Substitutes a slot can plan. */
export const MAX_SUBSTITUTES = 10;

/**
 * One Exercise slot of a Routine: the Exercise and its Target. targetWeight
 * is in weightUnit, and 0 until the User knows what to start with (or for a
 * bodyweight exercise). restSeconds is null when no rest is planned. Slots
 * sharing a supersetGroup are a planned Superset. substitutes are the
 * Exercises, in order, the User can swap this one for in a workout.
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
  substitutes: ExerciseRef[];
};

/** A saved Routine, its slots in order. */
export type Routine = { id: string; name: string; updatedAt: string; slots: RoutineSlot[] };

/** A Routine as the list of them shows it. */
export type RoutineSummary = { id: string; name: string; updatedAt: string; exerciseNames: string[] };

/** A Routine to save, as the API takes it. */
export type RoutineInput = {
  name: string;
  slots: (Omit<RoutineSlot, 'id' | 'name' | 'substitutes'> & { substituteIds: string[] })[];
};

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
  substitutes: ExerciseRef[];
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
      // 0 is no weight yet: shown blank, as it was left.
      weight: slot.targetWeight === 0 ? '' : String(slot.targetWeight),
      weightUnit: slot.weightUnit,
      restSeconds: slot.restSeconds,
      note: slot.note,
      supersetGroup: slot.supersetGroup,
      substitutes: slot.substitutes,
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

/**
 * The Routine a draft describes, or null while it has no name, no slots or an
 * incomplete slot. A blank weight is 0: not known yet.
 */
export function parseRoutineDraft(draft: RoutineDraft): RoutineInput | null {
  const name = draft.name.trim();
  if (name === '' || draft.slots.length === 0) return null;
  const slots: RoutineInput['slots'] = [];
  for (const slot of draft.slots) {
    const targetSets = parseSets(slot.sets);
    const targetReps = parseReps(slot.reps);
    const targetWeight = slot.weight.trim() === '' ? 0 : parseWeight(slot.weight);
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
      substituteIds: slot.substitutes.map((sub) => sub.exerciseId),
    });
  }
  return { name, slots };
}

/** The draft with a slot for exercise added at the end: 3 × 10, with the weight blank. */
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
    substitutes: [],
  };
  return { ...draft, slots: [...draft.slots, slot] };
}

/** Whether a slot has no target weight yet, so the User is asked for one when starting the Routine. */
export function needsStartingWeight(slot: RoutineSlot): boolean {
  return slot.targetWeight === 0;
}

/** The Routine as it's saved, with the weights in startingWeights (by slot id) filled in. */
export function withStartingWeights(routine: Routine, startingWeights: Record<string, number>): RoutineInput {
  return {
    name: routine.name,
    slots: routine.slots.map(({ id, name: _name, substitutes, ...slot }) => ({
      ...slot,
      targetWeight: startingWeights[id] ?? slot.targetWeight,
      substituteIds: substitutes.map((sub) => sub.exerciseId),
    })),
  };
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

/** Whether exerciseId can be added as a Substitute for slot: not its own, nor one already, nor past the most. */
export function canAddSubstitute(slot: SlotDraft, exerciseId: string): boolean {
  return (
    exerciseId !== slot.exerciseId &&
    !slot.substitutes.some((sub) => sub.exerciseId === exerciseId) &&
    slot.substitutes.length < MAX_SUBSTITUTES
  );
}

/** The slot's Substitutes with exercise added last, unless it can't be added. */
export function withSubstituteAdded(slot: SlotDraft, exercise: ExerciseRef): ExerciseRef[] {
  return canAddSubstitute(slot, exercise.exerciseId) ? [...slot.substitutes, exercise] : slot.substitutes;
}

/** The slot's Substitutes without exerciseId. */
export function withSubstituteRemoved(slot: SlotDraft, exerciseId: string): ExerciseRef[] {
  return slot.substitutes.filter((sub) => sub.exerciseId !== exerciseId);
}

/** The slot's Substitutes with exerciseId moved one place up (-1) or down (1). */
export function withSubstituteMoved(slot: SlotDraft, exerciseId: string, direction: -1 | 1): ExerciseRef[] {
  const subs = [...slot.substitutes];
  const from = subs.findIndex((sub) => sub.exerciseId === exerciseId);
  const to = from + direction;
  if (from === -1 || to < 0 || to >= subs.length) return slot.substitutes;
  [subs[from], subs[to]] = [subs[to], subs[from]];
  return subs;
}
