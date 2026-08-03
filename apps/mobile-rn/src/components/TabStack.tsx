/**
 * TabStack (rn-02 §2): the per-tab nested Stack every tab route group uses
 * as its `_layout` — per-tab history for the stacked detail views. Fade
 * transitions; content entrance motion is per-screen (`fadeUp`).
 */

import { Stack } from 'expo-router';
import { useTheme } from '@tatame/design-system/native';

export function TabStack() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        contentStyle: { backgroundColor: theme.color.bg.app },
      }}
    />
  );
}

export default TabStack;
