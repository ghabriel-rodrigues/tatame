import { pgEnum } from 'drizzle-orm/pg-core';

/** Global user account status. */
export const userStatus = pgEnum('user_status', ['active', 'disabled']);

/** Credential provider — v1 is password only; enum leaves room for OAuth. */
export const credentialProvider = pgEnum('credential_provider', ['password']);

/** Academy (tenant) membership role — one row per (user, academy, role). */
export const membershipRole = pgEnum('membership_role', [
  'student',
  'professor',
  'admin',
  'guardian',
]);

/** Membership lifecycle status. */
export const membershipStatus = pgEnum('membership_status', ['active', 'suspended']);

/** Invite variant: aluno (student) vs responsavel (guardian). */
export const inviteKind = pgEnum('invite_kind', ['student', 'guardian']);

/** Academy status: Trial / Ativa / Inadimplente / Suspensa. */
export const academyStatus = pgEnum('academy_status', [
  'trial',
  'active',
  'delinquent',
  'suspended',
]);

/** Platform (SaaS owner) team roles. */
export const platformRole = pgEnum('platform_role', ['owner', 'support', 'finance']);

/** Academy -> platform plan subscription status. */
export const subscriptionStatus = pgEnum('subscription_status', [
  'trialing',
  'active',
  'past_due',
  'canceled',
]);
