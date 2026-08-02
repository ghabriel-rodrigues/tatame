/**
 * openapi-fetch client factory (web-03). One shared client for web and the
 * mobile apps: bearer header from a memory-only token source, single-flight
 * 401 refresh with exactly one replay, and an `onAuthLost` seam the app maps
 * to logout + cache clear. Platform storage differences live behind the
 * `AuthAdapter` — the client never touches cookies or secure storage itself.
 */
import createClient, { type Client } from 'openapi-fetch';
import type { paths } from './schema.js';

/** The seam each platform fills (web: memory token + httpOnly refresh cookie). */
export interface AuthAdapter {
  /** Current in-memory access token, or null when anonymous. */
  getAccessToken(): string | null;
  /**
   * Obtains a fresh access token (web: cookie-transport `/v1/auth/refresh`).
   * Resolves null when the session is gone. Concurrent callers are
   * single-flighted by the client — implementations need no dedupe.
   */
  refresh(): Promise<string | null>;
  /** Refresh failed after a 401 — the app must drop to anon + clear caches. */
  onAuthLost(): void;
}

export interface CreateApiClientOptions {
  /** Origin prefix; empty for same-origin (dev proxy + Netlify rewrite). */
  baseUrl?: string;
  auth?: AuthAdapter;
  /** Base fetch implementation (tests / non-browser platforms). */
  fetch?: (input: Request) => Promise<Response>;
}

export type ApiClient = Client<paths>;

/**
 * Paths where a 401 is a final answer — refreshing would loop or is
 * pointless (credential and refresh endpoints themselves).
 */
const NO_REFRESH_PATHS = ['/v1/auth/login', '/v1/auth/refresh', '/v1/auth/password'];

function isRefreshExempt(url: string): boolean {
  const path = new URL(url, 'http://localhost').pathname;
  return NO_REFRESH_PATHS.some((prefix) => path.startsWith(prefix));
}

export function createApiClient(options: CreateApiClientOptions = {}): ApiClient {
  const { baseUrl = '', auth } = options;
  const baseFetch = options.fetch ?? ((input: Request) => globalThis.fetch(input));

  /** Single-flight guard: all concurrent 401s await the same refresh. */
  let inflightRefresh: Promise<string | null> | null = null;
  const runRefresh = (): Promise<string | null> => {
    if (!auth) return Promise.resolve(null);
    inflightRefresh ??= auth
      .refresh()
      .catch(() => null)
      .finally(() => {
        inflightRefresh = null;
      });
    return inflightRefresh;
  };

  const authFetch = async (input: Request): Promise<Response> => {
    if (!auth) return baseFetch(input);

    const attach = (request: Request): Request => {
      const token = auth.getAccessToken();
      if (token) request.headers.set('Authorization', `Bearer ${token}`);
      return request;
    };

    // Clone before dispatch so the body is replayable after a 401.
    const replay = input.clone();
    const response = await baseFetch(attach(input));
    if (response.status !== 401 || isRefreshExempt(input.url)) return response;

    const token = await runRefresh();
    if (!token) {
      auth.onAuthLost();
      return response;
    }
    return baseFetch(attach(replay));
  };

  return createClient<paths>({
    baseUrl,
    // Refresh cookie rides on /v1/auth/* (first-party via same-origin proxy).
    credentials: 'include',
    fetch: authFetch,
  });
}

export interface RefreshedTokens {
  accessToken: string;
  accessExpiresIn: number;
}

/**
 * Raw cookie-transport refresh call — used by the web auth store (boot silent
 * refresh and the AuthAdapter.refresh implementation). Deliberately NOT the
 * middleware-wrapped client: refreshing must never recurse into itself.
 */
export async function requestCookieRefresh(
  options: { baseUrl?: string; fetch?: typeof globalThis.fetch } = {},
): Promise<RefreshedTokens | null> {
  const { baseUrl = '' } = options;
  const fetchImpl = options.fetch ?? globalThis.fetch;
  try {
    const response = await fetchImpl(`${baseUrl}/v1/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        // CSRF hardening for the only cookie-authenticated endpoint.
        'X-Requested-With': 'tatame-web',
      },
      body: JSON.stringify({ transport: 'cookie' }),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as RefreshedTokens;
    return typeof body.accessToken === 'string' ? body : null;
  } catch {
    // Network failure at boot is "no session" for the caller to decide on.
    return null;
  }
}
