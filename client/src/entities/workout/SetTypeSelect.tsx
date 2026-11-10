import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View, type StyleProp, type TextStyle } from 'react-native';

import { Button, makeStyles, spacing } from '@/shared/ui';

import { SET_TYPES, setTypeLabel, type SetType } from './model';

type SetTypeSelectProps = {
  /** What the button and its sheet are called: "Set 2 type". */
  label: string;
  /** What marks the Set in its number column: its letter, or its number. */
  mark: string;
  value: SetType;
  onChange: (type: SetType) => void;
  disabled?: boolean;
  /**
   * A logged Set's mark is plain, like its values beside it, in their colour
   * (textStyle); one still to do is boxed like the fields beside it.
   */
  plain?: boolean;
  textStyle?: StyleProp<TextStyle>;
};

/**
 * A Set's mark in the number column of the set table, as a button that opens
 * a sheet of the Set types, each with what it means. A warm-up, failure or
 * drop Set's letter is in the type's colour.
 */
export function SetTypeSelect({ label, mark, value, onChange, disabled, plain, textStyle }: SetTypeSelectProps) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);

  function pick(type: SetType) {
    setOpen(false);
    if (type !== value) onChange(type);
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: setTypeLabel(value) }}
        accessibilityState={{ disabled: !!disabled }}
        disabled={disabled}
        hitSlop={8}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.mark, !plain && styles.boxed, pressed && styles.pressed]}
      >
        <Text
          style={[
            styles.markText,
            plain && [styles.plainText, textStyle],
            value !== 'normal' && [styles.letter, styles[value]],
          ]}
        >
          {mark}
        </Text>
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable accessibilityLabel={`Close ${label}`} style={styles.backdrop} onPress={() => setOpen(false)} />
        <View accessibilityLabel={`${label} options`} style={styles.sheet}>
          <Text accessibilityRole="header" style={styles.title}>
            Set type
          </Text>
          <ScrollView accessibilityRole="radiogroup">
            {SET_TYPES.map((option) => {
              const checked = option.type === value;
              return (
                <Pressable
                  key={option.type}
                  accessibilityRole="radio"
                  accessibilityLabel={option.label}
                  accessibilityHint={option.meaning}
                  accessibilityState={{ checked }}
                  onPress={() => pick(option.type)}
                  style={[styles.option, checked && styles.optionChecked]}
                >
                  <Text style={[styles.optionLetter, option.type !== 'normal' && styles[option.type]]}>
                    {option.letter ?? '1'}
                  </Text>
                  <View style={styles.optionText}>
                    <Text style={styles.optionLabel}>{option.label}</Text>
                    <Text style={styles.meaning}>{option.meaning}</Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
          <Button label="Cancel" variant="secondary" onPress={() => setOpen(false)} />
        </View>
      </Modal>
    </>
  );
}

const useStyles = makeStyles((colors) => ({
  mark: {
    // As big as the weight and reps fields beside it.
    minHeight: 40,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Boxed so the mark reads as something to tap.
  boxed: {
    borderWidth: 1,
    borderColor: colors.fieldBorder,
    borderRadius: 10,
    backgroundColor: colors.background,
  },
  pressed: { opacity: 0.5 },
  markText: { fontSize: 17, color: colors.muted, textAlign: 'center' },
  plainText: { color: colors.text },
  letter: { fontWeight: '800' },
  warmup: { color: colors.link },
  failure: { color: colors.danger },
  drop: { color: colors.dropSet },
  backdrop: { flex: 1, backgroundColor: colors.backdrop },
  sheet: {
    maxHeight: '70%',
    gap: spacing.sm,
    padding: spacing.md,
    paddingBottom: spacing.xl,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: colors.background,
  },
  title: { fontSize: 20, fontWeight: '600', color: colors.text },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.md,
    borderRadius: 10,
  },
  optionChecked: { backgroundColor: colors.primarySubtle },
  optionLetter: { width: 28, fontSize: 20, fontWeight: '800', color: colors.text, textAlign: 'center' },
  optionText: { flex: 1 },
  optionLabel: { fontSize: 17, fontWeight: '600', color: colors.text },
  meaning: { fontSize: 15, color: colors.muted },
}));
