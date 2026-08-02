import { sql } from 'drizzle-orm';
import {
  char,
  boolean,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { academies } from './academies.js';
import { users } from './auth.js';
import { platformRole, subscriptionStatus, userStatus } from './enums.js';
import { id, timestamps } from './helpers.js';
import { appRole } from './roles.js';

/**
 * Platform-global tables (RLS class 2, ticket 03). No tenant_id; written only
 * via the `tatame_platform` pool (BYPASSRLS). `tatame_app` gets either no
 * policy (fail closed — platform_users) or a narrow read policy.
 */

/** SaaS team member; reuses global identity so the auth stack is one. */
export const platformUsers = pgTable('platform_users', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id),
  role: platformRole('role').notNull(),
  status: userStatus('status').notNull().default('active'),
  /**
   * Opt-in TOTP (RFC 6238), platform staff only. Secret encrypted at rest by
   * the API (AES-256-GCM under TOTP_ENC_KEY); set at setup, armed at enable.
   */
  totpSecret: text('totp_secret'),
  totpEnabledAt: timestamp('totp_enabled_at', { withTimezone: true }),
  /** Array of sha256 hex hashes of single-use recovery codes. */
  totpRecoveryCodes: jsonb('totp_recovery_codes'),
  ...timestamps,
}).enableRLS();

/** Platform -> academy plan catalog (Essencial / Pro / Black). Public prices. */
export const platformPlans = pgTable(
  'platform_plans',
  {
    id: id(),
    name: text('name').notNull().unique(),
    priceCents: integer('price_cents').notNull(),
    currency: char('currency', { length: 3 }).notNull().default('BRL'),
    /** NULL = unlimited students. */
    studentLimit: integer('student_limit'),
    /** Feature toggle chips shown on the plan card. */
    features: jsonb('features'),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  () => [
    pgPolicy('platform_plans_public_select', {
      for: 'select',
      to: appRole,
      using: sql`true`,
    }),
  ],
);

/**
 * Academy subscription to a platform plan. Plan change applies next cycle
 * (charter rule) via `pending_platform_plan_id`. Stripe columns land in the
 * billing slice (ticket 05).
 */
export const academySubscriptions = pgTable(
  'academy_subscriptions',
  {
    id: id(),
    academyId: uuid('academy_id')
      .notNull()
      .references(() => academies.id),
    platformPlanId: uuid('platform_plan_id')
      .notNull()
      .references(() => platformPlans.id),
    status: subscriptionStatus('status').notNull().default('trialing'),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    /** Plan change applies next billing cycle. */
    pendingPlatformPlanId: uuid('pending_platform_plan_id').references(() => platformPlans.id),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    // At most one live subscription per academy.
    uniqueIndex('academy_subscriptions_one_live_uq')
      .on(t.academyId)
      .where(sql`${t.status} IN ('trialing', 'active', 'past_due')`),
    // The academy admin sees its own current plan.
    pgPolicy('academy_subscriptions_own_select', {
      for: 'select',
      to: appRole,
      using: sql`${t.academyId} = NULLIF(current_setting('app.tenant_id', true), '')::uuid`,
    }),
  ],
);
