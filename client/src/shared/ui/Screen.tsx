import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from './theme';

type ScreenProps = {
  title?: string;
  children: ReactNode;
  /** Center the content vertically, for short placeholder screens. */
  centered?: boolean;
  /** Pinned below the scrolling content, such as a message with an Undo button. */
  footer?: ReactNode;
};

export function Screen({ title, children, centered, footer }: ScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.content, centered && styles.centered]}
          keyboardShouldPersistTaps="handled"
        >
          {title ? (
            <Text accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
          ) : null}
          {children}
        </ScrollView>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: spacing.lg, gap: spacing.md },
  centered: { justifyContent: 'center' },
  footer: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  title: { fontSize: 32, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
});
