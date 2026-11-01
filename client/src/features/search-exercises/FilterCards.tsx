import { Image, Pressable, ScrollView, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';

import { colors, spacing } from '@/shared/ui';

const CARD_BACKGROUND = '#0B2540';
const ROW_CARD_WIDTH = 240;

type FilterCardGroupProps<T extends string> = {
  label: string;
  options: readonly { value: T; label: string }[];
  art: Partial<Record<T, ImageSourcePropType>>;
  value: T | null;
  onChange: (value: T | null) => void;
  /**
   * 'list' stacks full-width cards with the art cropped close, for body parts.
   * 'row' scrolls sideways with the whole object shown, for equipment.
   */
  layout: 'list' | 'row';
};

/**
 * A labelled single-choice filter shown as dark cards: the option's name on
 * the left, its art on the right. A second tap on the selected card clears it.
 */
export function FilterCardGroup<T extends string>({
  label,
  options,
  art,
  value,
  onChange,
  layout,
}: FilterCardGroupProps<T>) {
  const cards = options.map((option) => {
    const selected = option.value === value;
    const image = art[option.value];
    return (
      <Pressable
        key={option.value}
        accessibilityRole="radio"
        accessibilityLabel={option.label}
        accessibilityState={{ checked: selected }}
        onPress={() => onChange(selected ? null : option.value)}
        style={[styles.card, layout === 'row' && styles.rowCard, selected && styles.cardSelected]}
      >
        {image ? (
          <Image
            source={image}
            style={layout === 'list' ? styles.artCropped : styles.artWhole}
            resizeMode={layout === 'list' ? 'cover' : 'contain'}
          />
        ) : null}
        <Text style={styles.cardText}>{option.label}</Text>
        {selected ? <Text style={styles.check}>✓</Text> : null}
      </Pressable>
    );
  });

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      {layout === 'list' ? (
        <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.list}>
          {cards}
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.row}>
            {cards}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  label: { fontSize: 15, fontWeight: '500', color: colors.text },
  list: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  card: {
    height: 104,
    borderRadius: 12,
    backgroundColor: CARD_BACKGROUND,
    overflow: 'hidden',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  rowCard: { width: ROW_CARD_WIDTH },
  cardSelected: { borderColor: colors.primary },
  artCropped: { position: 'absolute', right: 0, top: 0, width: '62%', height: '100%' },
  artWhole: { position: 'absolute', right: 8, top: '12%', width: '55%', height: '76%' },
  cardText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', maxWidth: '45%' },
  check: { position: 'absolute', top: 8, left: 12, color: colors.primary, fontSize: 14, fontWeight: '800' },
});
