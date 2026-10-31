import { StyleSheet, Text, View } from 'react-native';

import { Button, colors, spacing } from '@/shared/ui';

/** Says a Set was deleted, with a button to undo it. */
export function SetDeletedBar({ onUndo }: { onUndo: () => void }) {
  return (
    <View accessibilityLiveRegion="polite" style={styles.bar}>
      <Text style={styles.text}>Set deleted.</Text>
      <Button label="Undo" variant="link" onPress={onUndo} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 10,
    backgroundColor: colors.text,
  },
  text: { fontSize: 15, color: colors.background },
});
