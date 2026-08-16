import { sql } from 'drizzle-orm';
import {
  char,
  boolean,
  check,
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
import { paymentProvider, platformRole, subscriptionStatus, userStatus } from './enums.js';
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

/**
 * Catalog feature slugs (spec 012, PLT.1). Stable identifiers; the PT-BR
 * labels the plan cards render live in the API's feature registry, the same
 * split the permission registry uses. The database CHECK below is the
 * boundary that keeps an unknown slug out of the catalog.
 */
export const PLATFORM_PLAN_FEATURE_SLUGS = [
  'attendance',
  'graduations',
  'pix_payments',
  'store',
  'events',
  'full_finance',
  'white_label',
  'multi_unit',
  'advanced_reports',
  'api',
] as const;

export type PlatformPlanFeatureSlug = (typeof PLATFORM_PLAN_FEATURE_SLUGS)[number];

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
    /**
     * Feature chips shown on the plan card, as registry slugs (spec 012 —
     * replaces the `{invites,store,whiteLabel}` jsonb blob no client read).
     * "Mais assinado" and the "Tudo do X" inheritance chip are derived at
     * read time, never stored.
     */
    features: text('features').array().notNull().default(sql`'{}'::text[]`),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    /**
     * Platform take on academy revenue, basis points (spec 006). NULL = 0
     * until product prices it — feeds the repasse read model (gross ×
     * fee_bps = fee; net = gross − fee).
     */
    feeBps: integer('fee_bps'),
    ...timestamps,
  },
  () => [
    // sql.raw, not a parameterized fragment: drizzle-kit renders bind
    // parameters as `$1…$n` into both the migration and the snapshot, which
    // is not valid DDL. The slugs are compile-time literals, so inlining is
    // safe here.
    check(
      'platform_plans_features_slug_ck',
      sql.raw(
        `"platform_plans"."features" <@ ARRAY[${PLATFORM_PLAN_FEATURE_SLUGS.map(
          (slug) => `'${slug}'`,
        ).join(', ')}]::text[]`,
      ),
    ),
    pgPolicy('platform_plans_public_select', {
      for: 'select',
      to: appRole,
      using: sql`true`,
    }),
  ],
);

/**
 * Academy subscription to a platform plan. Plan change applies next cycle
 * (charter rule) via `pending_platform_plan_id`.
 *
 * Provider columns (spec 006): the platform→academy SaaS fee is plain Stripe
 * Billing on the platform account at stage 2. Status mapping: Stripe
 * `past_due` → local `past_due` → academy delinquent (read-only + repasse
 * retention). Local DB is source of truth for access control; Stripe is
 * source of truth for money events (mirrored via webhook, never read in the
 * request path). Students not paying an academy NEVER make it delinquent.
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
    /** Provider behind the SaaS subscription; NULL until the Stripe swap. */
    provider: paymentProvider('provider'),
    /** Stripe Customer (`cus_…`) on the platform account. */
    providerCustomerId: text('provider_customer_id'),
    /** Stripe Billing subscription (`sub_…`). */
    providerSubscriptionId: text('provider_subscription_id'),
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
