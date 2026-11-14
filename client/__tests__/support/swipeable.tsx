import { fireEvent } from 'expo-router/testing-library';
import { type ReactNode, type Ref, useImperativeHandle, useState } from 'react';
import { View } from 'react-native';

type Methods = { close: () => void; openLeft: () => void; openRight: () => void; reset: () => void };

type FakeSwipeableProps = {
  ref?: Ref<Methods>;
  renderRightActions?: (progress: unknown, translation: unknown, methods: Methods) => ReactNode;
  children?: ReactNode;
};

/**
 * Stands in for gesture handler's ReanimatedSwipeable, whose pan runs on
 * Reanimated's UI thread, which Jest doesn't have. A row is swiped open with
 * swipeLeft; until then its right actions aren't on screen, as on a phone
 * they're hidden under the row.
 */
function FakeSwipeable({ ref, renderRightActions, children }: FakeSwipeableProps) {
  const [open, setOpen] = useState(false);
  const methods: Methods = {
    close: () => setOpen(false),
    openLeft: () => {},
    openRight: () => setOpen(true),
    reset: () => setOpen(false),
  };
  useImperativeHandle(ref, () => methods);
  // Not a real View prop: swipeLeft fires it, and it bubbles up from any element in the row.
  const swipeHandler = { onSwipeLeft: () => setOpen(true) } as object;
  return (
    <View {...swipeHandler}>
      {children}
      {open ? renderRightActions?.({ value: 1 }, { value: 0 }, methods) : null}
    </View>
  );
}

export const swipeableModule = { __esModule: true, default: FakeSwipeable };

/** Swipes left the row that element is in, showing what's under it, such as its Delete button. */
export async function swipeLeft(element: Parameters<typeof fireEvent>[0]) {
  await fireEvent(element, 'swipeLeft');
}
