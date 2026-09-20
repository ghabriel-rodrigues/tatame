/**
 * API singletons (web-03/04): openapi-fetch client with the web auth adapter
 * (memory token + cookie-transport refresh), the openapi-react-query wrapper
 * and the app QueryClient. Tenant boundary rule: `queryClient.clear()` at
 * every login, logout, switch and impersonation boundary — cached data never
 * crosses users or academies.
 */
import { QueryClient } from '@tanstack/react-query';
import {
  createApiClient,
  createApiQuery,
  requestCookieRefresh,
} from '@tatame/shared';
import { emitAuthLost, getAccessToken, setAccessToken } from '../auth/token';

/**
 * Same-origin in dev (Vite proxy) and prod (Netlify rewrite). Tests run in
 * jsdom whose fetch requires absolute URLs — pin the jsdom origin there.
 */
export const apiBaseUrl =
  import.meta.env.MODE === 'test' ? 'http://localhost' : '';

export const apiClient = createApiClient({
  baseUrl: apiBaseUrl,
  auth: {
    getAccessToken,
    refresh: async () => {
      const refreshed = await requestCookieRefresh({ baseUrl: apiBaseUrl });
      if (!refreshed) return null;
      setAccessToken(refreshed.accessToken);
      return refreshed.accessToken;
    },
    onAuthLost: emitAuthLost,
  },
});

/** Schema-derived TanStack Query hooks (`$api.useQuery('get', '/v1/...')`). */
export const $api = createApiQuery(apiClient);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});
