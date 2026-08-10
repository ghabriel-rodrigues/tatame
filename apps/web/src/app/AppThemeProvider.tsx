/**
 * Session-driven branding (CFG.8, spec 011): rebuilds the whole theme stack
 * from the active session's academy brand — login, silent restore, membership
 * switch and impersonation all flow through the auth store, so one subscriber
 * covers every boundary. Plataforma sessions (`academy: null`) and logged-out
 * surfaces stay on the default Tatame brand. The invite flow keeps its own
 * scoped brand handling (InvitePage) — this provider only re-applies when the
 * session brand or mode actually changes, so it never clobbers it.
 *
 * One derivePalette() output feeds BOTH variable layers (ds-02): the Lumira
 * CSS vars via applyBrand and the MUI vars via createTatameTheme. Dark mode
 * (CFG.10) flips `data-theme` — both variable layers key off it — and swaps
 * the memoized MUI theme for the dark build.
 */
import { useEffect, useMemo, type ReactNode } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import {
  applyBrand,
  createTatameTheme,
  derivePalette,
  TATAME_DEFAULT_BRAND,
  type BrandInput,
} from '@tatame/design-system';
import { useAuth } from '../auth/auth-store';
import { useThemeState } from './theme-store';

function sessionBrand(theme: { deep: string; vibrant: string; accent: string } | null | undefined): BrandInput | null {
  if (!theme) return null;
  const { deep, vibrant, accent } = theme;
  return { deep, vibrant, accent };
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const { mode, preview } = useThemeState();

  // Preview (admin-15 live picker) > session academy brand > Tatame default.
  const brand = preview ?? sessionBrand(session?.academy?.theme) ?? TATAME_DEFAULT_BRAND;
  const brandKey = `${brand.deep}:${brand.vibrant}:${brand.accent}`;

  const { derived, theme } = useMemo(() => {
    const palette = derivePalette(brand, mode);
    return { derived: palette, theme: createTatameTheme(palette, mode) };
    // brandKey is the value identity of `brand` — object identity churns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandKey, mode]);

  useEffect(() => {
    applyBrand(derived);
    document.documentElement.setAttribute('data-theme', mode);
  }, [derived, mode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}

export default AppThemeProvider;
