/**
 * Web test setup (web-07): MSW at the fetch layer — the shared client, auth
 * middleware and 401 single-flight run for real; nothing inside the client
 * is stubbed. Per-test overrides via `server.use(...)`.
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { notificationsHandlers, setupTestServer } from '@tatame/shared/testing';
import { queryClient } from '../api/api';
import { authTestApi } from '../auth/auth-store';
import { resetThemeState } from '../app/theme-store';

export const server = setupTestServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

// NOT.7: every /admin shell render polls the badge — quiet defaults keep
// suites focused elsewhere green; per-test `server.use(...)` still wins.
beforeEach(() => {
  server.use(...notificationsHandlers({ notifications: [], unreadCount: 0 }));
});

afterEach(() => {
  server.resetHandlers();
  cleanup();
  queryClient.clear();
  authTestApi.reset();
  localStorage.clear();
  resetThemeState();
  document.documentElement.removeAttribute('data-theme');
});

afterAll(() => server.close());
