// Routine entity: Routine types, editing a draft, and API bindings
export {
  emptyRoutineDraft,
  MAX_TARGET_SETS,
  parseRoutineDraft,
  parseSets,
  REST_OPTIONS,
  routineDraftOf,
  setsInput,
  slotBlocks,
  withBlockMoved,
  withoutSuperset,
  withSlotAdded,
  withSlotChanged,
  withSlotRemoved,
  withSuperset,
  type Routine,
  type RoutineDraft,
  type RoutineInput,
  type RoutineSlot,
  type RoutineSummary,
  type SlotBlock,
  type SlotDraft,
} from './model';
export { createRoutine, deleteRoutine, getRoutine, listRoutines, updateRoutine } from './api';
export { RoutineSummaryItem } from './RoutineSummaryItem';
