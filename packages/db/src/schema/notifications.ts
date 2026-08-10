import { sql } from 'drizzle-orm';
import {
  index,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { academies } from './academies.js';
import { users } from './auth.js';
import { notificationCategory } from './enums.js';
import { id, timestamps } from './helpers.js';
import { appRole } from './roles.js';

/**
 * Notifications slice (spec 010, NOT.1) — the central in-app feed each
 * prototype renders (aluno-20, responsavel-09, the admin console bell): one
 * row per recipient user, written exclusively by the backend notifications
 * module's fan-out listeners (be-01: listener-only concern).
 *
 * Tenant-scoped (RLS class 1): fail-closed tenant policy on the
 * `app.tenant_id` GUC, `UNIQUE (tenant_id, id)` per convention. RLS is FORCED
 * in the hardening migration (mirrors 0002/0022). Personal scoping
 * (`user_id = ctx.userId`) is service-enforced on top of the uniform tenant
 * policy, matching how every persona endpoint already scopes (recorded
 * delta vs database ticket 03).
 */

const tenantPolicy = (tenantId: AnyPgColumn) => ({
  using: sql`${tenantId} = NULLIF(current_setting('app.tenant_id', true), '')::uuid`,
  withCheck: sql`${tenantId} = NULLIF(current_setting('app.tenant_id', true), '')::uuid`,
});

/**
 * One notification row per recipient. Render-ready PT-BR text composed
 * server-side at insert time (`title`/`body`); `chip` is the pre-rendered
 * chip label from the prototypes (`"R$"`, `"15"`, `"2º"`, initials —
 * nullable, clients fall back to a category icon); `route` is a SEMANTIC
 * deep-link hint (`wallet`, `event/{eventId}`, `graduation`, `orders`,
 * `store`) mapped to each shell's local navigation client-side, so DB rows
 * never encode router paths. `read_at` NULL = unread (the badge predicate).
 *
 * Recipient is a plain FK to the auth-global `users` (same precedent as
 * `orders.buyer_user_id`) — recipients without a login are skipped by
 * fan-out, so every row is addressable. Retention: rows older than 180 days
 * are prunable; the pruning job is recorded debt (v1 ships policy only).
 */
export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => academies.id),
    /** Recipient — auth-global user id (fan-out skips login-less people). */
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    category: notificationCategory('category').notNull(),
    /** Pre-rendered chip label; NULL = client falls back to a category icon. */
    chip: text('chip'),
    title: text('title').notNull(),
    body: text('body'),
    /** Semantic deep-link hint; NULL/unknown routes are inert client-side. */
    route: text('route'),
    /** NULL = unread — the bell-badge predicate. */
    readAt: timestamp('read_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique('notifications_tenant_id_id_uq').on(t.tenantId, t.id),
    // The feed list: own rows, newest first, cursor-paged.
    index('notifications_tenant_user_created_idx').on(
      t.tenantId,
      t.userId,
      t.createdAt.desc(),
    ),
    // The badge count: partial index over unread rows only.
    index('notifications_tenant_user_unread_idx')
      .on(t.tenantId, t.userId)
      .where(sql`${t.readAt} IS NULL`),
    pgPolicy('notifications_tenant_all', {
      for: 'all',
      to: appRole,
      ...tenantPolicy(t.tenantId),
    }),
  ],
);
