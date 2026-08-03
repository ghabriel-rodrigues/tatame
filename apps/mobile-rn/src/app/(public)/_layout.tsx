/**
 * (public) group layout (rn-02): anonymous stack — login + the
 * "Esqueci minha senha" stub. Guarded by the root layout (`gate === 'login'`).
 */

import { Stack } from 'expo-router';
import { useTheme } from '@tatame/design-system/native';

export const unstable_settings = {
  initialRouteName: 'login',
};

export default function PublicLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        contentStyle: { backgroundColor: theme.color.bg.app },
      }}
    >
      <Stack.Screen name="login" />
      <Stack.Screen name="forgot-password" />
    </Stack>
  );
}
