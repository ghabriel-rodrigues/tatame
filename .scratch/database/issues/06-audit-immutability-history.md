# Audit & immutability of graduation and attendance history

Type: grilling
Blocked by: 03, 04
Status: resolved

## Question

How is immutability of graduation history (who promoted, when — a BOSS non-negotiable) and attendance history enforced at the schema level — append-only tables, DB triggers/permissions blocking UPDATE/DELETE, event-style records, or application-layer discipline? Also decide the audit trail shape for sensitive actions that must be traceable (platform "entrar como admin" impersonation, promotions, manual attendance edits by professors): what gets audited, in which table(s), and how corrections to genuinely wrong records happen without violating immutability (compensating records vs annotated voids).

## Answer

Resolved by BOSS per charter (AFK). Builds strictly on the shipped audit seam (migrations `packages/db/drizzle/0003_auth_context.sql`, `0004_auth_seams_v2.sql`, `0005_audit_tenant_select.sql`): `audit_logs` + `audit_append()` are NOT redesigned — this ticket extends their usage policy and locks the append-only mechanics for `student_graduations` and `attendances` (tables land in the Phase-4 migration; they do not exist yet). Ticket 04 is still open, but its remaining sub-decisions (derived vs cached current belt, kids toggle home) do not change these mechanics; one interaction is flagged below.

### Decision 1 — mechanism: REVOKE + guard trigger (both, layered), not either/or

1. **Grants are the primary mechanism.** On `student_graduations` and `attendances`: `GRANT SELECT, INSERT` to `tatame_app`; **no UPDATE, no DELETE grant** (and none to `tatame_platform` either — platform reads only). RLS policies on both tables are therefore SELECT + INSERT (`WITH CHECK tenant_id = app.tenant_id`) only — no UPDATE/DELETE policies exist, so even a future grant mistake fails closed at the policy layer.
2. **A shared guard trigger is the backstop.** One `forbid_mutation()` plpgsql function + `BEFORE UPDATE OR DELETE` trigger on both tables raising an exception. It protects against role drift, console sessions as the owner role, and future SECURITY DEFINER functions that would otherwise silently bypass grants+RLS (definer fns run as owner). The single sanctioned exception: on `attendances`, the trigger permits an UPDATE **only** when the sole change is `revoked_at`/`revoked_by_user_id` going from NULL to non-NULL (the void seam below). On `student_graduations` the trigger is unconditional — no UPDATE ever.
3. **App-layer discipline alone: rejected** (one forgotten `where`/`update` = falsified belt history; fails the charter non-negotiable). Event-sourcing tables: rejected as ceremony — the append-only base tables *are* the event log for this domain.

### Decision 2 — corrections, product-wise

**Attendance (chamada manual toggle — professor-14 / handoff "toggle presença"):**
- Toggle ON = plain INSERT (existing flow). Toggle OFF is not an edit of history; it is a **void annotation**: a `attendance_revoke(p_tenant_id, p_attendance_id, p_revoked_by)` SECURITY DEFINER function (same seam pattern as `audit_append`) sets `revoked_at`/`revoked_by_user_id`. The row never disappears; `checked_in_at`, `method`, `student_id`, `recorded_by_user_id` never change.
- **Window rule (allowed-UPDATE-window question): the void seam, not raw UPDATE, is the window.** Professor may revoke only while the session's local date is the current date (checked inside the function against `class_sessions.date`, tenant timezone); after the day closes only an **admin** may revoke (any time, always audited). Rationale: same-day toggle-off is normal roll-call operation per the handoff; post-day changes are corrections and get the heavier trail.
- Re-check-in after a revoke = a **new INSERT** (compensation row), so ticket 03's `UNIQUE (tenant_id, class_session_id, student_id)` becomes a **partial unique index `WHERE revoked_at IS NULL`** — "check-in unique per class per student" now means one *active* check-in. Effective attendance = rows with `revoked_at IS NULL`; graduation lesson-counting and the live counter (backend ticket 09) count active rows only.
- New columns on `attendances` (Phase-4 migration): `revoked_at timestamptz NULL`, `revoked_by_user_id uuid NULL FK→users`.

**Graduation (no window — charter: history immutable):**
- Wrong promotion → **compensation rows, never mutation**: insert a reversal row `kind='revocation'` with `reverses_graduation_id FK→student_graduations NOT NULL` (self-FK, same tenant via composite FK), then optionally insert the correct promotion. Extend ticket 03's `kind` enum (`degree`,`belt`) with `revocation`; add `reverses_graduation_id uuid NULL` (NOT NULL enforced by CHECK when `kind='revocation'`; partial unique on `reverses_graduation_id` so a row is reversed at most once).
- Admin-only, always audited. **Interaction with ticket 04**: "current belt = latest row" must become "latest non-reversed award row"; if 04 opts for a cached current belt on `students`, the revocation service recomputes the cache in the same transaction.

### Decision 3 — audit policy extension (shape unchanged)

`audit_logs` (0003) + `audit_append()` (0004) + tenant SELECT policy (0005) are reused as-is; `metadata jsonb` absorbs per-action detail, no schema change. **Action registry additions** (in `packages/shared` codes, written via `audit_append` in the same transaction as the domain write):
- `graduation.awarded` (metadata: belt_id, degree, kind), `graduation.revoked` (metadata: reverses_graduation_id, reason) — **all** graduation mutations, always.
- `attendance.recorded_manual` (professor manual toggle-on; metadata: class_session_id, student_id), `attendance.revoked` (metadata: attendance_id, window: same_day|admin_late, reason).
- QR/code **self** check-ins are NOT audited — high volume, the attendance row itself is the traceable record (`method`, `checked_in_at`); auditing them would double-write every check-in for zero forensic gain.
- Existing AUTH actions (impersonation session mint, `AuditInterceptor` on impersonated mutations) unchanged; impersonated graduation/attendance mutations naturally carry `impersonator_user_id` because `audit_append` already takes it.
- **Immutability of the audit itself**: apply the same treatment to `audit_logs` — no UPDATE/DELETE grants or policies (already true: only the 0005 SELECT policy exists; writes only via `audit_append`), plus the unconditional `forbid_mutation()` trigger.
- **Retention**: keep forever in v1 (it is the compliance record backing the charter's immutability rule); partitioning/archival and the LGPD-erasure posture stay with the map's existing LGPD fog item — erasure requests will pseudonymize `metadata`, never delete rows.

### RLS-role interaction summary

| Table | tatame_app | tatame_platform | writes path |
|---|---|---|---|
| `attendances` | SELECT + INSERT (tenant policy) | SELECT | INSERT via repo; void only via `attendance_revoke` seam |
| `student_graduations` | SELECT + INSERT (tenant policy) | SELECT | INSERT via repo (award + revocation rows) |
| `audit_logs` | SELECT (own tenant, 0005) | SELECT | `audit_append` seam only |

SECURITY DEFINER seams bypass RLS by nature, so `attendance_revoke` (like `audit_append`) takes `p_tenant_id` explicitly and validates the target row's tenant — the CI meta-test from ticket 02 extends: every definer function touching tenant tables must filter by an explicit tenant parameter.

### Testing hooks (Phase-4)

- Testcontainers: as `tatame_app`, assert UPDATE/DELETE on both tables fail (grant + policy + trigger each verified independently); assert `attendance_revoke` refuses professor after day-close and cross-tenant ids; assert partial unique allows re-check-in only after revoke; assert revocation row cannot target an already-reversed graduation.
- Meta-test: any table declared append-only (registry in `packages/db`) must have the trigger + no UPDATE/DELETE grants/policies — new append-only tables can't ship unguarded.
