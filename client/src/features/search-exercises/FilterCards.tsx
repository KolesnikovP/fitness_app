import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';

import { Button, colors, spacing } from '@/shared/ui';

const CARD_BACKGROUND = colors.feature;

type FilterCardButtonProps<T extends string> = {
  label: string;
  options: readonly { value: T; label: string }[];
  art: Partial<Record<T, ImageSourcePropType>>;
  value: T | null;
  onChange: (value: T | null) => void;
  /**
   * 'crop' fills the card's right side with a close crop, for body parts.
   * 'whole' fits the whole object in, for equipment.
   */
  artFit: 'crop' | 'whole';
};

/**
 * A single-choice filter shown as a button with the current choice. Pressing
 * it opens a sheet of dark cards, each with the option's name on the left and
 * its art on the right. Picking a card applies it and closes the sheet; picking
 * the selected card again clears it.
 */
export function FilterCardButton<T extends string>({
  label,
  options,
  art,
  value,
  onChange,
  artFit,
}: FilterCardButtonProps<T>) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value) ?? null;
  const shown = selected ? selected.label : 'Any';

  function pick(next: T | null) {
    onChange(next);
    setOpen(false);
  }

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: shown }}
        onPress={() => setOpen(true)}
        style={[styles.trigger, selected && styles.triggerActive]}
      >
        <View style={styles.triggerText}>
          <Text style={[styles.triggerLabel, selected && styles.triggerLabelActive]}>{label}</Text>
          <Text style={[styles.triggerValue, selected && styles.triggerValueActive]} numberOfLines={1}>
            {shown}
          </Text>
        </View>
        <Text style={[styles.chevron, selected && styles.triggerValueActive]}>▾</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable accessibilityLabel={`Close ${label}`} style={styles.backdrop} onPress={() => setOpen(false)} />
        <View style={styles.sheet}>
          <Text accessibilityRole="header" style={styles.title}>
            {label}
          </Text>
          <ScrollView>
            <View accessibilityRole="radiogroup" accessibilityLabel={`${label} options`} style={styles.list}>
              {options.map((option) => {
                const checked = option.value === value;
                const image = art[option.value];
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="radio"
                    accessibilityLabel={option.label}
                    accessibilityState={{ checked }}
                    onPress={() => pick(checked ? null : option.value)}
                    style={[styles.card, checked && styles.cardSelected]}
                  >
                    {image ? (
                      <Image
                        source={image}
                        style={artFit === 'crop' ? styles.artCropped : styles.artWhole}
                        resizeMode={artFit === 'crop' ? 'cover' : 'contain'}
                      />
                    ) : null}
                    <Text style={styles.cardText}>{option.label}</Text>
                    {checked ? <Text style={styles.check}>✓</Text> : null}
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
          {selected ? <Button label="Clear" variant="secondary" onPress={() => pick(null)} /> : null}
          <Button label="Cancel" variant="secondary" onPress={() => setOpen(false)} />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  trigger: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  triggerActive: { backgroundColor: CARD_BACKGROUND, borderColor: CARD_BACKGROUND },
  triggerText: { flex: 1 },
  triggerLabel: { fontSize: 13, color: colors.muted },
  triggerLabelActive: { color: colors.featureMuted },
  triggerValue: { fontSize: 17, fontWeight: '600', color: colors.text },
  triggerValueActive: { color: colors.featureText },
  chevron: { fontSize: 15, color: colors.muted },
  backdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.3)' },
  sheet: {
    maxHeight: '85%',
    gap: spacing.sm,
    padding: spacing.md,
    paddingBottom: spacing.xl,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: colors.background,
  },
  title: { fontSize: 20, fontWeight: '600', color: colors.text },
  list: { gap: spacing.sm },
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
  cardSelected: { borderColor: colors.primary },
  artCropped: { position: 'absolute', right: 0, top: 0, width: '62%', height: '100%' },
  artWhole: { position: 'absolute', right: 8, top: '12%', width: '55%', height: '76%' },
  cardText: { color: colors.featureText, fontSize: 18, fontWeight: '700', maxWidth: '45%' },
  check: { position: 'absolute', top: 8, left: 12, color: colors.primary, fontSize: 14, fontWeight: '800' },
});
