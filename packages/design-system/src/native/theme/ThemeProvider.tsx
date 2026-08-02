/**
 * RN theming runtime (rn-03 / DS.7): React context around `createTheme()`.
 *
 * The academy 3-color brand arrives after login (session/whoami payload,
 * rn-04); mode is light for now — the dark set is wired but the toggle ships
 * with the Aluno profile feature. Styles are theme-taking factories consumed
 * through `useTheme()` — no CSS-in-JS runtime (rn-03 ruling).
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { BrandInput, Mode } from '../../theme/derive-palette.ts';
import { createTheme, type Theme } from './theme.ts';

const ThemeContext = createContext<Theme | null>(null);

export interface ThemeProviderProps {
  /** Academy white-label brand; omit for the default Tatame (Lumira) brand. */
  brand?: BrandInput | null;
  mode?: Mode;
  children?: ReactNode;
}

export function ThemeProvider({ brand = null, mode = 'light', children }: ThemeProviderProps) {
  const theme = useMemo(
    () => createTheme({ brand, mode }),
    // Re-derive only when the actual brand colors or mode change.
    [brand?.deep, brand?.vibrant, brand?.accent, mode],
  );
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

let defaultTheme: Theme | null = null;

/**
 * Resolve the active theme. Outside a provider it falls back to the static
 * Lumira light theme (memoized) so isolated components/tests still render.
 */
export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (ctx) return ctx;
  defaultTheme ??= createTheme();
  return defaultTheme;
}
