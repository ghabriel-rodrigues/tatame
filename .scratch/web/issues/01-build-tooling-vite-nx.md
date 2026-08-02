# Build tooling: Vite under nx

Type: research
Status: resolved

## Question

How should the web app be built with Vite inside the nx + pnpm monorepo (no Next — fixed decision)? Research: `@nx/vite` vs `@nx/react` generators and current best practice; project layout (`apps/web`) and how it consumes workspace packages (`packages/design-system`, future shared/api-client packages) — TS project references, `paths`, or nx buildable libs; dev server + proxy to the NestJS backend in docker-compose; env var handling (Vite `import.meta.env` conventions per environment); production build output suitable for Netlify (SPA fallback); and code-splitting strategy given the app may serve multiple persona surfaces.

## Answer

**Generator: `@nx/react:application` with `--bundler=vite --unitTestRunner=vitest`.** `@nx/react` is the correct entry point (it scaffolds the React app and delegates bundling to `@nx/vite` internally, registering the `@nx/vite/plugin` for inferred `dev`/`build`/`preview`/`test` targets). Using `@nx/vite` directly is for converting existing projects, not scaffolding. Command convention:

```
rtk pnpm nx g @nx/react:application apps/web \
  --bundler=vite --unitTestRunner=vitest --e2eTestRunner=none \
  --style=none --routing=false --linter=eslint --strict
```

`--style=none` because MUI/Emotion is CSS-in-JS (fixed decision) and Lumira tokens arrive as CSS variables from `packages/design-system` — no Sass/CSS-modules layer. `--routing=false` because the router is decided in ticket 02, not by the generator template.

**Workspace package consumption: TS project references + pnpm workspace deps, source-resolved via the `@org/source` custom condition** — this is the nx "TS solution" preset the repo is already on (`tsconfig.base.json` has `composite`, `customConditions: ["@org/source"]`; `nx.json` runs the `@nx/js/typescript` plugin for inferred `typecheck`/`build`). Convention: every `packages/*` lib declares `exports` in its `package.json` with an `"@org/source"` condition pointing at `./src/index.ts`; `apps/web` depends on them as normal `workspace:*` deps. Vite bundles libs from source (instant HMR across package boundaries — no `nx build` of libs during dev), while `nx typecheck` uses project references for correctness. **Rejected:** `tsconfig.base.json` `paths` aliases (legacy nx style, fights the TS-solution preset), buildable libs with `dist` consumption (slower feedback, needless for app-internal libs; revisit only if a package must publish externally).

**TS strict:** already enforced repo-wide by `tsconfig.base.json` (`strict`, `noImplicitReturns`, `noUnusedLocals`, etc.). The app's `tsconfig.app.json` extends it and adds `"types": ["vite/client"]`, `jsx: react-jsx`, `module/moduleResolution: esnext/bundler` (app code is bundled; the base's `nodenext` is for node-built libs).

**Unit tests: Vitest** (`vitest` + `@testing-library/react` + `jsdom` environment), config co-located in `vite.config.ts` (`test` block) so one config drives dev, build, and tests. Nx infers the `test` target from it. Rejected Jest: second compiler pipeline, no Vite transform parity.

**Dev server + API proxy:** Vite `server.proxy` maps `/api` → `http://localhost:3000` (NestJS; `API_PORT=3000` in `.env.example`, web on 4200 per `WEB_URL`). App code always calls same-origin `/api/...` — no CORS in dev, and the base URL is not baked into code.

**Env vars:** Vite conventions — only `VITE_`-prefixed vars reach the client via `import.meta.env`; typed in `apps/web/src/vite-env.d.ts` (augment `ImportMetaEnv`). `.env.development` / `.env.production` committed for non-secret config; secrets never get a `VITE_` prefix (they'd ship in the bundle). Because `/api` is same-origin-proxied in both dev and prod (see Netlify below), no `VITE_API_URL` is needed at all initially.

**Netlify production build:** `nx build web` → `apps/web/dist`. SPA fallback + API proxy via `netlify.toml` at repo root:
- `[[redirects]] from = "/api/*" to = "<backend-origin>/api/:splat" status = 200` (proxy rewrite, keeps the API same-origin in production — this materially simplifies ticket 04's cookie/CSRF story)
- `[[redirects]] from = "/*" to = "/index.html" status = 200` (SPA fallback, declared after the API rule).

**Code-splitting:** route-level `React.lazy` at the persona-surface boundary (`/admin`, `/plataforma`, `/convite` route trees from ticket 02) so the public Convite flow never downloads console code and vice-versa. Per LLM-wiki `react-best-practices` (`bundle-analyzable-paths`, `bundle-barrel-imports`): literal dynamic-import paths only, no barrel re-export files inside `apps/web`, direct imports from design-system entry points. No `manualChunks` tuning until a real bundle report justifies it.

**Implications for blocked tickets:** 04 — same-origin `/api` in dev (Vite proxy) and prod (Netlify proxy) keeps httpOnly-cookie auth on the table without cross-site cookie pain. 05 — design-system is consumed from source (`@org/source` condition), so theme/token edits HMR into the app instantly; Quicksand should be self-hosted via `@fontsource/quicksand` imported in the app entry (bundled, no external font request).
