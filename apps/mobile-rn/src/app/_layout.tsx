/**
 * Root layout (rn-02/rn-04, AUTH.17-19): providers (DS Theme, QueryClient)
 * + the splash / silent-refresh gate + the role-gated root Stack.
 *
 * `Stack.Protected` guards make the three persona shells, the web-only
 * console screen, the suspended blocking screen and the public group
 * mutually exclusive on the resolved session gate — guard flips on
 * login/logout redirect automatically (expo-router removes protected
 * screens from the tree), so logout resets to login with no imperative
 * navigation.
 *
 * Splash choreography (AUTH.17): the SplashOverlay covers the tree while
 * the cold-start boot (secure-store refresh token -> silent refresh ->
 * /auth/me) runs, and for the handoff's ~1.9s minimum.
 */

import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, useTheme } from '@tatame/design-system/native';
import { SplashOverlay } from '../components/SplashOverlay';
import { queryClient } from '../session/api';
import { boot, resolveGate, useSession } from '../session/session-store';

/** Handoff auto-advance: splash holds ~1.9s minimum (aluno-01). */
export const SPLASH_MIN_MS = 1900;

function RootNavigator() {
  const theme = useTheme();
  const session = useSession();
  const gate = resolveGate(session);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        contentStyle: { backgroundColor: theme.color.bg.app },
      }}
    >
      <Stack.Protected guard={gate === 'login'}>
        <Stack.Screen name="(public)" />
      </Stack.Protected>
      <Stack.Protected guard={gate === 'aluno'}>
        <Stack.Screen name="(aluno)" />
      </Stack.Protected>
      <Stack.Protected guard={gate === 'professor'}>
        <Stack.Screen name="(professor)" />
      </Stack.Protected>
      <Stack.Protected guard={gate === 'responsavel'}>
        <Stack.Screen name="(responsavel)" />
      </Stack.Protected>
      <Stack.Protected guard={gate === 'console-only'}>
        <Stack.Screen name="console-only" />
      </Stack.Protected>
      <Stack.Protected guard={gate === 'suspended'}>
        <Stack.Screen name="suspended" />
      </Stack.Protected>
      {/* Dev-only DS gallery (DS.7) — reachable from any state by URL. */}
      <Stack.Screen name="ds-showcase" />
    </Stack>
  );
}

export default function RootLayout() {
  const session = useSession();
  const [minElapsed, setMinElapsed] = useState(false);

  useEffect(() => {
    void boot();
    const timer = setTimeout(() => setMinElapsed(true), SPLASH_MIN_MS);
    return () => clearTimeout(timer);
  }, []);

  const showSplash = session.status === 'booting' || !minElapsed;

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style={showSplash ? 'light' : 'dark'} />
        <RootNavigator />
        <SplashOverlay visible={showSplash} />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
