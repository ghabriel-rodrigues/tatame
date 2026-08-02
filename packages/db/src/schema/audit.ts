import { sql } from 'drizzle-orm';
import { index, jsonb, pgPolicy, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { academies } from './academies.js';
import { users } from './auth.js';
import { currentTenantId, id } from './helpers.js';
import { appRole } from './roles.js';

/**
 * Audit trail (AUTH.10): impersonation session starts and every mutating
 * request performed under impersonation. Append-only.
 *
 * RLS class: the only app-side write path is the `audit_append` SECURITY
 * DEFINER seam (0004 migration); tenant members may read their own academy's
 * trail (narrow select policy), platform reads happen on the BYPASSRLS pool.
 * `tenant_id` is NULL for platform-global actions (fail closed for the app).
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: id(),
    /** Academy the action happened in; NULL = platform-global. */
    tenantId: uuid('tenant_id').references(() => academies.id),
    /** Who performed the action (under impersonation: the impersonator). */
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id),
    /** Set when the action ran inside an impersonated session. */
    impersonatorUserId: uuid('impersonator_user_id').references(() => users.id),
    /** e.g. `impersonation.started`, `PUT /v1/admin/permissions`. */
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_logs_tenant_id_idx').on(t.tenantId),
    index('audit_logs_actor_user_id_idx').on(t.actorUserId),
    // Read-only for the active tenant; writes only via audit_append (no
    // insert/update/delete policy — fail closed).
    pgPolicy('audit_logs_tenant_select', {
      for: 'select',
      to: appRole,
      using: sql`${t.tenantId} = ${currentTenantId}`,
    }),
  ],
);
