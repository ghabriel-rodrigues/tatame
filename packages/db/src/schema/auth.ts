import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  inet,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { academies } from './academies.js';
import { credentialProvider, userStatus } from './enums.js';
import { id, timestamps } from './helpers.js';
import { appRole } from './roles.js';

/**
 * Auth-global tables (no tenant_id). RLS is FORCED (see 0002 custom
 * migration); `tatame_app` gets narrow *self* policies keyed on the
 * `app.user_id` transaction GUC. All pre-auth access (login by email,
 * refresh rotation, password reset, invite landing/accept) goes through
 * SECURITY DEFINER functions — never direct table access.
 */

/** One global identity per person; personas come from memberships. */
export const users = pgTable(
  'users',
  {
    id: id(),
    /** Stored lowercase; uniqueness enforced case-insensitively below. */
    email: text('email').notNull(),
    fullName: text('full_name').notNull(),
    phone: text('phone'),
    birthDate: date('birth_date'),
    avatarUrl: text('avatar_url'),
    locale: text('locale').notNull().default('pt-BR'),
    status: userStatus('status').notNull().default('active'),
    /*
     * Dados pessoais (spec 013, REP.1) — additive nullable profile columns.
     * The profile describes the PERSON, not the tenant: one profile across
     * academies, reusable by future guardian/professor screens without
     * migration (a tenant-scoped student_profiles table was rejected — it
     * would duplicate CPF per academy and orphan data on transfer).
     * CPF/RG write-once is SERVICE-enforced (settable while NULL, 422 after)
     * — a product rule with a future admin-unlock story, not a DB trigger.
     * No CPF uniqueness in v1 (recorded: cross-user dedupe is out of scope).
     */
    /** Small fixed set (CHECK below); clients render PT-BR labels. */
    gender: text('gender'),
    /** 11 normalized digits (CHECK) — clients render the mask; checksum is service-validated. */
    cpf: text('cpf'),
    /** Free-format trimmed text — state formats vary. */
    rg: text('rg'),
    addressLine: text('address_line'),
    addressCity: text('address_city'),
    /** UF — 2 uppercase letters (CHECK). */
    addressState: text('address_state'),
    /** CEP — 8 normalized digits (CHECK); clients render the mask. */
    addressZip: text('address_zip'),
    emergencyContactName: text('emergency_contact_name'),
    emergencyContactPhone: text('emergency_contact_phone'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('users_email_lower_uq').on(sql`lower(${t.email})`),
    check(
      'users_gender_ck',
      sql`${t.gender} IS NULL OR ${t.gender} IN ('female', 'male', 'other', 'unspecified')`,
    ),
    check(
      'users_cpf_format_ck',
      sql`${t.cpf} IS NULL OR ${t.cpf} ~ '^[0-9]{11}$'`,
    ),
    check(
      'users_address_zip_format_ck',
      sql`${t.addressZip} IS NULL OR ${t.addressZip} ~ '^[0-9]{8}$'`,
    ),
    check(
      'users_address_state_format_ck',
      sql`${t.addressState} IS NULL OR ${t.addressState} ~ '^[A-Z]{2}$'`,
    ),
    pgPolicy('users_self_select', {
      for: 'select',
      to: appRole,
      using: sql`${t.id} = NULLIF(current_setting('app.user_id', true), '')::uuid`,
    }),
    pgPolicy('users_self_update', {
      for: 'update',
      to: appRole,
      using: sql`${t.id} = NULLIF(current_setting('app.user_id', true), '')::uuid`,
      withCheck: sql`${t.id} = NULLIF(current_setting('app.user_id', true), '')::uuid`,
    }),
    // Members of the active tenant are readable so tenant UIs can render
    // names (ticket 03 §auth-global: membership-read policy).
    pgPolicy('users_tenant_member_select', {
      for: 'select',
      to: appRole,
      using: sql`EXISTS (
        SELECT 1 FROM memberships m
        WHERE m.user_id = ${t.id}
          AND m.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      )`,
    }),
  ],
);

/** Secrets split from identity; v1 password (argon2id) only. */
export const credentials = pgTable(
  'credentials',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    provider: credentialProvider('provider').notNull().default('password'),
    /** argon2id hash — raw secrets are never stored. */
    secretHash: text('secret_hash').notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('credentials_user_provider_uq').on(t.userId, t.provider),
    pgPolicy('credentials_self_select', {
      for: 'select',
      to: appRole,
      using: sql`${t.userId} = NULLIF(current_setting('app.user_id', true), '')::uuid`,
    }),
    // Authenticated password change; pre-auth reset goes through
    // auth_consume_password_reset().
    pgPolicy('credentials_self_update', {
      for: 'update',
      to: appRole,
      using: sql`${t.userId} = NULLIF(current_setting('app.user_id', true), '')::uuid`,
      withCheck: sql`${t.userId} = NULLIF(current_setting('app.user_id', true), '')::uuid`,
    }),
  ],
);

/** One row per device login; the refresh-token family root. */
export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    /**
     * Active membership bound to the session (ticket 02: login binds tokens to
     * one membership; `/v1/auth/switch` re-points it). Holds either an academy
     * `memberships.id` or a `platform_users.id` (platform persona) — no FK on
     * purpose. NULL for impersonated sessions.
     */
    membershipId: uuid('membership_id'),
    /** Set only on impersonated sessions ("entrar como admin"). */
    impersonatorUserId: uuid('impersonator_user_id').references(() => users.id),
    /** Target tenant of an impersonated session (no membership row exists). */
    impersonatedTenantId: uuid('impersonated_tenant_id').references(
      () => academies.id,
    ),
    /**
     * Absolute session cap fixed at mint time (30 d login / 1 h impersonation).
     * Refresh rotation never extends past it. NULL = pre-migration rows.
     */
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    ip: inet('ip'),
    userAgent: text('user_agent'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedReason: text('revoked_reason'),
    ...timestamps,
  },
  (t) => [
    index('sessions_user_id_idx').on(t.userId),
    pgPolicy('sessions_self_select', {
      for: 'select',
      to: appRole,
      using: sql`${t.userId} = NULLIF(current_setting('app.user_id', true), '')::uuid`,
    }),
    // logout / logout-all: the user revokes their own sessions.
    pgPolicy('sessions_self_update', {
      for: 'update',
      to: appRole,
      using: sql`${t.userId} = NULLIF(current_setting('app.user_id', true), '')::uuid`,
      withCheck: sql`${t.userId} = NULLIF(current_setting('app.user_id', true), '')::uuid`,
    }),
  ],
);

/**
 * Rotating opaque tokens within a session (sha256 hash stored). Presenting an
 * already-consumed token is a theft signal that revokes the whole session —
 * rotation happens exclusively inside auth_rotate_refresh_token().
 */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: id(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    /** Rotation chain. */
    replacedById: uuid('replaced_by_id').references(
      (): AnyPgColumn => refreshTokens.id,
    ),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('refresh_tokens_session_id_idx').on(t.sessionId),
    pgPolicy('refresh_tokens_self_select', {
      for: 'select',
      to: appRole,
      using: sql`EXISTS (
        SELECT 1 FROM sessions s
        WHERE s.id = ${t.sessionId}
          AND s.user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
      )`,
    }),
  ],
);

/** Single-use, short-lived reset tokens (hash stored). Writes via functions only. */
export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('password_reset_tokens_user_id_idx').on(t.userId),
    pgPolicy('password_reset_tokens_self_select', {
      for: 'select',
      to: appRole,
      using: sql`${t.userId} = NULLIF(current_setting('app.user_id', true), '')::uuid`,
    }),
  ],
);
