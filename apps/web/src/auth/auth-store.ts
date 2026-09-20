/**
 * Module-singleton auth store (web-04): the only client-side auth state.
 * Consumed via `useSyncExternalStore` — no Redux/Zustand for one value.
 * States: `booting → authed | anon`; guards never run against an unknown
 * session. Active tenant and impersonation are server-derived facts from
 * `/v1/auth/me` (the client never decodes the JWT).
 */
import { useSyncExternalStore } from 'react';
import { requestCookieRefresh, type MeResponse } from '@tatame/shared';
import { apiBaseUrl, apiClient, queryClient } from '../api/api';
import { onAuthLost, setAccessToken } from './token';

export type AuthStatus = 'booting' | 'authed' | 'anon';

export interface AuthState {
  status: AuthStatus;
  /** Bootstrap payload while `authed`; null otherwise. */
  session: MeResponse | null;
}

let state: AuthState = { status: 'booting', session: null };
const listeners = new Set<() => void>();

function setState(next: AuthState): void {
  state = next;
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): AuthState {
  return state;
}

export function useAuth(): AuthState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Auth loss (failed 401 refresh) → anon + full cache clear (ticket 03 rule). */
onAuthLost(() => {
  toAnon();
});

function toAnon(): void {
  setAccessToken(null);
  queryClient.clear();
  setState({ status: 'anon', session: null });
}

async function fetchSession(): Promise<MeResponse | null> {
  const { data } = await apiClient.GET('/v1/auth/me');
  return data ?? null;
}

/**
 * Boot: one silent cookie refresh before any guarded route renders. On
 * success the bootstrap (`/auth/me`) fills the session; on failure → anon.
 */
export async function boot(): Promise<AuthState> {
  const refreshed = await requestCookieRefresh({ baseUrl: apiBaseUrl });
  if (!refreshed) {
    toAnon();
    return state;
  }
  setAccessToken(refreshed.accessToken);
  const session = await fetchSession();
  if (!session) {
    toAnon();
    return state;
  }
  setState({ status: 'authed', session });
  return state;
}

/**
 * Login boundary: adopt the freshly issued access token, clear every cached
 * query (user boundary), and load the bootstrap session.
 */
export async function adoptSession(
  accessToken: string,
): Promise<MeResponse | null> {
  setAccessToken(accessToken);
  queryClient.clear();
  const session = await fetchSession();
  if (!session) {
    toAnon();
    return null;
  }
  setState({ status: 'authed', session });
  return session;
}

/**
 * CFG.9: after a successful `/admin/academy` save the console keeps its
 * branding without a re-login — patch the cached session academy in place
 * (name/theme) so the theme provider re-derives immediately.
 */
export function patchSessionAcademy(
  patch: Partial<NonNullable<MeResponse['academy']>>,
): void {
  if (state.status !== 'authed' || !state.session?.academy) return;
  setState({
    ...state,
    session: {
      ...state.session,
      academy: { ...state.session.academy, ...patch },
    },
  });
}

/** Re-reads `/auth/me` without a boundary clear (e.g. after profile edits). */
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
 */
export async function logout(): Promise<void> {
  try {
    await apiClient.POST('/v1/auth/logout');
  } catch {
    // Offline logout still logs out locally.
  } finally {
    toAnon();
  }
}

/**
 * "Encerrar" impersonation: logging out the impersonated session (its own
 * revocation) and silently refreshing restores the untouched platform
 * session from the httpOnly cookie.
 */
export async function endImpersonation(): Promise<AuthState> {
  try {
    await apiClient.POST('/v1/auth/logout');
  } catch {
    // The impersonated session dies with its in-memory token anyway.
  }
  setAccessToken(null);
  queryClient.clear();
  setState({ status: 'booting', session: null });
  return boot();
}

/** Test seam (web-07): reset or seed the store without network. */
export const authTestApi = {
  reset(): void {
    setAccessToken(null);
    state = { status: 'booting', session: null };
    listeners.clear();
  },
  seed(
    next: AuthState,
    accessToken: string | null = 'test-access-token',
  ): void {
    setAccessToken(next.status === 'authed' ? accessToken : null);
    state = next;
  },
};
