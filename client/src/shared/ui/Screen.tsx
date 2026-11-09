import { Stack } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { spacing } from './theme';
import { makeStyles } from './ThemeProvider';

type ScreenProps = TitleProps & {
  children: ReactNode;
  /** Center the content vertically, for short placeholder screens. */
  centered?: boolean;
  /** Pinned below the scrolling content, such as a message with an Undo button. */
  footer?: ReactNode;
};

/**
 * A screen pushed onto a stack, under its top bar and back button, takes `headerTitle`, shown in the
 * top bar. A screen with no top bar (a tab's first screen, or one shown on its own) takes `title`,
 * drawn at the top of the content.
 */
type TitleProps = { title?: string; headerTitle?: never } | { headerTitle: string; title?: never };

export function Screen({ title, headerTitle, children, centered, footer }: ScreenProps) {
  const styles = useStyles();
  // Stack.Screen re-applies its options whenever it gets a new object, so keep one per title.
  const headerOptions = useMemo(() => ({ title: headerTitle }), [headerTitle]);
  return (
    // Under a top bar, the bar already clears the status bar, so the top edge would add a gap. Not a
    // large title (headerLargeTitleEnabled): with this layout iOS loops on layout and freezes the app
    // when the screen is pushed from one without a top bar, or slides the content under the bar.
    <SafeAreaView style={styles.safeArea} edges={headerTitle !== undefined ? ['left', 'right', 'bottom'] : undefined}>
      {headerTitle !== undefined ? <Stack.Screen options={headerOptions} /> : null}
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

const useStyles = makeStyles((colors) => ({
  safeArea: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: spacing.lg, gap: spacing.md },
  centered: { justifyContent: 'center' },
  footer: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  title: { fontSize: 32, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
}));
