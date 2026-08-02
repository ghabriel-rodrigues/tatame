# Build tooling: Vite under nx

Type: research
Status: open

## Question

How should the web app be built with Vite inside the nx + pnpm monorepo (no Next — fixed decision)? Research: `@nx/vite` vs `@nx/react` generators and current best practice; project layout (`apps/web`) and how it consumes workspace packages (`packages/design-system`, future shared/api-client packages) — TS project references, `paths`, or nx buildable libs; dev server + proxy to the NestJS backend in docker-compose; env var handling (Vite `import.meta.env` conventions per environment); production build output suitable for Netlify (SPA fallback); and code-splitting strategy given the app may serve multiple persona surfaces.
