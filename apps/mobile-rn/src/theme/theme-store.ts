/**
 * Theme preference store (CFG.12/13, spec 011): module singleton (mirrors
 * session-store) holding the two client-side theming facts —
 *
 * - `brand`: the academy 3-color white-label brand. Sourced from the
 *   session (`academy.theme`) while authed; AsyncStorage-cached so a cold
 *   start paints branded before the session resolves; `null` = default
 *   Tatame brand (logged out, unbranded academy, plataforma).
 * - `mode`: the per-user, per-device dark preference (design-system ticket
 *   06 — client-side only, no server involvement), persisted in
 *   AsyncStorage.
 */

import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BrandInput, Mode } from '@tatame/design-system/native';

export const BRAND_CACHE_KEY = 'tatame.lastBrand';
export const THEME_MODE_KEY = 'tatame.themeMode';

export interface ThemeState {
  mode: Mode;
  brand: BrandInput | null;
}

let state: ThemeState = { mode: 'light', brand: null };
/** Once a session verdict lands, the stale cold-start cache must not win. */
let brandResolvedFromSession = false;
const listeners = new Set<() => void>();

function setState(next: ThemeState): void {
  state = next;
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ThemeState {
  return state;
}

export function useThemePreferences(): ThemeState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/* ------------------------------------------------------------------ */
/* Persistence                                                         */
/* ------------------------------------------------------------------ */

const HEX = /^#[0-9A-Fa-f]{6}$/;

/** Cached triplet must be a full valid brand — anything else is default. */
function parseCachedBrand(raw: string | null): BrandInput | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<BrandInput> | null;
    if (
      value &&
      HEX.test(value.deep ?? '') &&
      HEX.test(value.vibrant ?? '') &&
      HEX.test(value.accent ?? '')
    ) {
      return {
        deep: value.deep!,
        vibrant: value.vibrant!,
        accent: value.accent!,
      };
    }
  } catch {
    // Corrupt cache === no cache.
  }
  return null;
}

function sameBrand(a: BrandInput | null, b: BrandInput | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.deep === b.deep && a.vibrant === b.vibrant && a.accent === b.accent;
}

/**
 * Cold-start hydration (before `boot()`): last-seen brand + persisted mode
 * from AsyncStorage, so the splash/first frame already wear the academy's
 * colors and the chosen mode. Unreadable storage === defaults.
 */
export async function hydrateTheme(): Promise<void> {
  let mode: Mode = state.mode;
  let brand: BrandInput | null = state.brand;
  try {
    const [storedMode, storedBrand] = await Promise.all([
      AsyncStorage.getItem(THEME_MODE_KEY),
      AsyncStorage.getItem(BRAND_CACHE_KEY),
    ]);
    if (storedMode === 'dark' || storedMode === 'light') mode = storedMode;
    if (!brandResolvedFromSession) brand = parseCachedBrand(storedBrand);
  } catch {
    // Defaults stand.
  }
  if (mode !== state.mode || !sameBrand(brand, state.brand)) {
    setState({ mode, brand });
  }
}

/**
 * Session verdict → active brand + cache. Authed with a branded academy
 * caches the triplet; authed unbranded / logged out clears back to the
 * default Tatame brand (logout must never leave a stale tenant brand).
 */
export async function applySessionBrand(
  brand: BrandInput | null,
): Promise<void> {
  brandResolvedFromSession = true;
  const next = brand
    ? { deep: brand.deep, vibrant: brand.vibrant, accent: brand.accent }
    : null;
  if (!sameBrand(next, state.brand)) setState({ ...state, brand: next });
  try {
    if (next) await AsyncStorage.setItem(BRAND_CACHE_KEY, JSON.stringify(next));
    else await AsyncStorage.removeItem(BRAND_CACHE_KEY);
  } catch {
    // Cache write failure only costs the next cold start's first frame.
  }
}

/** Aluno perfil "Tema escuro" switch — flips + persists the mode. */
export async function setThemeMode(mode: Mode): Promise<void> {
  if (mode !== state.mode) setState({ ...state, mode });
  try {
    await AsyncStorage.setItem(THEME_MODE_KEY, mode);
  } catch {
    // Persistence failure keeps the in-session flip.
  }
}

/* ------------------------------------------------------------------ */
/* Test seam (rn-07 pattern)                                           */
/* ------------------------------------------------------------------ */

export const themeTestApi = {
  reset(): void {
    state = { mode: 'light', brand: null };
    brandResolvedFromSession = false;
    listeners.clear();
  },
};
