/**
 * Theme preference store (CFG.12/13): cold-start hydration from the
 * AsyncStorage cache, session brand apply/clear (cache write-through) and
 * the persisted mode flip.
 */

import * as AsyncStorageModule from '@react-native-async-storage/async-storage';
import { renderHook } from '@testing-library/react-native';
import { READY_MADE_PALETTES } from '@tatame/design-system/native';
import {
  BRAND_CACHE_KEY,
  THEME_MODE_KEY,
  applySessionBrand,
  hydrateTheme,
  setThemeMode,
  themeTestApi,
  useThemePreferences,
} from '../../src/theme/theme-store';

const storage = AsyncStorageModule as unknown as {
  __store: Map<string, string>;
  __reset: () => void;
  __setFailAll: (value: boolean) => void;
};

/** In-memory snapshot through the store's public hook. */
function snapshot() {
  const { result, unmount } = renderHook(() => useThemePreferences());
  const value = result.current;
  unmount();
  return value;
}

const navy = READY_MADE_PALETTES.navy;

describe('theme-store', () => {
  beforeEach(() => {
    storage.__reset();
    themeTestApi.reset();
  });

  it('defaults to light mode and the default Tatame brand', () => {
    expect(snapshot()).toEqual({ mode: 'light', brand: null });
  });

  it('hydrates the cached brand and persisted dark mode (cold start)', async () => {
    storage.__store.set(BRAND_CACHE_KEY, JSON.stringify(navy));
    storage.__store.set(THEME_MODE_KEY, 'dark');
    await hydrateTheme();
    expect(snapshot()).toEqual({ mode: 'dark', brand: navy });
  });

  it('ignores a corrupt cache, a partial triplet and an unknown mode', async () => {
    storage.__store.set(BRAND_CACHE_KEY, '{not json');
    storage.__store.set(THEME_MODE_KEY, 'sepia');
    await hydrateTheme();
    expect(snapshot()).toEqual({ mode: 'light', brand: null });

    storage.__store.set(BRAND_CACHE_KEY, JSON.stringify({ deep: '#14213D' }));
    await hydrateTheme();
    expect(snapshot().brand).toBeNull();
  });

  it('survives unreadable storage with the defaults', async () => {
    storage.__setFailAll(true);
    await expect(hydrateTheme()).resolves.toBeUndefined();
    expect(snapshot()).toEqual({ mode: 'light', brand: null });
  });

  it('applySessionBrand applies + caches; null clears brand and cache', async () => {
    await applySessionBrand(navy);
    expect(snapshot().brand).toEqual(navy);
    expect(JSON.parse(storage.__store.get(BRAND_CACHE_KEY)!)).toEqual(navy);

    // Logout / unbranded academy: default brand, cache gone.
    await applySessionBrand(null);
    expect(snapshot().brand).toBeNull();
    expect(storage.__store.has(BRAND_CACHE_KEY)).toBe(false);
  });

  it('a session verdict beats a slower cache hydration (no stale brand)', async () => {
    storage.__store.set(BRAND_CACHE_KEY, JSON.stringify(navy));
    await applySessionBrand(null); // anon verdict lands first
    await hydrateTheme(); // late hydration must not resurrect the cache
    expect(snapshot().brand).toBeNull();
  });

  it('setThemeMode flips and persists the preference', async () => {
    await setThemeMode('dark');
    expect(snapshot().mode).toBe('dark');
    expect(storage.__store.get(THEME_MODE_KEY)).toBe('dark');

    await setThemeMode('light');
    expect(snapshot().mode).toBe('light');
    expect(storage.__store.get(THEME_MODE_KEY)).toBe('light');
  });
});
