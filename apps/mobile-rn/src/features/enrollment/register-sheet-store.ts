/**
 * Cadastrar-aluno sheet visibility (ENR.20). Module singleton (same pattern
 * as session-store) because the sheet is opened from two places that don't
 * share a React parent hook: the responsável shell FAB and the dependents
 * panel button. The sheet host lives in the (responsavel) layout.
 */

import { useSyncExternalStore } from 'react';

let open = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of [...listeners]) listener();
}

export function openRegisterDependentSheet(): void {
  if (open) return;
  open = true;
  emit();
}

export function closeRegisterDependentSheet(): void {
  if (!open) return;
  open = false;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => open;

export function useRegisterDependentSheetOpen(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
