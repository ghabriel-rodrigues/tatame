/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/web',
  server: {
    port: 4200,
    host: 'localhost',
    // Same-origin API in dev (web-01): the app always calls /v1/* on its own
    // origin, keeping the httpOnly refresh cookie first-party. The backend
    // serves URI-versioned routes (/v1) — web-01's "/api" prefix wording is
    // superseded by the implemented cookie path (/v1/auth).
    proxy: {
      '/v1': 'http://localhost:3000',
    },
  },
  preview: {
    port: 4200,
    host: 'localhost',
    // RLS.7: the e2e smoke lane runs against `vite preview` (built app) —
    // mirror the dev proxy so /v1 stays same-origin and the httpOnly
    // refresh cookie remains first-party, as in dev and prod (Netlify).
    proxy: {
      '/v1': 'http://localhost:3000',
    },
  },
  plugins: [react()],
  resolve: {
    // pnpm resolves two @mui/@emotion instances (peer-hash split via a
    // supports-color transitive) — one for the app, one for the linked
    // design-system. Two instances mean two Emotion ThemeContexts and a
    // silently ignored theme; force a single copy.
    dedupe: [
      'react',
      'react-dom',
      '@emotion/react',
      '@emotion/styled',
      '@mui/material',
    ],
  },
  // Uncomment this if you are using workers.
  // worker: {
  //  plugins: [],
  // },
  build: {
    outDir: './dist',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  test: {
    name: 'web',
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    // userEvent + MUI surfaces routinely take 2-5s per test under parallel
    // workers; the 5s default made timing the dominant failure mode.
    testTimeout: 15_000,
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
}));
