/**
 * Web test setup (web-07): MSW at the fetch layer — the shared client, auth
 * middleware and 401 single-flight run for real; nothing inside the client
 * is stubbed. Per-test overrides via `server.use(...)`.
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { setupTestServer } from '@tatame/shared/testing';
import { queryClient } from '../api/api';
import { authTestApi } from '../auth/auth-store';

export const server = setupTestServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

afterEach(() => {
  server.resetHandlers();
  cleanup();
  queryClient.clear();
  authTestApi.reset();
  localStorage.clear();
});

afterAll(() => server.close());
