import { Pressable, Text, View } from 'react-native';

import type { ChipOption } from './ChipGroup';
import { spacing } from './theme';
import { makeStyles } from './ThemeProvider';

type SegmentedControlProps<T extends string> = {
  /** What the segments switch between, for screen readers. */
  label: string;
  options: readonly ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
};

/** A row of tabs, one always selected, that switches what's shown below it. */
export function SegmentedControl<T extends string>({ label, options, value, onChange }: SegmentedControlProps<T>) {
  const styles = useStyles();
  return (
    <View accessibilityRole="tablist" accessibilityLabel={label} style={styles.track}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  track: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: 10, padding: 2 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: 8 },
  segmentSelected: { backgroundColor: colors.background },
  label: { fontSize: 15, color: colors.muted },
  labelSelected: { fontWeight: '600', color: colors.text },
}));
