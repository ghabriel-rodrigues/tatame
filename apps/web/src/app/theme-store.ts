/**
 * Console theming state (CFG.8/CFG.10, spec 011): the dark-mode preference
 * (per-user, client-side — localStorage, explicit two-state per design-system
 * ticket 06) and the white-label live-preview override used by the admin
 * Configurações palette picker. Module singleton consumed via
 * `useSyncExternalStore`, matching the auth store pattern.
 */
import { useSyncExternalStore } from 'react';
import type { BrandInput, Mode } from '@tatame/design-system';

export const THEME_MODE_STORAGE_KEY = 'tatame.web.theme-mode';

interface ThemeState {
  mode: Mode;
  /** Live-preview brand override (admin-15 palette picker); null = none. */
  preview: BrandInput | null;
}

function readStoredMode(): Mode {
  try {
    return globalThis.localStorage?.getItem(THEME_MODE_STORAGE_KEY) === 'dark'
      ? 'dark'
      : 'light';
  } catch {
    return 'light';
  }
}

let state: ThemeState = { mode: readStoredMode(), preview: null };
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

export function useThemeState(): ThemeState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Flip + persist the console theme mode (CFG.10). */
export function setThemeMode(mode: Mode): void {
  try {
    globalThis.localStorage?.setItem(THEME_MODE_STORAGE_KEY, mode);
  } catch {
    // Storage unavailable — the flip still applies for this session.
  }
  setState({ ...state, mode });
}

/** Palette live preview (admin-15): set on swatch select, null to revert. */
export function setBrandPreview(preview: BrandInput | null): void {
  setState({ ...state, preview });
}

/** Test seam: back to stored-mode defaults with no preview. */
export function resetThemeState(): void {
  state = { mode: readStoredMode(), preview: null };
}
