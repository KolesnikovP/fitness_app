import { View, StyleSheet } from 'react-native';

import { EQUIPMENT_TYPES, MUSCLE_GROUPS, type ExerciseFilters as Filters } from '@/entities/exercise';
import { ChipGroup, spacing, TextField } from '@/shared/ui';

type ExerciseFiltersProps = {
  filters: Filters;
  onChange: (filters: Filters) => void;
};

/** Search box plus optional muscle group and equipment filters. */
export function ExerciseFilters({ filters, onChange }: ExerciseFiltersProps) {
  return (
    <View style={styles.container}>
      <TextField
        label="Search exercises"
        placeholder="Name"
        value={filters.query}
        onChangeText={(query) => onChange({ ...filters, query })}
        autoCorrect={false}
        clearButtonMode="while-editing"
        returnKeyType="search"
      />
      <ChipGroup
        label="Muscle group"
        options={MUSCLE_GROUPS}
        value={filters.muscleGroup}
        onChange={(muscleGroup) => onChange({ ...filters, muscleGroup })}
        allowDeselect
      />
      <ChipGroup
        label="Equipment"
        options={EQUIPMENT_TYPES}
        value={filters.equipment}
        onChange={(equipment) => onChange({ ...filters, equipment })}
        allowDeselect
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
});
