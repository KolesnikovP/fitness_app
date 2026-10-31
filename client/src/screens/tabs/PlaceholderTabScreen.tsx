import { StyleSheet, Text } from 'react-native';

import { colors, Screen } from '@/shared/ui';

function PlaceholderTabScreen({ title, comingIn }: { title: string; comingIn: string }) {
  return (
    <Screen title={title}>
      <Text style={styles.body}>Coming in {comingIn}.</Text>
    </Screen>
  );
}

export const FeedScreen = () => <PlaceholderTabScreen title="Feed" comingIn="#9" />;

const styles = StyleSheet.create({
  body: { fontSize: 17, color: colors.muted },
});
