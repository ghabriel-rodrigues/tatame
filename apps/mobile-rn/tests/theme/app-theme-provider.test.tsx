/**
 * AppThemeProvider (CFG.12): the session academy brand feeds the DS theme
 * context (derivePalette semantics), the AsyncStorage cache paints the
 * cold start, and logout resets to the default Tatame brand + clears the
 * cache. Asserted through `useTheme()` — the public theming contract.
 */

import { Text } from 'react-native';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import * as AsyncStorageModule from '@react-native-async-storage/async-storage';
import { READY_MADE_PALETTES, derivePalette, useTheme } from '@tatame/design-system/native';
import { AppThemeProvider } from '../../src/theme/AppThemeProvider';
import { BRAND_CACHE_KEY, hydrateTheme, themeTestApi } from '../../src/theme/theme-store';
import { sessionTestApi } from '../../src/session/session-store';
import { makeMe } from '../helpers/session';

const storage = AsyncStorageModule as unknown as {
  __store: Map<string, string>;
  __reset: () => void;
};

const navy = READY_MADE_PALETTES.navy;
const NAVY_BRAND_2 = derivePalette(navy, 'light')['purple-500'];
const DEFAULT_BRAND_2 = '#8B3DEB';

/** Probe rendering the resolved theme facts from the context. */
function ThemeProbe() {
  const theme = useTheme();
  return <Text testID="theme-probe">{`${theme.mode}:${theme.color.brand['2']}`}</Text>;
}

function probeText(): string {
  const node = screen.getByTestId('theme-probe');
  return (node.props as { children: string }).children;
}

describe('AppThemeProvider', () => {
  beforeEach(() => {
    storage.__reset();
    themeTestApi.reset();
    sessionTestApi.reset();
  });

  it('applies the session academy brand to the theme context and caches it', async () => {
    sessionTestApi.seed({ status: 'authed', session: makeMe({ theme: navy }) });
    render(
      <AppThemeProvider>
        <ThemeProbe />
      </AppThemeProvider>,
    );
    await waitFor(() => expect(probeText()).toBe(`light:${NAVY_BRAND_2}`));
    expect(JSON.parse(storage.__store.get(BRAND_CACHE_KEY)!)).toEqual(navy);
  });

  it('an unbranded academy renders the default Tatame brand', async () => {
    sessionTestApi.seed({ status: 'authed', session: makeMe() });
    render(
      <AppThemeProvider>
        <ThemeProbe />
      </AppThemeProvider>,
    );
    await waitFor(() => expect(probeText()).toBe(`light:${DEFAULT_BRAND_2}`));
  });

  it('cold start paints the cached brand before the session resolves', async () => {
    storage.__store.set(BRAND_CACHE_KEY, JSON.stringify(navy));
    sessionTestApi.seed({ status: 'booting', session: null }, null);
    await hydrateTheme();
    render(
      <AppThemeProvider>
        <ThemeProbe />
      </AppThemeProvider>,
    );
    // Still booting — no session verdict, the cache is the brand.
    expect(probeText()).toBe(`light:${NAVY_BRAND_2}`);
  });

  it('logout resets to the default brand and clears the cache', async () => {
    sessionTestApi.seed({ status: 'authed', session: makeMe({ theme: navy }) });
    render(
      <AppThemeProvider>
        <ThemeProbe />
      </AppThemeProvider>,
    );
    await waitFor(() => expect(probeText()).toBe(`light:${NAVY_BRAND_2}`));

    act(() => {
      sessionTestApi.seed({ status: 'anon', session: null }, null);
    });
    await waitFor(() => expect(probeText()).toBe(`light:${DEFAULT_BRAND_2}`));
    await waitFor(() => expect(storage.__store.has(BRAND_CACHE_KEY)).toBe(false));
  });
});
