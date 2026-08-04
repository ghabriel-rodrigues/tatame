/**
 * Check-in sheet visibility (ATT.15). Module singleton (same pattern as the
 * register-sheet store) because the sheet is opened from two places without
 * a shared React parent hook: the aluno shell center FAB and the home hero's
 * "Fazer check-in" button. The sheet host lives in the (aluno) layout.
 */

import { useSyncExternalStore } from 'react';

let open = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of [...listeners]) listener();
}

export function openCheckinSheet(): void {
  if (open) return;
  open = true;
  emit();
}

export function closeCheckinSheet(): void {
  if (!open) return;
  open = false;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => open;

export function useCheckinSheetOpen(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
