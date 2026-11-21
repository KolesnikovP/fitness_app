import { Alert } from 'react-native';

/** Answers the next Alert by pressing its button labelled label, and returns the spy on Alert.alert. */
export function answerAlertWith(label: string) {
  return jest.spyOn(Alert, 'alert').mockImplementationOnce((_title, _message, buttons) => {
    buttons?.find((b) => b.text === label)?.onPress?.();
  });
}
