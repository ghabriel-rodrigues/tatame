import { sql } from 'drizzle-orm';
import { boolean, char, check, pgPolicy, pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { academyStatus } from './enums.js';
import { id, timestamps } from './helpers.js';
import { appRole } from './roles.js';

/**
 * The tenant root (platform-global class). Written only via the platform pool,
 * with one exception: the academy admin's own-row settings update (spec 011 —
 * name, brand triplet, auto_notifications_enabled) goes through the app pool
 * under the narrow own-row update policy. `tatame_app` may read exactly its
 * own row (name, brand, status for the blocking/read-only screens).
 */
export const academies = pgTable(
  'academies',
  {
    id: id(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    city: text('city'),
    country: char('country', { length: 2 }).default('BR'),
    status: academyStatus('status').notNull().default('trial'),
    contactEmail: text('contact_email').notNull(),
    phone: text('phone'),
    logoUrl: text('logo_url'),
    /**
     * White-label 3-color brand (spec 011, CFG.1 — replaces the Phase-1
     * `theme` jsonb placeholder). Uppercase `#RRGGBB`, all three set or all
     * three NULL; NULL triplet = default Tatame brand (never seeded with the
     * default values, so a future default-brand change reaches unconfigured
     * academies automatically).
     */
    brandDeep: varchar('brand_deep', { length: 7 }),
    brandVibrant: varchar('brand_vibrant', { length: 7 }),
    brandAccent: varchar('brand_accent', { length: 7 }),
    /**
     * The admin-15 "Notificações automáticas" academy toggle (spec 011,
     * closing the 010 deferral): when off, the notification fan-out listeners
     * skip insertion tenant-wide. Per-user mute lives on memberships.
     */
    autoNotificationsEnabled: boolean('auto_notifications_enabled').notNull().default(true),
    /**
     * Stripe connected account (`acct_…`) for stage-2 Connect destination
     * charges + repasse payouts. NULL in v1 (simulated provider only).
     */
    providerAccountId: text('provider_account_id'),
    ...timestamps,
  },
  (t) => [
    check('academies_brand_deep_hex_ck', sql`${t.brandDeep} IS NULL OR ${t.brandDeep} ~ '^#[0-9A-F]{6}$'`),
    check(
      'academies_brand_vibrant_hex_ck',
      sql`${t.brandVibrant} IS NULL OR ${t.brandVibrant} ~ '^#[0-9A-F]{6}$'`,
    ),
    check(
      'academies_brand_accent_hex_ck',
      sql`${t.brandAccent} IS NULL OR ${t.brandAccent} ~ '^#[0-9A-F]{6}$'`,
    ),
    // All-or-none: a partial triplet can never be stored.
    check(
      'academies_brand_all_or_none_ck',
      sql`num_nonnulls(${t.brandDeep}, ${t.brandVibrant}, ${t.brandAccent}) IN (0, 3)`,
    ),
    pgPolicy('academies_own_row_select', {
      for: 'select',
      to: appRole,
      using: sql`${t.id} = NULLIF(current_setting('app.tenant_id', true), '')::uuid`,
    }),
    // Spec 011 (CFG.4): the admin settings PUT updates the academy's own row
    // through the RLS-enforced pool. Row-scoped only — the API layer restricts
    // which columns change (slug stays immutable at the app boundary).
    pgPolicy('academies_own_row_update', {
      for: 'update',
      to: appRole,
      using: sql`${t.id} = NULLIF(current_setting('app.tenant_id', true), '')::uuid`,
      withCheck: sql`${t.id} = NULLIF(current_setting('app.tenant_id', true), '')::uuid`,
    }),
  ],
);
