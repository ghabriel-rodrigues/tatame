import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/api-e2e',
  plugins: [
    // esbuild strips decorator metadata; Nest DI needs the swc transform.
    swc.vite({
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  test: {
    name: 'api-e2e',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    setupFiles: ['src/support/env-setup.ts'],
    reporters: ['default'],
    // One shared Postgres 16 Testcontainer for the run (reuses the db
    // package's harness); each spec file boots a fresh migrated+seeded
    // database and a real Nest application on it.
    globalSetup: ['../../packages/db/src/testing/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 90_000,
    hookTimeout: 240_000,
  },
}));
