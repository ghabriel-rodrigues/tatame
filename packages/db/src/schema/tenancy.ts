import { sql } from 'drizzle-orm';
import {
  boolean,
  foreignKey,
  type AnyPgColumn,
  index,
  integer,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { academies } from './academies.js';
import { users } from './auth.js';
import { classes } from './enrollment.js';
import { inviteKind, membershipRole, membershipStatus } from './enums.js';
import { id, timestamps } from './helpers.js';
import { appRole } from './roles.js';

/**
 * Tenant-scoped tables (RLS class 1, ticket 03). Every table carries
 * `tenant_id`, gets a fail-closed tenant policy keyed on the `app.tenant_id`
 * transaction GUC, and `UNIQUE (tenant_id, id)` so children FK via composite
 * `(tenant_id, <parent>_id)` — FK checks bypass RLS, composite keys make
 * cross-tenant references impossible at the constraint level.
 */

const tenantPolicy = (tenantId: AnyPgColumn) => ({
  using: sql`${tenantId} = NULLIF(current_setting('app.tenant_id', true), '')::uuid`,
  withCheck: sql`${tenantId} = NULLIF(current_setting('app.tenant_id', true), '')::uuid`,
});

/**
 * Invite links — the only signup path. 7-day validity (app sets expires_at),
 * academy + class + plan inherited. Public landing/accept go through
 * SECURITY DEFINER functions keyed on the token hash.
 */
export const invites = pgTable(
  'invites',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => academies.id),
    /** Opaque 256-bit URL token, sha256 hash stored. */
    tokenHash: text('token_hash').notNull().unique(),
    kind: inviteKind('kind').notNull(),
    /** Turma binding — composite tenant FK onto `classes` (ENR.3, 001 debt). */
    classId: uuid('class_id'),
    /**
     * Plan binding. Plain uuid until `academy_plans` lands with the billing
     * slice; hardened to a composite tenant FK then.
     */
    academyPlanId: uuid('academy_plan_id'),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** NULL = unlimited uses until expiry. */
    maxUses: integer('max_uses'),
    usesCount: integer('uses_count').notNull().default(0),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique('invites_tenant_id_id_uq').on(t.tenantId, t.id),
    index('invites_tenant_id_idx').on(t.tenantId),
    foreignKey({
      name: 'invites_class_fk',
      columns: [t.tenantId, t.classId],
      foreignColumns: [classes.tenantId, classes.id],
    }),
    pgPolicy('invites_tenant_all', { for: 'all', to: appRole, ...tenantPolicy(t.tenantId) }),
  ],
);

/**
 * RBAC row per (user, academy, role) — "professor who is also admin" is two
 * rows. Besides the tenant policy, users may read their *own* memberships
 * across tenants (login membership resolution and the account switcher need
 * the full list before/outside any tenant context).
 */
export const memberships = pgTable(
  'memberships',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => academies.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    role: membershipRole('role').notNull(),
    status: membershipStatus('status').notNull().default('active'),
    /** Provenance: which invite created this membership. */
    inviteId: uuid('invite_id'),
    ...timestamps,
  },
  (t) => [
    unique('memberships_tenant_user_role_uq').on(t.tenantId, t.userId, t.role),
    unique('memberships_tenant_id_id_uq').on(t.tenantId, t.id),
    index('memberships_user_id_idx').on(t.userId),
    foreignKey({
      name: 'memberships_invite_fk',
      columns: [t.tenantId, t.inviteId],
      foreignColumns: [invites.tenantId, invites.id],
    }),
    pgPolicy('memberships_tenant_all', { for: 'all', to: appRole, ...tenantPolicy(t.tenantId) }),
    pgPolicy('memberships_self_select', {
      for: 'select',
      to: appRole,
      using: sql`${t.userId} = NULLIF(current_setting('app.user_id', true), '')::uuid`,
    }),
  ],
);

/**
 * Admin's per-role permission toggles; keys are data, not enum. Absent row =
 * code default. Hard rules (professor never sees money) are enforced in
 * guards regardless of rows here — toggles can only restrict.
 */
export const rolePermissions = pgTable(
  'role_permissions',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => academies.id),
    role: membershipRole('role').notNull(),
    /** e.g. `finance.view`, `students.manage`, `events.create`. */
    permissionKey: text('permission_key').notNull(),
    allowed: boolean('allowed').notNull(),
    ...timestamps,
  },
  (t) => [
    unique('role_permissions_tenant_role_key_uq').on(t.tenantId, t.role, t.permissionKey),
    unique('role_permissions_tenant_id_id_uq').on(t.tenantId, t.id),
    pgPolicy('role_permissions_tenant_all', {
      for: 'all',
      to: appRole,
      ...tenantPolicy(t.tenantId),
    }),
  ],
);
