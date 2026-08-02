# Core entity model

Type: grilling
Blocked by: 01, 02
Status: resolved

## Question

What is the core entity model for the full product? Cover: organizations (academy = tenant, with status Ativa/Trial/Inadimplente/Suspensa), users and role assignments (RBAC across the six personas, including platform team roles Owner/Suporte/Financeiro), guardian↔minor links (1 guardian → N children; minors always linked), turmas (recurring weekly schedule, professor, capacity, belt min/max, enrollment), presenças (unique per class-occurrence per student; method QR/code/manual), events + registrations (free vs paid, per-dependent confirmation), notifications, store (products, orders with status flow), and invite links (7-day validity, academy+class+plan inherited, aluno vs responsável type). Decide table shapes, keys, relationships, and enum vs lookup-table choices, expressed in the chosen ORM's schema idiom and consistent with the chosen tenant-isolation strategy.

## Answer

Resolved by BOSS per charter (`agents/boss.md`), consistent with tickets 01 (Drizzle, schema in `packages/db`) and 02 (single schema + `tenant_id` + RLS via `app.tenant_id`, roles `tatame_app`/`tatame_platform`).

### Global conventions

- snake_case, **plural** table names, English names (`classes` = turmas, `attendances` = presenças, `guardians` = responsáveis).
- PK: `id uuid` — **UUID v7 generated app-side** in Drizzle via `.$defaultFn(() => uuidv7())` (portable to PG < 18; time-ordered so PK index locality is good).
- Every table: `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()` (app-maintained via Drizzle `$onUpdateFn`).
- Money: `*_cents integer` + `currency char(3) DEFAULT 'BRL'` (ticket 05 refines Stripe mapping).
- **Enum vs lookup**: `pgEnum` for closed vocabularies the product owns (statuses, roles, methods, recurrence); **lookup/catalog tables** wherever BOSS requires data-driven extensibility (martial arts, belt ladders, belts, permission toggles).
- **Same-tenant referential integrity**: tenant-scoped parents get `UNIQUE (tenant_id, id)`; tenant-scoped children FK via **composite `(tenant_id, <parent>_id)`**. Rationale: FK checks run as table owner and bypass RLS, so a plain `id` FK could point cross-tenant; composite FKs make that impossible at the constraint level.
- All composite uniques lead with `tenant_id` (per ticket 02); indexes on tenant tables lead with `tenant_id`.

### RLS classification (three classes + auth class)

1. **Tenant-scoped (RLS)** — `tenant_id uuid NOT NULL REFERENCES academies(id)`, `ENABLE`+`FORCE ROW LEVEL SECURITY`, policy `tenant_id = current_setting('app.tenant_id', true)::uuid` (USING + WITH CHECK) for `tatame_app`:
   `memberships`, `role_permissions`, `students`, `guardians`, `classes`, `class_schedules`, `enrollments`, `class_sessions`, `checkin_codes`, `attendances`, `graduation_rules`, `student_graduations`, `events`, `event_registrations`, `academy_plans`, `charges`, `payments`, `product_categories`, `products`, `orders`, `order_items`, `notifications`, `invites`.
2. **Platform-global (no `tenant_id`; platform pool)** — `platform_users`, `platform_plans`, `academy_subscriptions`, `academies`, audit tables (ticket 06). RLS forced with **no default `tatame_app` policy** (fail closed), except narrow read policies: `academies` SELECT `id = app.tenant_id` (own row: name, theme, status); `academy_subscriptions` SELECT `academy_id = app.tenant_id` (admin sees current plan); `platform_plans` SELECT `USING (true)` (public price catalog).
3. **Shared catalogs (no `tenant_id`)** — `martial_arts`, `belt_ladders`, `belts`: SELECT `USING (true)` for `tatame_app`; writes only via platform pool/migrations. Data-driven graduation lives here (ticket 04).
4. **Auth-global (no `tenant_id`)** — `users`, `credentials`, `sessions`, `refresh_tokens`, `password_reset_tokens`. RLS forced; policies: *self* (`id`/`user_id` = `current_setting('app.user_id', true)::uuid`) + on `users` a *membership read* policy (`EXISTS` membership in `app.tenant_id`) so tenant UIs can render member names. Pre-auth lookups (login by email, refresh-token rotation, password reset, invite landing by token) go through a handful of **`SECURITY DEFINER` functions** owned by the migrations role and granted to `tatame_app` — RLS stays forced, the only bypass is a narrow audited signature. Only the NestJS AuthModule touches these tables (same structural-confinement argument as ticket 02's platform pool).

### Auth-critical tables — full column detail

**users** (auth-global) — one global identity; personas come from memberships.
- `id` uuid PK (v7) · `email` text NOT NULL UNIQUE (stored lowercase; citext-equivalent via lower() unique index) · `full_name` text NOT NULL · `phone` text · `birth_date` date · `avatar_url` text · `locale` text NOT NULL DEFAULT 'pt-BR' · `status` pgEnum `user_status` (`active`,`disabled`) DEFAULT 'active' · timestamps.

**credentials** (auth-global) — secrets split from identity.
- `id` PK · `user_id` FK→users NOT NULL · `provider` pgEnum `credential_provider` (`password`) — v1 password only, enum leaves room for OAuth · `secret_hash` text NOT NULL (argon2id) · `last_used_at` timestamptz · timestamps · UNIQUE (`user_id`,`provider`).

**sessions** (auth-global) — one row per device login.
- `id` PK · `user_id` FK→users NOT NULL · `ip` inet · `user_agent` text · `last_seen_at` timestamptz · `revoked_at` timestamptz · timestamps · index (`user_id`).

**refresh_tokens** (auth-global) — rotating tokens within a session; reuse detection.
- `id` PK · `session_id` FK→sessions NOT NULL · `token_hash` text NOT NULL UNIQUE (sha256 of opaque token; raw token never stored) · `expires_at` timestamptz NOT NULL · `consumed_at` timestamptz · `replaced_by_id` FK→refresh_tokens (rotation chain; consumed token presented again ⇒ revoke whole session) · `created_at`.

**password_reset_tokens** (auth-global) — "recuperação de senha" in every persona.
- `id` PK · `user_id` FK→users NOT NULL · `token_hash` text NOT NULL UNIQUE · `expires_at` timestamptz NOT NULL · `used_at` timestamptz · `created_at`.

**memberships** (tenant-scoped) — RBAC row per (user, academy, role); "professor who is also admin" = two rows.
- `id` PK · `tenant_id` FK→academies NOT NULL · `user_id` FK→users NOT NULL · `role` pgEnum `membership_role` (`student`,`professor`,`admin`,`guardian`) NOT NULL · `status` pgEnum `membership_status` (`active`,`suspended`) DEFAULT 'active' · `invite_id` FK→invites NULL (provenance) · timestamps · UNIQUE (`tenant_id`,`user_id`,`role`) · index (`user_id`) (login → resolve academies/surfaces).

**role_permissions** (tenant-scoped) — admin's "permissões por perfil" toggles; permission keys are data, not enum.
- `id` PK · `tenant_id` NOT NULL · `role` `membership_role` NOT NULL · `permission_key` text NOT NULL (e.g. `finance.view`, `students.manage`) · `allowed` boolean NOT NULL · timestamps · UNIQUE (`tenant_id`,`role`,`permission_key`). Hard rules (professor never sees money) enforced in guards regardless of rows here — DB toggles can only restrict, never grant past charter.

**invites** (tenant-scoped; public landing reads via SECURITY DEFINER by token) — 7-day validity, academy+class+plan inherited.
- `id` PK · `tenant_id` NOT NULL · `token_hash` text NOT NULL UNIQUE (opaque URL token, hashed) · `kind` pgEnum `invite_kind` (`student`,`guardian`) NOT NULL · `class_id` composite FK→classes NULL (turma binding) · `academy_plan_id` composite FK→academy_plans NULL (plan binding) · `created_by_user_id` FK→users NOT NULL (professor/admin) · `expires_at` timestamptz NOT NULL (app sets now()+7d) · `max_uses` integer NULL (NULL = unlimited until expiry) · `uses_count` integer NOT NULL DEFAULT 0 · `revoked_at` timestamptz · timestamps.

**academies** (platform-global) — the tenant root.
- `id` PK · `name` text NOT NULL · `slug` text NOT NULL UNIQUE · `city` text · `country` char(2) DEFAULT 'BR' · `status` pgEnum `academy_status` (`trial`,`active`,`delinquent`,`suspended`) NOT NULL DEFAULT 'trial' (Trial/Ativa/Inadimplente/Suspensa; suspension/read-only enforced by app guard per ticket 02) · `contact_email` text NOT NULL · `phone` text · `logo_url` text · `theme` jsonb (3-color white-label palette `{deep,vibrant,accent}`; final settings shape is a map fog item — column reserved, not the settled design) · timestamps.

**platform_users** (platform-global) — SaaS team; reuses global identity so auth stack is one.
- `id` PK · `user_id` FK→users NOT NULL UNIQUE · `role` pgEnum `platform_role` (`owner`,`support`,`finance`) NOT NULL · `status` `user_status` DEFAULT 'active' · timestamps.

### Entity-level model by domain (key columns, relationships, constraints)

**Platform**
- `platform_plans` — `name` (Essencial/Pro/Black), `price_cents`, `currency`, `student_limit` int NULL (NULL = unlimited), `features` jsonb (toggle chips), `is_active`, `sort_order`. Catalog; SELECT-public.
- `academy_subscriptions` — `academy_id` FK, `platform_plan_id` FK, `status` enum (`trialing`,`active`,`past_due`,`canceled`), `current_period_start/end`, **`pending_platform_plan_id`** FK NULL (plan change applies next cycle — charter rule), `canceled_at`. One active per academy (partial unique). Stripe columns land in ticket 05.

**People (tenant)**
- `students` — the person record (may have **no login**: minors, pre-activation). `tenant_id`, `user_id` FK→users NULL + UNIQUE (`tenant_id`,`user_id`), `full_name`, `birth_date` NOT NULL, `guardian_id` composite FK→guardians NULL, `academy_plan_id` composite FK→academy_plans NULL (invite-inherited plan), `status` enum (`active`,`inactive`). Rule "minor ⇒ guardian linked" is app+service enforced (age is time-dependent, not a static CHECK); creation flows (admin form, invite signup) refuse minors without guardian.
- `guardians` — `tenant_id`, `user_id` FK NULL + UNIQUE (`tenant_id`,`user_id`), `full_name`, `phone`, `email`. 1 guardian → N students via `students.guardian_id`.
- Professors/admins are just `memberships` rows; no separate person table.

**Training (tenant)**
- `classes` (turmas) — `name`, `professor_user_id` FK→users (role validated in app), `capacity` int, `min_belt_id`/`max_belt_id` FK→belts NULL, `status` (`active`,`archived`).
- `class_schedules` — recurring weekly slots: `class_id` composite FK, `weekday` smallint 0–6, `start_time` time, `duration_minutes` int; UNIQUE (`tenant_id`,`class_id`,`weekday`,`start_time`). Chips-of-weekdays UI = N rows.
- `enrollments` — `class_id` + `student_id` composite FKs, `status` (`active`,`removed`); UNIQUE (`tenant_id`,`class_id`,`student_id`).
- `class_sessions` — materialized occurrence, created lazily (professor opens roll call / first check-in): `class_id`, `date`, `starts_at` timestamptz, `status` (`scheduled`,`done`,`canceled`); UNIQUE (`tenant_id`,`class_id`,`date`) — one occurrence per turma per day.
- `checkin_codes` — live code/QR per session: `class_session_id` composite FK, `code` text (short human code), `expires_at`, `revoked_at`; partial UNIQUE on (`tenant_id`,`code`) WHERE active.
- `attendances` — `class_session_id` + `student_id` composite FKs, `method` pgEnum `checkin_method` (`qr`,`code`,`manual`), `checked_in_at`, `recorded_by_user_id` FK NULL (professor on manual); **UNIQUE (`tenant_id`,`class_session_id`,`student_id`)** — the charter's check-in-unique rule as a constraint. Append-only; enforcement mechanics in ticket 06.

**Graduation (catalogs shared, rules/history tenant)**
- `martial_arts` (catalog) — `key` (`bjj` seeded v1), `name`.
- `belt_ladders` (catalog) — `martial_art_id` FK, `key` (`adult`,`kids`), `name`. v1 seeds BJJ adult + kids ladders.
- `belts` (catalog) — `ladder_id` FK, `position` int, `name`, `color_tokens` jsonb (design-token refs, not hex — Lumira rule), `max_degrees` int; UNIQUE (`ladder_id`,`position`). New art = insert rows, zero DDL.
- `graduation_rules` (tenant) — per-academy config: `belt_id` FK→belts, `lessons_per_degree` int; UNIQUE (`tenant_id`,`belt_id`). Kids-ladder toggle is academy-level config (ticket 04 decides exact home).
- `student_graduations` (tenant, **immutable append-only**) — `student_id` composite FK, `belt_id` FK→belts, `degree` smallint, `kind` enum (`degree`,`belt`), `awarded_by_user_id` FK NOT NULL, `awarded_at` timestamptz NOT NULL, `notes`. Current belt/degree = latest row (derived vs cached decided in ticket 04); immutability mechanics in ticket 06.

**Events (tenant)**
- `events` — `name`, `description`, `starts_at`, `location`, `price_cents` int NOT NULL DEFAULT 0 (0 = free), `capacity` NULL.
- `event_registrations` — `event_id` + `student_id` composite FKs, `status` (`pending`,`confirmed`,`declined`,`canceled`), `confirmed_by_user_id` FK NULL (guardian confirming per dependent — one row per child = per-dependent confirmation), `charge_id` composite FK NULL (paid events); UNIQUE (`tenant_id`,`event_id`,`student_id`).

**Billing (tenant; details in ticket 05)**
- `academy_plans` — academy→student plans: `name`, `amount_cents`, `currency`, `recurrence` pgEnum `billing_recurrence` (`monthly`,`quarterly`,`yearly`), `is_active`.
- `charges` — `student_id` composite FK, `origin` pgEnum `charge_origin` (`plan`,`event`,`order`), `origin_id` uuid NULL (05 may harden to per-origin FKs), `amount_cents`, `due_date` date, `status` pgEnum `charge_status` (`pending`,`paid`,`overdue`,`canceled`), `recurrence` NULL (from plan). Index (`tenant_id`,`status`,`due_date`) for the admin financial overview.
- `payments` — `charge_id` composite FK, `method` pgEnum `payment_method` (`pix`,`boleto`,`card`), `paid_at`, `amount_cents`, `receipt_url`; Stripe object refs added by ticket 05.

**Store (tenant)**
- `product_categories` — `name`; UNIQUE (`tenant_id`,`name`).
- `products` — `category_id` composite FK NULL, `name`, `description`, `price_cents`, `stock` int (simple stock, low-stock alert app-side; per-size variants out of scope), `images` jsonb, `status` (`active`,`archived`).
- `orders` — `buyer_user_id` FK→users, `status` pgEnum `order_status` (`pending`,`paid`,`ready`,`delivered`,`canceled`) — pago→entregue flow, retirada na recepção, `total_cents`, `charge_id` composite FK NULL.
- `order_items` — `order_id` + `product_id` composite FKs, `quantity`, `unit_price_cents` (price snapshot), `size` text NULL.

**Notifications (tenant)**
- `notifications` — `user_id` FK→users (recipient), `type` text (data-driven key), `title`, `body`, `data` jsonb (deep-link payload), `read_at` timestamptz NULL. Index (`tenant_id`,`user_id`,`read_at`).

### Implications for downstream tickets

- **04 (graduation)**: builds strictly on `martial_arts`/`belt_ladders`/`belts` catalogs + tenant `graduation_rules`/`student_graduations` as shaped here; must decide: derived vs cached current belt, kids-toggle home, per-academy ladder overrides vs shared defaults, dan handling for black/red. No new scoping classes needed.
- **05 (money)**: `charges`/`payments`/`academy_subscriptions`/`platform_plans` shells are fixed (integer cents, statuses above); ticket adds Stripe object columns (customer/subscription/invoice/payment-intent ids, Connect for repasses), settles `charge_origin` polymorphism vs per-origin FKs, and the repasse-retention record for delinquents.
- **06 (audit/immutability)**: `student_graduations` and `attendances` are declared append-only here; 06 picks the mechanism (REVOKE UPDATE/DELETE from `tatame_app` + triggers) and the correction pattern (compensating/void rows), plus the `audit_logs` shape for impersonation, promotions, manual attendance — audit tables live in the platform-global class.
- **07 (seeds)**: two seed kinds fall out of the classification — **catalog seeds** (`martial_arts`, `belt_ladders`, `belts` BJJ adult+kids, default `role_permissions` keys) are production data shipped with migrations/owner role; **dev fixtures** (2 academies for RLS boundary tests, all 6 personas as users+memberships, sample classes/attendances/charges) run via `withTenant` so `WITH CHECK` stays honest.
- **Auth phase (first feature)**: implement exactly the auth-critical set above in `packages/db` — `users`, `credentials`, `sessions`, `refresh_tokens`, `password_reset_tokens`, `memberships`, `role_permissions`, `invites`, `academies`, `platform_users`, `platform_plans`, `academy_subscriptions` + the SECURITY DEFINER auth functions; everything else lands with its feature slice.
