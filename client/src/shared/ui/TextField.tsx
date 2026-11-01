import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { colors, spacing } from './theme';

type TextFieldProps = Omit<TextInputProps, 'style'> & {
  label: string;
  /** For a table cell: the label only for screen readers (a column header shows it), less padding, centred. */
  dense?: boolean;
};

export function TextField({ label, dense, ...inputProps }: TextFieldProps) {
  return (
    <View style={styles.container}>
      {dense ? null : <Text style={styles.label}>{label}</Text>}
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        keyboardAppearance={colors.dark ? 'dark' : 'light'}
        style={[styles.input, dense && styles.dense]}
        textAlign={dense ? 'center' : undefined}
        {...inputProps}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  label: { fontSize: 15, fontWeight: '500', color: colors.text },
  input: {
    minHeight: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    fontSize: 17,
    color: colors.text,
  },
  dense: { minHeight: 40, paddingHorizontal: spacing.xs },
});
