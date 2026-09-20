/**
 * Module-singleton session store (rn-04, mirrors web-04's auth-store): the
 * only client-side auth state, consumed via `useSyncExternalStore`. States:
 * `booting → authed | anon`; the role gates never run against an unknown
 * session. Active role, academy status and the read-only flag are
 * server-derived facts from `/v1/auth/me` — the client never decodes the
 * JWT.
 */

import { useSyncExternalStore } from 'react';
import type { MeResponse } from '@tatame/shared';
import { apiClient, queryClient, requestBodyRefreshDetailed } from './api';
import { onAuthLost, setAccessToken } from './token';
import {
  clearRefreshToken,
  getRefreshToken,
  setRefreshToken,
} from './token-store';

export type SessionStatus = 'booting' | 'authed' | 'anon';

export interface SessionState {
  status: SessionStatus;
  /** Bootstrap payload while `authed`; null otherwise. */
  session: MeResponse | null;
}

let state: SessionState = { status: 'booting', session: null };
const listeners = new Set<() => void>();

function setState(next: SessionState): void {
  state = next;
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): SessionState {
  return state;
}

export function useSession(): SessionState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Auth loss (failed single-flight 401 refresh) → anon + full cache clear. */
onAuthLost(() => {
  void toAnon();
});

async function toAnon(
  options: { keepRefreshToken?: boolean } = {},
): Promise<void> {
  setAccessToken(null);
  if (!options.keepRefreshToken) await clearRefreshToken();
  queryClient.clear();
  setState({ status: 'anon', session: null });
}

async function fetchSession(): Promise<MeResponse | null> {
  const { data } = await apiClient.GET('/v1/auth/me');
  return data ?? null;
}

/**
 * Cold-start boot behind the splash (rn-04): stored refresh token → silent
 * body-transport refresh → `/auth/me` bootstrap → authed; anything missing
 * or rejected → anon. Idempotent: only runs from `booting`.
 */
export async function boot(): Promise<SessionState> {
  if (state.status !== 'booting') return state;
  const stored = await getRefreshToken();
  if (!stored) {
    await toAnon();
    return state;
  }
  const refreshed = await requestBodyRefreshDetailed();
  if (refreshed.kind !== 'ok') {
    // Offline-with-stored-token keeps the token for the next launch but
    // still lands on login for now: the degraded/stale shell (spec story 7)
    // needs a persisted session snapshot, which lands with the offline
    // check-in slice (rn-05).
    await toAnon({ keepRefreshToken: refreshed.kind === 'network' });
    return state;
  }
  const session = await fetchSession();
  if (!session) {
    await toAnon();
    return state;
  }
  setState({ status: 'authed', session });
  return state;
}

/**
 * Login boundary: persist the rotated refresh token, adopt the access
 * token, clear every cached query (user boundary) and load the bootstrap.
 */
export async function adoptSession(
  accessToken: string,
  refreshToken?: string,
): Promise<MeResponse | null> {
  if (refreshToken) await setRefreshToken(refreshToken);
  setAccessToken(accessToken);
  queryClient.clear();
  const session = await fetchSession();
  if (!session) {
    await toAnon();
    return null;
  }
  setState({ status: 'authed', session });
  return session;
}

/** Re-reads `/auth/me` without a boundary clear (e.g. status changes). */
export async function refreshSession(): Promise<MeResponse | null> {
  const session = await fetchSession();
  if (session) setState({ status: 'authed', session });
  return session;
}

/**
 * Membership switch (same session, new access token) — a tenant boundary:
 * cache cleared, session re-bootstrapped.
 */
export async function switchMembership(
  membershipId: string,
): Promise<MeResponse | null> {
  const { data, error } = await apiClient.POST('/v1/auth/switch', {
    body: { membershipId },
  });
  if (!data) throw error ?? new Error('Membership switch failed');
  setAccessToken(data.accessToken);
  queryClient.clear();
  const session = await fetchSession();
  if (session) setState({ status: 'authed', session });
  return session;
}

/**
 * "Sair": revoke server-side first, but complete locally regardless of the
 * network outcome — logout must never fail closed into a live session.
 * Local completion = secure-store wipe + memory token drop +
 * `queryClient.clear()`; the anon state flips the role gates back to login.
 */
export async function logout(): Promise<void> {
  try {
    await apiClient.POST('/v1/auth/logout');
  } catch {
    // Offline logout still logs out locally.
  } finally {
    await toAnon();
  }
}

/* ------------------------------------------------------------------ */
/* Derived session facts (AUTH.19)                                     */
/* ------------------------------------------------------------------ */

/** Persona shells (mobile roles) + the two blocking surfaces. */
export type SessionGate =
  | 'login'
  | 'aluno'
  | 'professor'
  | 'responsavel'
  | 'console-only'
  | 'suspended';

/** Academy status values from the API (`AcademyStatus`). */
export const SUSPENDED_STATUS = 'suspended';
export const DELINQUENT_STATUS = 'delinquent';

export function isSuspended(session: MeResponse | null): boolean {
  return session?.academy?.status === SUSPENDED_STATUS;
}

/** Delinquency → read-only UX flag (enforcement is server-side). */
export function isReadOnly(session: MeResponse | null): boolean {
  return session?.academy?.status === DELINQUENT_STATUS;
}

/**
 * Role gate resolution (rn-02/rn-04): one shell per active role; admin and
 * platform roles are web consoles ("use o console web"); a suspended
 * academy blocks everything except the blocking screen and logout.
 */
export function resolveGate(s: SessionState): SessionGate {
  if (s.status !== 'authed' || !s.session) return 'login';
  if (isSuspended(s.session)) return 'suspended';
  switch (s.session.activeRole) {
    case 'student':
      return 'aluno';
    case 'professor':
      return 'professor';
    case 'guardian':
      return 'responsavel';
    default:
      // admin / owner / support / finance — web-only personas.
      return 'console-only';
  }
}

/* ------------------------------------------------------------------ */
/* Test seam (rn-07): reset or seed the store without network.         */
/* ------------------------------------------------------------------ */

export const sessionTestApi = {
  reset(): void {
    setAccessToken(null);
    state = { status: 'booting', session: null };
    listeners.clear();
  },
  seed(
    next: SessionState,
    accessToken: string | null = 'test-access-token',
  ): void {
    setAccessToken(next.status === 'authed' ? accessToken : null);
    setState(next);
  },
};
