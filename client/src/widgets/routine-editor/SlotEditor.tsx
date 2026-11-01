import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { REST_OPTIONS, setsInput, type SlotDraft } from '@/entities/routine';
import { formatRest, repsInput, weightInput } from '@/entities/workout';
import { Button, colors, Select, spacing, TextField } from '@/shared/ui';

const REST_SELECT_OPTIONS = REST_OPTIONS.map((seconds) => ({ value: seconds, label: formatRest(seconds) }));

type SlotEditorProps = {
  slot: SlotDraft;
  onChange: (patch: Partial<SlotDraft>) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
};

/**
 * One Exercise slot of a Routine being built: its Target (sets × reps at a
 * weight), an optional rest and note, and moving or removing it.
 */
export function SlotEditor({ slot, onChange, onMove, onRemove, canMoveUp, canMoveDown }: SlotEditorProps) {
  const [noteOpen, setNoteOpen] = useState(slot.note !== '');

  return (
    <View accessibilityLabel={`${slot.name} slot`} style={styles.card}>
      <Text style={styles.name}>{slot.name}</Text>
      <View style={styles.row}>
        <View style={styles.sets}>
          <TextField
            label="Sets"
            value={slot.sets}
            onChangeText={(text) => onChange({ sets: setsInput(text) })}
            keyboardType="number-pad"
            textAlign="center"
          />
        </View>
        <View style={styles.reps}>
          <TextField
            label="Reps"
            value={slot.reps}
            onChangeText={(text) => onChange({ reps: repsInput(text) })}
            keyboardType="number-pad"
            textAlign="center"
          />
        </View>
        <View style={styles.weight}>
          <TextField
            label={`Weight (${slot.weightUnit})`}
            value={slot.weight}
            onChangeText={(text) => onChange({ weight: weightInput(text) })}
            keyboardType="decimal-pad"
          />
        </View>
      </View>
      <View style={styles.rest}>
        <Select
          label="Rest"
          placeholder="None"
          options={REST_SELECT_OPTIONS}
          value={slot.restSeconds}
          onChange={(restSeconds) => onChange({ restSeconds })}
          clearLabel="No rest"
        />
      </View>
      {noteOpen ? (
        <TextField
          label="Note"
          placeholder="Optional"
          value={slot.note}
          onChangeText={(note) => onChange({ note })}
          maxLength={500}
        />
      ) : (
        <Button label="Add note" variant="link" onPress={() => setNoteOpen(true)} />
      )}
      <View style={styles.actions}>
        {canMoveUp ? <Button label="Move up" variant="link" onPress={() => onMove(-1)} /> : null}
        {canMoveDown ? <Button label="Move down" variant="link" onPress={() => onMove(1)} /> : null}
        <Button label="Remove" variant="link" onPress={onRemove} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  name: { fontSize: 20, fontWeight: '600', color: colors.text },
  row: { flexDirection: 'row', gap: spacing.sm },
  // Each number field is sized for the digits it holds.
  sets: { width: 64 },
  reps: { width: 76 },
  weight: { width: 120 },
  rest: { width: 120 },
  actions: { flexDirection: 'row', gap: spacing.md },
});
