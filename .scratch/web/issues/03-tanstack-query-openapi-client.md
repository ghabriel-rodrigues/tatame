# TanStack Query patterns and OpenAPI client generation

Type: research
Status: resolved

## Question

What are the TanStack Query conventions for this app, and how is the API client generated from the NestJS backend's OpenAPI spec? Research: generator choice (openapi-typescript + openapi-fetch, Orval with TanStack Query mode, Hey API, openapi-ts) and where the generated client lives in the monorepo (shared package consumable by web and RN?); query key factory conventions; cache invalidation patterns for the domain (check-ins, attendance, payments, graduations); optimistic updates (e.g. manual roll call toggles); pagination/infinite lists (students, academies); error normalization; and how multi-tenant context (academy id) and auth headers thread through the generated client.

## Answer

**Generator: the openapi-ts stack — `openapi-typescript` (types) + `openapi-fetch` (runtime client) + `openapi-react-query` (TanStack Query v5 bindings).** Why: types are generated into a single committed `.d.ts` (zero runtime, tiny diffs, no code churn); `openapi-fetch` is ~6 kB, fetch-based, and works identically in browsers and React Native, so ONE shared package serves web and the RN app; `openapi-react-query` derives TanStack Query v5 hooks and query keys directly from the same schema, so paths/params/bodies/responses are all type-checked against the backend spec. This also matches the LLM-wiki guidance (react-best-practices `client-swr-dedup`: hook-level cache/dedup library over ad-hoc `useEffect` fetching — TanStack Query is our fixed pick of that family). **Rejected:** Orval (generates full hook source — large churny diffs, lockstep coupling between generated code and TanStack Query versions; its mock/zod extras aren't needed yet); Hey API `@hey-api/openapi-ts` (capable, but younger and plugin-churny; revisit only if we need its SDK niceties); hand-written client (no drift protection against the NestJS spec).

**Spec source & pipeline:** NestJS emits `openapi.json` via `@nestjs/swagger` (backend effort owns an `nx run api:openapi-emit` target writing the artifact). Generation target `nx run shared:generate-api` runs `openapi-typescript openapi.json -o packages/shared/src/api/schema.d.ts`. The generated file is **committed**; CI regenerates and fails on diff (drift check). Web never fetches the spec at build time.

**File layout — lives in `packages/shared` (consumable by web and RN):**

```
packages/shared/src/api/
  schema.d.ts      # generated — do not edit (openapi-typescript output)
  client.ts        # createApiClient({ baseUrl, auth }) — openapi-fetch + middleware
  query.ts         # createApiQuery(client) — openapi-react-query $api wrapper
  errors.ts        # ApiError type + NestJS error-shape normalization
  index.ts
```

`packages/shared` follows ticket 01's conventions: TS project reference, `@org/source` export condition, consumed from source.

**Query-key convention:** the `openapi-react-query` canonical shape `[method, path, params]` (e.g. `["get", "/academies/{academyId}/students", { path: { academyId } }]`). No hand-rolled key factories — keys fall out of the spec, and invalidation is hierarchical by path prefix. Domain invalidation map (mutation → invalidated prefixes): check-in → that class's attendance + the student's attendance history; roll-call toggle → class attendance list; payment actions → wallet/invoices + admin financial overview; graduation (add degree/promote) → student graduation timeline + academy graduation report. Convention: every mutation declares its invalidation list next to its definition; nothing invalidates `"*"`.

**Multi-tenant + auth threading:** tenant (academy id) rides in the **auth session, not in a client-side header** — the token/cookie identifies user + academy (per ticket 02, tenant is not in the URL either). Consequence: on tenant-context change (logout, login, platform impersonation "entrar como admin" start/stop) the rule is `queryClient.clear()` — never let cached data cross a tenant boundary. Auth is injected via `openapi-fetch` middleware in `client.ts` behind an `auth` adapter interface so platforms differ without forking the client: web adapter = same-origin httpOnly cookies (ticket 01 made `/api` same-origin in dev and prod), likely no Authorization header at all; RN adapter = bearer token from secure storage. **Refresh handling lives in this middleware:** on 401, run a single-flight refresh (one in-flight refresh promise shared by all callers), replay the original request once, and on refresh failure emit an `onAuthLost` event that the app maps to logout + `queryClient.clear()`. Ticket 04 decides the storage/CSRF details; the seam it must fill is exactly this adapter.

**Error normalization:** `onResponse` middleware converts non-2xx into a typed `ApiError` (from the NestJS shape `{ statusCode, message, error }`), registered as TanStack Query's global error type via the `Register` interface (`defaultError: ApiError`). UI never parses raw response bodies.

**Pagination:** cursor-based `useInfiniteQuery` for long admin/platform lists (students, academies) via `openapi-react-query`'s infinite support, `pageParam` mapped to the spec's cursor query param. Plain paged queries (page/size) acceptable for small report tables; `placeholderData: keepPreviousData` for paged tables to avoid flicker.

**Optimistic-update policy (conservative default):** mutations are pessimistic — `onSettled` invalidate, spinners are fine. Optimistic updates are allowed ONLY for high-frequency, low-risk, easily-reversible toggles — the canonical case is the professor's manual roll-call presence toggle — implemented with the standard v5 recipe (`cancelQueries` → snapshot in `onMutate` context → rollback in `onError` → `invalidateQueries` in `onSettled`). NEVER optimistic: payments/wallet, graduations (immutable history), plan changes, anything financial or RBAC-sensitive.

**Implications for blocked tickets:** 04 — auth ticket only needs to implement the `auth` adapter + refresh endpoint contract and the `onAuthLost` → logout wiring; impersonation must go through the same "clear cache on tenant switch" rule. 05 — standardize loading/error surfaces on TanStack Query states (`isPending`/`isError` + `ApiError.message`) so the design-system's skeleton/alert components have one contract; no MUI coupling inside `packages/shared`.
