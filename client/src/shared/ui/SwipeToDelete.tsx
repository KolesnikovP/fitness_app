import type { ReactNode } from 'react';
import { Pressable, Text } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import { makeStyles } from './ThemeProvider';

type SwipeToDeleteProps = {
  /** What a screen reader calls the Delete button, such as "Delete set 2". */
  deleteLabel: string;
  onDelete: () => void;
  children: ReactNode;
};

/**
 * A row that, swiped left, shows a red Delete button behind it. Chosen by
 * prototype (branch prototype/delete-set-rows, variant A).
 */
export function SwipeToDelete({ deleteLabel, onDelete, children }: SwipeToDeleteProps) {
  const styles = useStyles();
  return (
    <ReanimatedSwipeable
      friction={1.5}
      rightThreshold={40}
      overshootRight={false}
      childrenContainerStyle={styles.front}
      renderRightActions={(_progress, _translation, swipeable) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={deleteLabel}
          onPress={() => {
            swipeable.close();
            onDelete();
          }}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <Text style={styles.actionText}>Delete</Text>
        </Pressable>
      )}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

const useStyles = makeStyles((colors) => ({
  // The row covers the button until swiped.
  front: { backgroundColor: colors.card },
  action: {
    width: 88,
    marginLeft: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.danger,
  },
  pressed: { opacity: 0.7 },
  actionText: { fontSize: 15, fontWeight: '700', color: colors.dangerText },
}));
