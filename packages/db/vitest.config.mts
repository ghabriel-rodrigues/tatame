import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/db',
  test: {
    name: 'db',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    // One shared Postgres 16 Testcontainer for the run; each spec file gets
    // its own freshly migrated database (src/testing/test-db.ts).
    globalSetup: ['src/testing/global-setup.ts'],
    // Sequential files: concurrent CREATE DATABASE from template1 conflicts.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 180_000,
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
}));
