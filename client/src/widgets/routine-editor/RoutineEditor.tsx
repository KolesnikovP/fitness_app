import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/entities/auth';
import {
  parseRoutineDraft,
  slotBlocks,
  withBlockMoved,
  withoutSuperset,
  withSlotAdded,
  withSlotChanged,
  withSlotRemoved,
  withSuperset,
  type RoutineDraft,
  type RoutineInput,
  type SlotDraft,
} from '@/entities/routine';
import { ExercisePicker } from '@/features/search-exercises';
import { SupersetPicker } from '@/features/superset';
import { errorMessage } from '@/shared/api';
import { Button, colors, spacing, TextField } from '@/shared/ui';
import { listNames } from '@/shared/utils';

import { SlotEditor } from './SlotEditor';

type RoutineEditorProps = {
  initial: RoutineDraft;
  /** Saves the Routine. A thrown error is shown, and the draft kept. */
  onSave: (routine: RoutineInput) => Promise<void>;
};

/**
 * Builds or edits a Routine: its name, and its Exercise slots in order, each
 * with a Target, optional rest and note, and Supersets of them.
 */
export function RoutineEditor({ initial, onSave }: RoutineEditorProps) {
  const { state } = useAuth();
  const unit = state.status === 'signedIn' ? (state.me.unitPreference ?? 'kg') : 'kg';
  const [draft, setDraft] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [grouping, setGrouping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const routine = parseRoutineDraft(draft);
  const blocks = slotBlocks(draft.slots);
  const ungrouped = draft.slots.filter((slot) => slot.supersetGroup === null);

  async function save() {
    if (!routine) return;
    setError(null);
    setSaving(true);
    try {
      await onSave(routine);
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  }

  function slotEditor(slot: SlotDraft, blockIndex: number) {
    return (
      <SlotEditor
        key={slot.key}
        slot={slot}
        onChange={(patch) => setDraft((d) => withSlotChanged(d, slot.key, patch))}
        onMove={(direction) => setDraft((d) => withBlockMoved(d, slot.key, direction))}
        onRemove={() => setDraft((d) => withSlotRemoved(d, slot.key))}
        canMoveUp={blockIndex > 0}
        canMoveDown={blockIndex < blocks.length - 1}
      />
    );
  }

  return (
    <View style={styles.container}>
      <TextField
        label="Routine name"
        placeholder="Push day"
        value={draft.name}
        onChangeText={(name) => setDraft((d) => ({ ...d, name }))}
        maxLength={100}
      />
      {blocks.map((block, i) =>
        block.kind === 'slot' ? (
          slotEditor(block.slot, i)
        ) : (
          <View
            key={`superset-${block.group}`}
            accessibilityLabel={`Superset of ${listNames(block.slots.map((s) => s.name))}`}
            style={styles.superset}
          >
            <Text style={styles.supersetLabel}>Superset</Text>
            {block.slots.map((slot) => slotEditor(slot, i))}
            <Button
              label="Ungroup"
              variant="secondary"
              onPress={() => setDraft((d) => withoutSuperset(d, block.group))}
            />
          </View>
        ),
      )}
      {grouping ? (
        <SupersetPicker
          exercises={ungrouped.map((slot) => ({ id: slot.key, name: slot.name }))}
          onGroup={(keys) => {
            setDraft((d) => withSuperset(d, keys));
            setGrouping(false);
          }}
          onCancel={() => setGrouping(false)}
        />
      ) : ungrouped.length >= 2 ? (
        <Button label="Create superset" variant="secondary" onPress={() => setGrouping(true)} />
      ) : null}
      {adding ? (
        <>
          <ExercisePicker
            onPick={(exercise) => {
              setDraft((d) => withSlotAdded(d, exercise, unit));
              setAdding(false);
            }}
          />
          <Button label="Cancel" variant="secondary" onPress={() => setAdding(false)} />
        </>
      ) : (
        <Button label="Add exercise" variant="secondary" onPress={() => setAdding(true)} />
      )}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <Button label="Save routine" onPress={save} loading={saving} disabled={!routine} />
      {draft.slots.length > 0 && !routine ? (
        <Text style={styles.muted}>Give the routine a name, and each exercise its sets, reps and weight.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  superset: {
    gap: spacing.sm,
    paddingLeft: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  supersetLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.primary,
  },
  error: { color: colors.danger, fontSize: 15 },
  muted: { fontSize: 15, color: colors.muted },
});
