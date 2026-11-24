import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, makeStyles, spacing } from '@/shared/ui';

import { ExerciseCheckList, toggled } from './ExerciseCheckList';

type SupersetPickerProps = {
  /** The exercises not yet in a Superset, in order. */
  exercises: { id: string; name: string }[];
  /** Called with the picked ids, in the order the exercises are listed. */
  onGroup: (ids: string[]) => void;
  onCancel: () => void;
  saving?: boolean;
  error?: string | null;
};

/** Picks two or more exercises to group into a Superset. */
export function SupersetPicker({ exercises, onGroup, onCancel, saving, error }: SupersetPickerProps) {
  const styles = useStyles();
  const [selected, setSelected] = useState<string[]>([]);

  return (
    <View accessibilityLabel="New superset" style={styles.container}>
      <Text style={styles.title}>New superset</Text>
      <Text style={styles.muted}>Pick two or more exercises to do back to back, resting after the last.</Text>
      <ExerciseCheckList
        exercises={exercises}
        selected={selected}
        onToggle={(id) => setSelected((current) => toggled(current, id))}
      />
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <Button
        label="Group as superset"
        // In list order, whatever order they were picked in.
        onPress={() => onGroup(exercises.map((e) => e.id).filter((id) => selected.includes(id)))}
        loading={saving}
        disabled={selected.length < 2}
      />
      <Button label="Cancel" variant="secondary" onPress={onCancel} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  title: { fontSize: 20, fontWeight: '600', color: colors.text },
  muted: { fontSize: 15, color: colors.muted },
  error: { color: colors.danger, fontSize: 15 },
}));
