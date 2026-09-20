# Release Runbook

Per-provider, top-to-bottom steps for the eight human-gated release items
(spec `docs/specs/014-release.md`, Section B: RLS.H1–H8). Everything the
machine could prepare is already committed — workflows, `netlify.toml`,
Dockerfile, migrations, this document. Each page below assumes the account
exists and ends with a **Verify** step. Execute in order; later pages depend
on earlier ones where noted.

Provider choices marked _(your call)_ are deliberately not made here.

Checklist (mirrors the spec):

- [ ] H1 — Git host + first push
- [ ] H2 — Netlify site + env vars
- [ ] H3 — API + Postgres production host
- [ ] H4 — Stripe live mode + webhook
- [ ] H5 — Resend domain
- [ ] H6 — Expo/EAS
- [ ] H7 — App Store + Play Console
- [ ] H8 — DNS / domain

---

## H1 — Git host + first push

The host and organization/namespace are **your choice** — this repo assumes
nothing. One caveat: the three committed workflows under `.github/workflows/`
are GitHub Actions files; if you pick another host, the CI platform decision
(infra ticket 03) reopens and the workflows need porting.

1. Create an empty repository on your chosen host (no README/license — the
   repo already has content). Private is fine.
2. From `/Users/gupy/apps/tatame`:

   ```sh
   git remote add origin <REMOTE_URL>
   git push -u origin main
   ```

3. On GitHub: the push activates the three workflows — `CI` (TS lane),
   `Mobile Android` and `Mobile iOS` (the mobile lanes are path-filtered and
   only run when their trees change).
4. Actions secrets: none are needed for the current pipelines (Testcontainers
   is self-contained, Stripe/Resend are mocked in tests). Add repo-level
   Actions secrets only when a future lane demands one.
5. Optional but recommended: protect `main` (require the `CI` jobs to pass
   before merge).

**Verify:** the Actions tab shows a green `CI` run for the first push (jobs
`main`, `migrations`, `openapi`; `web-smoke` runs when web-e2e is affected).
The mobile lanes show as skipped/not triggered unless their paths changed.

---

## H2 — Netlify site + environment variables

Prerequisite: H1 (Netlify links to the repo).

1. Netlify → **Add new site → Import an existing project** → pick the git
   host and the repository.
2. Build settings: leave everything to the committed `netlify.toml` (base
   `.`, command `pnpm nx build web`, publish `apps/web/dist`, Node 24).
   pnpm is selected automatically via the `packageManager` pin in
   `package.json`. Do not enable any test/plugin steps — Netlify only builds
   (web-07: Netlify never runs tests).
3. Set environment variables per **deploy context** (Site configuration →
   Environment variables). This is the web production env contract
   (infra-05 §4/§5 — `VITE_*` only; server secrets never enter Netlify):

   | Variable                      | production                                                                                                                                                                      | deploy-preview / branch-deploy                                             |
   | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
   | `VITE_API_URL`                | Production API origin, e.g. `https://api.tatame.app` — **unset if** the `/api/*` proxy redirect in `netlify.toml` is activated (H3), which is the recommended same-origin setup | unset (previews are UI-only until a staging backend exists — recorded fog) |
   | `VITE_STRIPE_PUBLISHABLE_KEY` | live `pk_live_…` (after H4)                                                                                                                                                     | test `pk_test_…` or unset                                                  |

4. Deploy previews per PR come free with the repo link; they inherit the
   `deploy-preview` context above.
5. Custom domain + HTTPS: defer to H8 (DNS page); Netlify provisions the
   certificate automatically once the domain records point at it.

**Verify:** trigger a deploy (Deploys → Trigger deploy). The build runs
`pnpm nx build web`, publishes `apps/web/dist`, and the site URL serves the
app: a hard refresh on a deep route (e.g. `/login`) returns the SPA (200 via
the fallback), and the response carries the `X-Content-Type-Options`,
`X-Frame-Options` and `Referrer-Policy` headers.

---

## H3 — API + Postgres production host

> **Executed 2026-09-20 — different from the shortlist below.** The user chose
> the zero-cost demo path: **Render free web service** (Oregon, sleeps after
> ~15 min idle) + **Supabase free Postgres** (us-west-2, same region as the
> API on purpose; the project pauses after 7 idle days). `render.yaml` is the
> service contract; DATABASE_URL must use Supabase's **session pooler** URI
> with `sslmode=verify-full&sslrootcert=apps/api/certs/supabase-pooler-ca.crt`
> (direct host is IPv6-only; transaction pooling breaks the per-connection
> role). The netlify.toml `/v1/*` proxy is active. Revisit Fly.io GRU when
> there are paying users. The section below is kept as the original decision
> record.

_(your call — informed by the BOSS shortlist, spec 014 §B-H3)_

Shortlist judged on BR latency, cost and Stripe-webhook reachability:
**Fly.io** (São Paulo/GRU region — the only option with BR compute; managed
Postgres available), **Railway** (best DX, no BR region), **Render** (simple,
no BR region), **Neon** (Postgres only — pairs with a container host),
**Supabase** (Postgres in São Paulo — used purely as managed Postgres).

**BOSS recommendation: Fly.io in GRU for the API container + Fly managed
Postgres** — single vendor, BR latency on both hops. **Fallback: Supabase
São Paulo Postgres** paired with the Fly container if Fly's managed Postgres
disappoints. The steps below are written against the recommendation; for any
alternative, the same four beats apply — provision Postgres, set the
validated env, run migrations as the owner role, deploy the committed image.

1. Install `flyctl`, sign up/in (`fly auth signup` / `fly auth login`).
2. Create the Postgres cluster in GRU (managed Postgres; smallest plan is
   fine to start). Note the connection string.
3. Database roles (the API relies on RLS + `SET ROLE`; migrations must run
   as an owner with `BYPASSRLS` — see `packages/db`):
   - Create `tatame_owner` (`WITH BYPASSRLS`) as the migration owner and set
     `DATABASE_URL` for migration runs to connect as it. The runtime roles
     `tatame_app`/`tatame_platform` are created by the hand-written
     `0000_roles` migration itself.
4. Create the Fly app for the API from the committed artifact:
   `fly launch --no-deploy --dockerfile apps/api/Dockerfile` (build context
   is the repo root), region `gru`, internal port 3000.
5. Set secrets — the zod schema in
   `apps/api/src/infra/config/app-config.ts` is the contract; a misconfigured
   deploy fails loudly at boot:

   ```sh
   fly secrets set \
     NODE_ENV=production \
     DATABASE_URL=<postgres connection string> \
     JWT_ACCESS_SECRET=<random, 32+ chars> \
     TOTP_ENC_KEY=<random, 32+ chars> \
     WEB_URL=https://<your web domain> \
     RESEND_API_KEY=<after H5> \
     RESEND_FROM_EMAIL=<after H5> \
     PAYMENTS_PROVIDER=simulated
   ```

   (`API_PORT`, TTLs default sanely; `PAYMENTS_PROVIDER=stripe` only after
   the H4 stage-2 swap ships.)

6. Run migrations against production (from your machine, `DATABASE_URL`
   pointing at the cluster **as `tatame_owner`**):

   ```sh
   DATABASE_URL=<owner connection string> pnpm --filter @tatame/db run migrate
   ```

   Do **not** run the dev `seed` in production.

7. `fly deploy` (or wire a deploy trigger later — deploy-from-CI is
   deliberately out of the PR pipeline, recorded fog).
8. Point the web app at the API — either activate the `/api/*` proxy in
   `netlify.toml` (uncomment the block, replace `<PRODUCTION_API_ORIGIN>`
   with the Fly app origin, commit, push — recommended: same-origin, no
   CORS) **or** set `VITE_API_URL` in Netlify's production context (H2
   table) and redeploy the site.
9. Stripe webhook URL registration happens in H4 (needs this host's origin).

**Verify:** `curl https://<api origin>/api/health` (or any public endpoint)
answers; the Fly logs show a clean NestJS boot (no zod env errors); logging
into the deployed web app round-trips against the production API (login sets
the refresh cookie; a page reload stays authenticated).

---

## H4 — Stripe live mode + webhook

Prerequisite: H3 (the webhook needs the API origin). Note the current
runtime state honestly: v1 runs `PAYMENTS_PROVIDER=simulated`; the Stripe
Connect driver is a compile-checked stub (spec 006 stage-2). Live keys are
provisioned now so the stage-2 swap is a config flip, not an account chase.

1. Stripe Dashboard → complete live-mode activation (business details, bank
   account for payouts).
2. Copy the live keys: secret `sk_live_…`, publishable `pk_live_…`.
3. Put the secret key in the **API host's secret store only** (H3 vendor,
   e.g. `fly secrets set STRIPE_SECRET_KEY=sk_live_…`). It never enters
   Netlify, EAS, or any client store.
4. Register the webhook endpoint: Dashboard → Developers → Webhooks → Add
   endpoint → `https://<api origin>/api/billing/stripe/webhook` (confirm the
   exact route against the API's billing module when the stage-2 driver
   lands). Subscribe to the events the driver documents. Copy the signing
   secret `whsec_…` into the API host secrets as `STRIPE_WEBHOOK_SECRET`.
5. Distribute the publishable key to the clients: Netlify
   `VITE_STRIPE_PUBLISHABLE_KEY` (production context, H2) and EAS
   `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` (H6).
6. When the stage-2 swap ships: set `PAYMENTS_PROVIDER=stripe` on the API
   host and redeploy.

**Verify:** Stripe Dashboard → Webhooks → the endpoint shows as enabled;
"Send test webhook" reaches the API (2xx once the driver is live; until
then, keys are stored and the endpoint is registered — record that state
here). Live keys appear in exactly one server-side store.

---

## H5 — Resend domain

1. Resend Dashboard → Domains → Add domain → your sending domain (e.g.
   `tatame.app`).
2. Resend emits DNS records (SPF/TXT, DKIM CNAMEs, optional DMARC). Add them
   at your DNS provider (H8 page consolidates all records).
3. Wait for the domain to show **Verified**.
4. Create a production API key and set it on the API host:
   `RESEND_API_KEY=re_…` and `RESEND_FROM_EMAIL=no-reply@<your domain>`
   (must be on the verified domain). Restart/redeploy the API.

**Verify:** trigger a transactional email from the production app (e.g. an
invite); it arrives from the production from-address, and the Resend
dashboard logs it as delivered — not sandboxed.

---

## H6 — Expo / EAS (React Native app)

1. Create the Expo account, install the CLI (`pnpm dlx eas-cli` or global),
   `eas login`.
2. From `apps/mobile-rn`: `eas init` to link the project (slug `tatame` is
   committed in `app.json`; the command writes the EAS `projectId`).
3. Configure `eas.json` build profiles (`preview` = internal distribution,
   `production` = store builds) if not already present.
4. Set build-time env per profile via `eas env` (public prefix only —
   infra-05: no server secrets exist in mobile apps):
   - `EXPO_PUBLIC_API_URL=https://<api origin>` (H3)
   - `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_…` (H4; test key on
     `preview`)
5. First builds: `eas build --profile preview --platform all`, then
   `eas build --profile production --platform all` (production iOS/Android
   builds need the H7 credentials — EAS walks you through signing).
6. EAS release lanes stay out of PR CI (infra-03, recorded); build from the
   CLI until that changes.

**Verify:** the `preview` build installs on a physical device, boots, and
logs in against the production API.

---

## H7 — App Store + Play Console (native apps)

Prerequisites: H3 (apps must point at a live API), H6 for the RN app's
store path (EAS Submit) if you choose to ship it too.

Committed identifiers the store records must match:

| App                                     | Identifier       |
| --------------------------------------- | ---------------- |
| iOS (Swift, `apps/mobile-ios`)          | `app.tatame.ios` |
| Android (Kotlin, `apps/mobile-android`) | `br.com.tatame`  |

Apple:

1. Enroll in the Apple Developer Program (individual or org — _(your call)_).
2. App Store Connect → create the app record with bundle id
   `app.tatame.ios`.
3. Signing: create the distribution certificate + provisioning profile (or
   let Xcode manage). Local release build:
   `xcodegen generate && xcodebuild archive` from `apps/mobile-ios` — CI
   builds stay unsigned (`CODE_SIGNING_ALLOWED=NO`) by design.
4. Upload a first build to TestFlight (internal testing).

Google:

1. Create the Play Console developer account.
2. Create the app with package `br.com.tatame`; opt into Play App Signing;
   generate an upload key and wire it into
   `apps/mobile-android` signing config (keystore stays out of git).
3. Build `./gradlew bundleRelease` and upload the `.aab` to the **internal
   testing** track.

Point both apps' release configuration at the production API origin (Android
Gradle property / iOS xcconfig per infra-05 — API base URL only, never a
secret).

**Verify:** an internal tester installs each app from TestFlight / Play
internal testing and completes login + one check-in against production.

---

## H8 — DNS / domain

Consolidates every record the previous pages emitted. Registrar is
_(your call)_.

1. Buy the domain (e.g. `tatame.app`).
2. Web (H2): add the custom domain in Netlify → follow its DNS instructions
   (either Netlify DNS or a CNAME/ALIAS from your registrar). Netlify then
   provisions HTTPS automatically.
3. API (H3): create the `api.` subdomain record pointing at the API host
   (Fly: `fly certs add api.<domain>` + the CNAME/A records it prints) —
   skip if you activated the Netlify `/api/*` proxy and don't want a public
   API hostname.
4. Email (H5): add the Resend SPF/DKIM/DMARC records.
5. Update the moving parts that embed origins: `WEB_URL` on the API host,
   `VITE_API_URL` or the `netlify.toml` proxy target, `EXPO_PUBLIC_API_URL`
   in EAS, native build configs (H7).

**Verify:** `https://<domain>` serves the web app with a valid certificate;
`https://api.<domain>/api/...` (if exposed) answers; Resend shows the domain
verified; a full login + payment-page load works end-to-end on the custom
domain.
