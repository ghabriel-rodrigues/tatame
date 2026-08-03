/**
 * API singletons (rn-04, mirrors web's api.ts): the shared openapi-fetch
 * client with the RN auth adapter (memory access token + body-transport
 * refresh rotated through the secure-store TokenStore) and the app
 * QueryClient. Tenant boundary rule: `queryClient.clear()` at every login,
 * logout and switch boundary — cached data never crosses users or academies.
 */

import { QueryClient } from '@tanstack/react-query';
import { createApiClient } from '@tatame/shared';
import { emitAuthLost, getAccessToken, setAccessToken } from './token';
import { clearRefreshToken, getRefreshToken, setRefreshToken } from './token-store';

/** Dev default targets the local API; EXPO_PUBLIC_API_URL overrides. */
export const apiBaseUrl = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:3000';

interface BodyRefreshResponse {
  accessToken: string;
  accessExpiresIn: number;
  refreshToken?: string;
}

export type RefreshResult =
  | { kind: 'ok'; accessToken: string }
  /** No stored refresh token — no session to restore. */
  | { kind: 'missing' }
  /** Definitive server rejection (revoked/reused family) — token wiped. */
  | { kind: 'rejected' }
  /** Transport failure — offline is NOT a revocation; token kept. */
  | { kind: 'network' };

/**
 * Raw body-transport refresh — used by the cold-start silent refresh and the
 * AuthAdapter. Deliberately NOT the middleware-wrapped client: refreshing
 * must never recurse into itself. Rotates the stored refresh token on
 * success; a definitive rejection (4xx) wipes it; a network failure wipes
 * nothing.
 */
export async function requestBodyRefreshDetailed(
  options: { fetch?: typeof globalThis.fetch } = {},
): Promise<RefreshResult> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return { kind: 'missing' };
  let response: Response;
  try {
    response = await fetchImpl(`${apiBaseUrl}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transport: 'body', refreshToken }),
    });
  } catch {
    return { kind: 'network' };
  }
  if (!response.ok) {
    if (response.status >= 400 && response.status < 500) {
      await clearRefreshToken();
      return { kind: 'rejected' };
    }
    return { kind: 'network' };
  }
  const body = (await response.json()) as BodyRefreshResponse;
  if (typeof body.accessToken !== 'string') return { kind: 'rejected' };
  if (typeof body.refreshToken === 'string') await setRefreshToken(body.refreshToken);
  setAccessToken(body.accessToken);
  return { kind: 'ok', accessToken: body.accessToken };
}

/** AuthAdapter-shaped wrapper: token string or null. */
export async function requestBodyRefresh(
  options: { fetch?: typeof globalThis.fetch } = {},
): Promise<string | null> {
  const result = await requestBodyRefreshDetailed(options);
  return result.kind === 'ok' ? result.accessToken : null;
}

export const apiClient = createApiClient({
  baseUrl: apiBaseUrl,
  auth: {
    getAccessToken,
    refresh: requestBodyRefresh,
    onAuthLost: emitAuthLost,
  },
});

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});
