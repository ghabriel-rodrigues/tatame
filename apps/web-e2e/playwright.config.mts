import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';
import { workspaceRoot } from '@nx/devkit';

// For CI, you may want to set BASE_URL to the deployed application.
const baseURL = process.env['BASE_URL'] || 'http://localhost:4200';

/**
 * RLS.7 (web-07) — thin e2e smoke lane: the six specs that prove what MSW
 * structurally cannot — the real httpOnly cookie/refresh loop and the real
 * proxy wiring — against `vite preview` (built artifact) + the real NestJS
 * API + the docker-compose Postgres with seeded fixtures. No MSW here.
 *
 * Prerequisite: Docker must be available. `global-setup.ts` brings the
 * compose `postgres` service up (host port from the root `.env`, 5433 in
 * dev) and runs migrations + the dev seed (idempotent) before any spec.
 * Both app servers are booted by the `webServer` entries below and reused
 * when already running locally.
 *
 * Generated as a .mts file so Node forces ESM regardless of workspace
 * `type`. Playwright routes `.mts` through its ESM loader (dynamic import,
 * bypassing the pirates CJS-compile path), and Nx's native TS strip loads
 * `.mts` directly. Playwright's configLoader auto-discovers
 * `playwright.config.mts` via its extension list
 * (.ts/.js/.mts/.mjs/.cts/.cjs).
 */
export default defineConfig({
  ...nxE2EPreset(import.meta.dirname, { testDir: './src' }),
  globalSetup: './src/support/global-setup.ts',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    baseURL,
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },
  /* Real stack: NestJS API (compose Postgres behind it) + built web app. */
  webServer: [
    {
      // apps/api/.env carries DATABASE_URL (compose Postgres on 5433),
      // JWT secrets and API_PORT=3000.
      command: 'pnpm nx run api:serve',
      url: 'http://localhost:3000/docs',
      reuseExistingServer: !process.env.CI,
      cwd: workspaceRoot,
      timeout: 180_000,
    },
    {
      // `vite preview` serves the built artifact; its preview.proxy keeps
      // /v1 same-origin so the refresh cookie stays first-party (web-01).
      command: 'pnpm nx run web:preview',
      url: 'http://localhost:4200',
      reuseExistingServer: !process.env.CI,
      cwd: workspaceRoot,
      timeout: 180_000,
    },
  ],
  /* Smoke lane: chromium only (web-07 — target < 5 min). */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
