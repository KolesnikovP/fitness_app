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
import { ChipGroup, spacing, TextField } from '@/shared/ui';

import { FilterCardGroup } from './FilterCards';

type ExerciseSearchProps = {
  filters: ExerciseFilters;
  onChange: (filters: ExerciseFilters) => void;
  /**
   * 'chips' (default) keeps the filters compact; 'cards' shows each option as
   * a dark card with its art, for browsing the library.
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
          <FilterCardGroup
            label="Muscle group"
            options={MUSCLE_GROUPS}
            art={MUSCLE_GROUP_ART}
            value={filters.muscleGroup}
            onChange={setMuscleGroup}
            layout="list"
          />
          <FilterCardGroup
            label="Equipment"
            options={EQUIPMENT_TYPES}
            art={EQUIPMENT_ART}
            value={filters.equipmentType}
            onChange={setEquipmentType}
            layout="row"
          />
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
});
