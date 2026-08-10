/**
 * AppThemeProvider (CFG.12): the bridge between the session store and the
 * design-system ThemeProvider. Feeds the root theme with the academy brand
 * (session verdict, AsyncStorage cold-start cache underneath) and the
 * persisted dark-mode preference; all three persona shells inherit it from
 * the root layout.
 */

import { useEffect, type ReactNode } from 'react';
import { ThemeProvider } from '@tatame/design-system/native';
import { useSession } from '../session/session-store';
import { applySessionBrand, useThemePreferences } from './theme-store';

export function AppThemeProvider({ children }: { children?: ReactNode }) {
  const session = useSession();
  const { brand, mode } = useThemePreferences();

  useEffect(() => {
    // Session verdicts only — while `booting` the hydrated cache paints.
    if (session.status === 'authed') {
      void applySessionBrand(session.session?.academy?.theme ?? null);
    } else if (session.status === 'anon') {
      // Logout / no session → default Tatame brand, cache cleared.
      void applySessionBrand(null);
    }
  }, [session]);

  return (
    <ThemeProvider brand={brand} mode={mode}>
      {children}
    </ThemeProvider>
  );
}
