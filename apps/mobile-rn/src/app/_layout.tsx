/**
 * Root layout (rn-02): providers + root Stack.
 *
 * DS.7 scope: DS ThemeProvider (default Tatame brand, light mode) around a
 * plain Stack. The role-gated persona shells, session gate and splash
 * choreography land with AUTH.17+ (rn-02/rn-04).
 */

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider, useTheme } from '@tatame/design-system/native';

function RootStack() {
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

export default function RootLayout() {
  return (
    <ThemeProvider>
      <StatusBar style="dark" />
      <RootStack />
    </ThemeProvider>
  );
}
