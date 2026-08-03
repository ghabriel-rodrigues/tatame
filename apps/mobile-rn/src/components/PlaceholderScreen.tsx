/**
 * PlaceholderScreen (AUTH.20): empty-shell tab body — the feature content
 * arrives with its own slice.
 */

import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { Text, fadeUp, useTheme } from '@tatame/design-system/native';

export function PlaceholderScreen({ title }: { title: string }) {
  const theme = useTheme();
  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <View style={{ flex: 1, padding: theme.space['5'], paddingBottom: 130 }}>
        <Animated.View entering={fadeUp()} style={{ gap: theme.space['2'] }}>
          <Text variant="display">{title}</Text>
          <Text variant="caption">Esta área chega nas próximas fases.</Text>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}
