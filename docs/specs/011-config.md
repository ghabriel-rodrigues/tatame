# 011 — White-label Config (Phase 11)

Status: ready-for-agent
Personas covered: Admin da academia, Aluno, Professor, Responsável, Convite (branding consumer)

Follows the to-spec template. UI truth: admin-15-config-identidade (Configurações hub — identidade visual, paleta de cores, toggles, entry rows), admin-17-permissoes (per-role toggle groups), aluno-21-tema-escuro-inicio (dark shell visual truth). Business truth: handoff README ("identidade white-label — nome, logo, **paleta de cores** — retematiza o app todo"; "Tema escuro funcional — switch no Aluno e no Admin"; white-label = whole palette derived from 3 colors). Engine truth: the design-system theming module shipped by Phase 2 (`derivePalette` canonical TS + Kotlin/Swift ports pinned by golden fixtures, `applyBrand`, `createTatameTheme`, 4 ready-made presets, static dark token set) and the decisions closed in the design-system grilling tickets 03 and 06.

## Problem Statement

The white-label promise is the reason an academy puts its own name on Tatame, and every layer below the surface already keeps it: the academy record carries a branding placeholder, `/auth/me` and the public invite landing serve a `theme` field, the design system derives the entire palette from 3 colors with byte-identical output on all four clients, and the invite flow already retemas itself from the landing payload. But no admin can *set* any of it — the placeholder column is an untyped stub that nothing writes, the admin console has no Configurações surface, so every academy is stuck on the default Lumira purple forever.

The same orphaning happened twice more in the config area. The per-role permission toggles have had real endpoints since Phase 1 (`GET/PUT /admin/permissions`, enforced by the API guard on every gated route) — but the admin-17 screen was never built, so the only academy-level RBAC dial in the product is invisible. And the dark theme the handoff calls "funcional" ships as a complete token set with `derivePalette` dark anchors wired through every client theme engine — yet the aluno perfil switch is decorative and no client can actually flip modes. Phase 10 additionally deferred the "Notificações automáticas" academy toggle to this phase, explicitly recorded.

## Solution

Finalize the branding storage as three typed hex columns on the academy (replacing the "shape not final" jsonb placeholder), serve them typed through the session and invite payloads that already carry the field, and give the admin the Configurações hub per admin-15: an identidade card with academy name edit, monogram logo tile (upload stays recorded debt) and the 4 preset palette swatches with **live preview** — picking a palette calls `derivePalette` + `applyBrand` locally so the console rebrands under the admin's cursor before saving; saving persists the triplet (audited) and every client of that academy retemas on next session load. The hub also carries the toggle block (Tema escuro real, Notificações automáticas wired to a new academy flag that gates the Phase-10 fan-out, check-in por geolocalização rendered disabled as the stub it is) and the entry rows — Permissões por perfil to the new admin-17 screen (role groups with member counts, toggle rows straight onto the existing endpoints), plus links to the already-shipped Planos de mensalidade and Regras de graduação pages and a static Integrações de pagamento stub row.

Dark theme lands as decided in design-system ticket 06 (resolved with this spec): a **per-user, client-side preference** — no academy column, no server involvement. The aluno perfil "Tema escuro" switch becomes real on RN, Android and iOS (persisted locally, whole shell flips to the dark token set overlaid with the academy brand per aluno-21), and the admin console gets the same switch in Configurações (localStorage, `data-theme` flip + dark MUI theme). Finally, all three mobile clients start consuming the academy brand from the session — RN feeds its ThemeProvider, Android builds its Compose color scheme through its `DerivePalette` port, iOS constructs its themed environment — each caching the last brand locally so the first frame after cold start already wears the academy's colors.

## User Stories

### Admin — Configurações hub (admin-15)

1. As an academy admin, I want a Configurações page ("Identidade, tema e permissões da academia"), so that everything academy-level lives in one place.
2. As an academy admin, I want an "Identidade visual" card with my academy's monogram tile and name in an editable field, so that the academy presents itself with its own name.
3. As an academy admin, I want a disabled "Logo" action on the identidade card, so that the future upload is visible but honestly not available (monogram stays the v1 logo).
4. As an academy admin, I want a "Paleta de cores" picker with the four ready-made palettes (Lumira, Oceano, Mata, Ouro) as three-dot swatches with the active one highlighted, so that choosing a brand is one tap, exactly per admin-15.
5. As an academy admin, I want the console to **re-theme live** as I select a palette — before saving — so that I preview exactly what my students will see.
6. As an academy admin, I want Salvar to persist name + palette and Cancelar/leave to revert the preview to the saved brand, so that experimenting is safe.
7. As an academy admin, I want my saved palette to re-theme the whole product for everyone in my academy — mobile shells, invite landing, my own console — so that white-label means the entire app, not a logo corner.
8. As an academy admin, I want a "Tema escuro" switch that flips my console to the dark theme and remembers my choice on this browser, so that the handoff's admin dark switch is real.
9. As an academy admin, I want a "Notificações automáticas" switch that actually gates the automatic notification fan-out for my academy, so that the Phase-10 deferral is closed and the toggle does what it says.
10. As an academy admin, I want the "Check-in por geolocalização" row rendered with a disabled switch, so that the roadmap item is visible without pretending to work.
11. As an academy admin, I want entry rows for "Permissões por perfil" and "Integrações de pagamento" (static "Pix ativo" stub) plus the "Planos de mensalidade" and graduation-rules sections reachable from the hub, so that the admin-15 information architecture is complete without rebuilding pages that already shipped.

### Admin — Permissões por perfil (admin-17)

12. As an academy admin, I want a "Permissões por perfil" screen grouping toggles under Professor, Aluno and Responsável chips, so that what each role can do in my academy is one screen.
13. As an academy admin, I want each role group to show how many people hold that role ("2 pessoas neste papel"), so that I know the blast radius of a toggle.
14. As an academy admin, I want each toggle row labeled in plain PT-BR (registrar presença, atualizar graduações, ver pagamentos das turmas, gerar link de convite, criar eventos, check-in pelo próprio celular, ver agenda de todas as turmas, comprar na loja, cadastrar dependentes, pagar mensalidades, confirmar eventos pelos filhos, …), so that the screen matches admin-17 with the registry as the single source of rows.
15. As an academy admin, I want flipping a toggle to persist immediately and be enforced by the API on the very next request of the affected role, so that the switch is a real permission, not a preference.
16. As an academy admin, I want my permission changes rejected for unknown keys and scoped to my academy only, so that the matrix can never drift from the registry or leak across tenants.

### Aluno — tema escuro + branding

17. As an aluno, I want the "Tema escuro" switch in my perfil to actually flip the entire shell — home, agenda, carteira, loja, perfil — to the dark theme per aluno-21, so that the decorative switch finally works.
18. As an aluno, I want my theme choice remembered across app restarts on my device, so that I set it once.
19. As an aluno, I want the dark theme to keep my academy's brand colors (dark surfaces, brand-derived scales on top), so that dark mode is still my academy's app.
20. As an aluno, I want the status bar and system chrome to follow the theme, so that dark mode has no white flashes.
21. As an aluno, I want my academy's palette applied from the moment the app opens (cached from my last session, refreshed on login), so that the app never flashes default purple before rebranding.

### Professor / Responsável — branding

22. As a professor, I want my shell rendered in my academy's palette from the session, so that the white-label reaches every persona (dark toggle for my persona stays design backlog).
23. As a responsável, I want the same academy branding on my shell, so that the guardian surface matches what my child sees.

### Convite / cross-cutting

24. As a convidado opening an invite link, I want the landing already in the academy's saved colors, so that the first touchpoint is branded (flow exists; it now renders real saved palettes instead of forever-null).
25. As a user of an academy that never configured branding, I want the default Tatame purple everywhere, so that null branding is indistinguishable from the default brand.
26. As a user with memberships in two academies, I want each session context to wear its own academy's brand, so that brands never bleed across tenants.
27. As the platform owner, I want the plataforma console permanently on the default Tatame brand, so that the SaaS surface is never white-labeled by a tenant.
28. As any client, I want identical derived colors on web, RN, Android and iOS for the same 3 saved colors, so that the academy's brand is one brand (golden fixtures already pin this; the session wiring must not bypass `derivePalette`).

## Implementation Decisions

### Schema — finalize the placeholder, one new flag

- The academy record's `theme jsonb` placeholder (marked "shape not final" since Phase 1) is **replaced by three typed nullable text columns**: `brand_deep`, `brand_vibrant`, `brand_accent`, each with a `#RRGGBB` uppercase-hex CHECK constraint and an all-or-none CHECK (either all three set or all three NULL). Typed columns beat jsonb here: the shape is final (`BrandInput` is a shipped cross-platform contract), validation lives in the database, and no client ever parses an untyped blob. NULL triplet = academy uses the default Tatame brand; no row is ever seeded with the default values (null *is* the default, so a future default-brand change reaches unconfigured academies automatically).
- `logo_url` stays as-is and stays NULL in v1 — the logo is the monogram/initials rendered client-side from the academy name (BrandLogo precedent); upload is recorded debt.
- **`auto_notifications_enabled boolean NOT NULL DEFAULT true`** on the academy — the admin-15 "Notificações automáticas" toggle, explicitly deferred to this phase by spec 010. Academy-level (not per-user — that flag already exists on memberships): when off, the notification fan-out listeners skip insertion tenant-wide.
- **No `dark_theme_enabled` column.** Dark theme is a per-user, client-side preference (design-system ticket 06, resolved with this spec); the prototype's academy-level availability toggle is dropped as a prototype-only affordance. Decision recorded here so the drop is never silent.
- Academy name already exists and is simply updatable; slug is immutable (invite URLs depend on it).

### Backend — one admin endpoint pair, typed payloads, gated fan-out

- **`GET /admin/academy` / `PUT /admin/academy`** (admin role, active academy context): payload is `{ name, brand: { deep, vibrant, accent } | null, autoNotificationsEnabled }`. PUT validates name (trimmed, 2–80 chars) and the brand triplet (each `#RRGGBB`, case-normalized to uppercase; `brand: null` clears back to default). The API accepts **any** valid hex triplet — the v1 web UI only offers the four presets, but the contract is general so custom palettes are a UI-only unlock later.
- PUT is **audited** via the existing identity audit seam (impersonation/permissions precedent): action `academy.updated` with before/after of the changed fields, actor from the auth context.
- `/auth/me` and the public invite landing already select and serve the academy `theme` field — the placeholder now becomes the **typed `BrandInput` shape** (`{ deep, vibrant, accent } | null`) assembled from the three columns. Field name `theme` is kept on both payloads (shape change only, from `unknown`); OpenAPI and the shared types package are regenerated so all clients consume it typed. `logoUrl` keeps riding along, null in v1.
- **Notifications gate**: the Phase-10 fan-out listeners check `auto_notifications_enabled` once per event (inside the listener's tenant context) and skip the batch insert when off — no rows written, catch-and-log unchanged. The per-user mute semantics from 010 (rows written, badge suppressed) are untouched; the academy flag is a harder switch and that asymmetry is intentional: the user flag preserves personal history, the academy flag turns the feature off wholesale.
- **Permissions matrix response gains member counts**: the existing `GET /admin/permissions` response is extended with a per-role count of active memberships (professor/student/guardian) so the admin-17 group headers ("N pessoas neste papel") need no second endpoint. `PUT` is untouched — registry-key validation and enforcement via the permissions guard already exist since AUTH.9.

### Theming propagation — the engine is shipped, this phase wires sessions to it

Per design-system tickets 03 (resolved) and 06 (resolved with this spec): derivation is client-side at runtime, one canonical `derivePalette` (TS) + fixture-pinned Kotlin/Swift ports; dark = static dark token set first, `derivePalette(brand, 'dark')` overlay second; dark preference is per-user, client-side, explicit two-state (default light; system-scheme follow is recorded debt).

- **Web**: brand application moves from a boot-time constant to a session-driven effect — on login, silent restore, and academy-context change, the session's `academy.theme` (fallback default brand) feeds `derivePalette` → `applyBrand` + a rebuilt MUI theme. Plataforma sessions and logged-out surfaces always use the default brand. The invite flow's scoped brand handling stays as shipped. Dark mode flips the `data-theme="dark"` attribute (both CSS variable layers already key off it) and swaps the memoized theme for the dark one; preference in localStorage.
- **React Native**: the root ThemeProvider (already accepting `brand` and `mode` props) is finally fed: brand from the session's academy theme, mode from a persisted preference store. The last seen brand is cached in AsyncStorage and hydrated before first render so cold start paints branded; login/refresh updates the cache. All three shells (aluno, professor, responsável) inherit the brand from the root; only the aluno shell exposes the mode switch. Status bar style derives from the active mode instead of the current hardcoded flip.
- **Android**: the Compose theme entry currently builds static color schemes with a system-dark default — it now accepts the session brand, builds the color scheme from the `DerivePalette` port output (fixtures already pin equality with TS), and takes the mode from a DataStore-persisted preference (explicit toggle replaces `isSystemInDarkTheme()` as the default source in v1). Last brand cached in DataStore for branded cold start.
- **iOS**: the SwiftUI theme environment already takes `(brand, mode)` — the app scaffold constructs it from the session brand and a UserDefaults-persisted mode, same cache-then-refresh pattern.
- **Custom palettes**: admin-15 shows exactly four preset swatches — v1 ships **presets only**; color pickers / free hex inputs are out of scope (the API contract already permits them, so the unlock is UI-only).

### Web — the two new admin screens

- **`/admin/configuracoes`** (console nav gains its Config entry, per the admin prototype's nav): header "Configurações" + subtitle; Identidade visual card (monogram tile from academy initials, name FormField, disabled Logo button, four preset swatches rendered as the three-dot chips with the selected ring); toggle card (Tema escuro — real; Notificações automáticas — wired to the academy flag via the new endpoint; Check-in por geolocalização — disabled switch, stub); entry rows: Permissões por perfil → `/admin/permissoes`, Integrações de pagamento → static "Pix ativo" trailing label (no page), Planos de mensalidade → the shipped plans page, Regras de graduação → the shipped graduation-rules page (hub links rather than re-embedding, since both screens exist; admin-15's inline plans block is satisfied by the link row).
- Live preview: selecting a swatch immediately applies the derived palette to the document and swaps the MUI theme; Salvar issues the PUT and keeps it; navigating away or Cancelar re-applies the saved session brand. Save updates the cached session academy so the console does not need a re-login to stay branded.
- **`/admin/permissoes`**: back-arrow header per admin-17; one card per role (Professor, Aluno, Responsável) with role chip + "N pessoas neste papel"; toggle rows from the matrix response (labels come from the registry through the API — the screen renders whatever the registry defines, no client-side row list to drift); each flip PUTs the single entry optimistically with rollback on error.

### Mobile — the aluno dark switch

- The aluno perfil's existing "Tema escuro" row (moon icon, switch) flips the persisted mode; the whole shell re-renders on the dark token set + brand overlay per aluno-21 (dark glass tab bar, dark cards, brand gradients intact). No account-level sync — the preference is per device, matching the client-side decision.
- Professor and responsável perfis keep their decorative rows if present but ship no functional toggle (design backlog per handoff); their shells still get branding.
- Admin has no mobile surface (console-only redirect), so mobile carries no admin config work.

## Testing Decisions

- Same doctrine as specs 001–010 (their suites are the prior art): externally observable behavior through the API against real Postgres with RLS active; theming asserted through the public design-system contract, never by inspecting internals.
- Backend e2e: GET/PUT `/admin/academy` happy path; hex validation (reject `#GGG…`, shorthand, missing `#`, partial triplet), name validation; case normalization; `brand: null` clears; audit row written with actor and before/after; RBAC (professor/aluno/platform → 403/404 per the established matrix) and cross-tenant isolation via the fail-closed meta-test pattern; `/auth/me` and the invite landing serve the typed brand after a PUT (and null before); permissions matrix response carries correct per-role counts; fan-out gate — with `auto_notifications_enabled` off, a real emitting flow (e.g. plan materialization) writes zero notification rows, flipping it back on resumes, per-user mute semantics unchanged.
- Design-system: the golden-fixture suites already pin `derivePalette` and both ports — no new fixtures needed; any new preset would extend the fixture file, none is added.
- Web: page specs per the established pattern — configuracoes (swatch select applies preview, Salvar persists, Cancelar reverts, disabled stub rows, dark toggle flips `data-theme` and persists), permissoes (groups + counts render from the matrix, toggle PUT + optimistic rollback), session-brand effect (login with branded academy applies palette; plataforma session stays default).
- Mobile (each client): unit test for the brand-cache hydrate/refresh logic and the mode-preference store; one integration test per client — session with academy brand renders branded shell, perfil switch flips to dark and survives relaunch (persisted). Kotlin/Swift theme construction from a `BrandInput` asserts against the shared fixture hexes.

## Out of Scope

- Logo upload and any file storage — the monogram tile is the v1 logo; the Logo button renders disabled. Recorded debt.
- Custom palettes in the UI (color pickers / hex inputs) — four presets only, per admin-15; the API contract already accepts arbitrary hex so this is a later UI-only unlock.
- Check-in por geolocalização — disabled stub row only (handoff design backlog).
- Integrações de pagamento — static "Pix ativo" stub row, no screen, no settings.
- Dark theme toggles for Professor, Responsável and Plataforma personas (handoff design backlog; token layer already supports them), account-synced theme preference, and system-scheme follow (explicit toggle only in v1).
- Academy-level `dark_theme_enabled` — dropped by decision, recorded above.
- Platform-side branding (SaaS console theming, per-academy branding management from the plataforma persona) and any server-side palette derivation.
- Permission registry changes — the screen renders the registry as-is; adding/removing permission keys is not this phase.

## Further Notes

- This phase closes design-system ticket 06 (resolved inline with this spec) and consumes ticket 03's storage/tenant-flow section exactly as written: payload stays 3 colors, derivation stays client-side, presets ship as the picker.
- Spec 010's deferred "Notificações automáticas" academy toggle lands here — update the README note that recorded the deferral.
- The `theme` jsonb → typed columns migration has no data to migrate (nothing ever wrote the placeholder); the DTO field name `theme` is preserved so client churn is shape-only.
- Delivery follows the fixed order DB → backend → web → mobiles; the checklist below is mirrored into the root README, and checking a box there is the only "ticket closing" this project has.

## Delivery Checklist

- [ ] CFG.1 DB: academies branding finalized — `theme` jsonb placeholder replaced by `brand_deep`/`brand_vibrant`/`brand_accent` (nullable, `#RRGGBB` CHECK, all-or-none) + `auto_notifications_enabled boolean NOT NULL DEFAULT true`; `logo_url` untouched (NULL in v1); no dark-theme column (decision recorded)
- [ ] CFG.2 DB: dev seeds — second fixture academy saved on a non-default preset (Oceano) so cross-tenant white-label is demoable on first login
- [ ] CFG.3 Backend: typed brand in payloads — `/auth/me` `academy.theme` and public invite landing `theme` served as `{deep,vibrant,accent}|null` from the new columns; OpenAPI + shared types regenerated
- [ ] CFG.4 Backend: `GET/PUT /admin/academy` — name + brand triplet + autoNotificationsEnabled, hex/name validation with case normalization, `brand:null` clears, audited update, admin-only
- [ ] CFG.5 Backend: notification fan-out gated on `auto_notifications_enabled` (closes the 010 deferral — no rows written when off; per-user mute semantics untouched)
- [ ] CFG.6 Backend: `GET /admin/permissions` response extended with per-role active-member counts (admin-17 group headers)
- [ ] CFG.7 Backend: e2e suite green — branding validation/audit/RBAC/cross-tenant, me + invite propagation, fan-out gate via a real emitting flow, permission counts
- [ ] CFG.8 Web: session-driven branding — `derivePalette` + `applyBrand` + MUI theme rebuilt from the session academy brand on login/restore/context change; default brand for plataforma and logged-out; invite flow unchanged
- [ ] CFG.9 Web: `/admin/configuracoes` hub per admin-15 — identidade card (monogram, name edit, 4 preset swatches with live preview, Salvar/Cancelar revert), toggles (Tema escuro, Notificações automáticas wired, geolocalização disabled stub), entry rows to Permissões/Integrações-stub/Planos/Regras de graduação
- [ ] CFG.10 Web: console dark theme — `data-theme` flip + dark MUI theme from the config toggle, persisted in localStorage
- [ ] CFG.11 Web: `/admin/permissoes` per admin-17 — role groups with member-count chips, registry-driven toggle rows on the existing GET/PUT with optimistic save + rollback
- [ ] CFG.12 RN: brand wiring — root ThemeProvider fed from the session academy brand with AsyncStorage last-brand cache (branded cold start, Tatame fallback); all three shells inherit
- [ ] CFG.13 RN: aluno perfil Tema escuro switch real — persisted mode, full dark shell per aluno-21, status bar follows mode
- [ ] CFG.14 Android: brand wiring — Compose color scheme built from the DerivePalette port on the session brand, DataStore last-brand cache
- [ ] CFG.15 Android: aluno Tema escuro switch — explicit DataStore-persisted preference replaces the system-dark default (system follow = recorded debt)
- [ ] CFG.16 iOS: brand wiring — TatameTheme environment constructed from the session brand with UserDefaults last-brand cache
- [ ] CFG.17 iOS: aluno Tema escuro switch — persisted mode through the theme environment, full dark shell
