import { View, StyleSheet } from 'react-native';

import {
  EQUIPMENT_ART,
  EQUIPMENT_TYPES,
  MUSCLE_GROUP_ART,
  MUSCLE_GROUPS,
  type EquipmentType,
  type ExerciseFilters,
  type MuscleGroup,
} from '@/entities/exercise';
import { Button, ChipGroup, spacing, TextField } from '@/shared/ui';

import { FilterCardButton } from './FilterCards';

type ExerciseSearchProps = {
  filters: ExerciseFilters;
  onChange: (filters: ExerciseFilters) => void;
  /**
   * 'chips' (default) shows the options inline; 'cards' shows a button per
   * filter that opens a sheet of art cards, for browsing the library.
   */
  appearance?: 'chips' | 'cards';
};

/** Search box plus optional muscle group and equipment type filters. */
export function ExerciseSearch({ filters, onChange, appearance = 'chips' }: ExerciseSearchProps) {
  const setMuscleGroup = (muscleGroup: MuscleGroup | null) => onChange({ ...filters, muscleGroup });
  const setEquipmentType = (equipmentType: EquipmentType | null) => onChange({ ...filters, equipmentType });
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
      {appearance === 'cards' ? (
        <>
          <View style={styles.filterRow}>
            <FilterCardButton
              label="Muscle group"
              options={MUSCLE_GROUPS}
              art={MUSCLE_GROUP_ART}
              value={filters.muscleGroup}
              onChange={setMuscleGroup}
              artFit="crop"
            />
            <FilterCardButton
              label="Equipment"
              options={EQUIPMENT_TYPES}
              art={EQUIPMENT_ART}
              value={filters.equipmentType}
              onChange={setEquipmentType}
              artFit="whole"
            />
          </View>
          {filters.muscleGroup || filters.equipmentType ? (
            <Button
              label="Clear filters"
              variant="link"
              onPress={() => onChange({ ...filters, muscleGroup: null, equipmentType: null })}
            />
          ) : null}
        </>
      ) : (
        <>
          <ChipGroup
            label="Muscle group"
            options={MUSCLE_GROUPS}
            value={filters.muscleGroup}
            onChange={setMuscleGroup}
            allowDeselect
          />
          <ChipGroup
            label="Equipment"
            options={EQUIPMENT_TYPES}
            value={filters.equipmentType}
            onChange={setEquipmentType}
            allowDeselect
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  filterRow: { flexDirection: 'row', gap: spacing.sm },
});
