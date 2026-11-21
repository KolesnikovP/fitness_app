import { Alert } from 'react-native';

/**
 * Asks how to end the workout in progress: Finish workout, Discard workout
 * (asking again first, since it deletes everything), or Keep logging. With
 * no onFinish, as before any Set is logged, it can only be discarded.
 */
export function askHowToEnd({ onFinish, onDiscard }: { onFinish?: () => void; onDiscard: () => void }) {
  Alert.alert(
    'End workout?',
    undefined,
    [
      ...(onFinish ? [{ text: 'Finish workout', onPress: onFinish }] : []),
      { text: 'Discard workout', style: 'destructive', onPress: () => confirmDiscard(onDiscard) },
      { text: 'Keep logging', style: 'cancel' },
    ],
    { cancelable: true },
  );
}

function confirmDiscard(onDiscard: () => void) {
  Alert.alert('Discard workout?', 'Everything logged in this workout will be deleted.', [
    { text: 'Keep logging', style: 'cancel' },
    { text: 'Discard', style: 'destructive', onPress: onDiscard },
  ]);
}
