import type { ReactNode } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import { spacing } from './theme';
import { makeStyles } from './ThemeProvider';

type SheetProps = {
  open: boolean;
  onClose: () => void;
  /** What a screen reader calls the sheet. */
  accessibilityLabel: string;
  title: string;
  children: ReactNode;
};

/**
 * A sheet that slides up from the bottom over a dimmed screen, with a title;
 * tapping the dimmed screen closes it.
 */
export function Sheet({ open, onClose, accessibilityLabel, title, children }: SheetProps) {
  const styles = useStyles();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close" style={styles.backdrop} onPress={onClose} />
      <View accessibilityLabel={accessibilityLabel} style={styles.sheet}>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {children}
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  backdrop: { flex: 1, backgroundColor: colors.backdrop },
  sheet: {
    gap: spacing.sm,
    padding: spacing.md,
    paddingBottom: spacing.xl,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: colors.background,
  },
  title: { fontSize: 20, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
}));
