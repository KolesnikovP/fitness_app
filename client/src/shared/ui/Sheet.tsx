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
  /** A ✕ beside the title that closes it too. */
  closeButton?: boolean;
  children: ReactNode;
};

/**
 * A sheet that slides up from the bottom over a dimmed screen, with a title;
 * tapping the dimmed screen closes it, as does its ✕ if it has one.
 */
export function Sheet({ open, onClose, accessibilityLabel, title, closeButton, children }: SheetProps) {
  const styles = useStyles();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close" style={styles.backdrop} onPress={onClose} />
      <View accessibilityLabel={accessibilityLabel} style={styles.sheet}>
        <View style={styles.titleRow}>
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          {closeButton ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={onClose}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          ) : null}
        </View>
        {children}
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  backdrop: { flex: 1, backgroundColor: colors.backdrop },
  sheet: {
    gap: spacing.sm,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: colors.background,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xs },
  title: { flex: 1, fontSize: 20, fontWeight: '600', color: colors.text },
  close: { fontSize: 20, fontWeight: '600', color: colors.muted },
}));
