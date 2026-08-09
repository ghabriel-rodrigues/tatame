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

/** Student (person record) lifecycle — "excluir" soft-archives to inactive. */
export const studentStatus = pgEnum('student_status', ['active', 'inactive']);

/** Turma lifecycle — "excluir" soft-archives; archived classes refuse enrollment. */
export const classStatus = pgEnum('class_status', ['active', 'archived']);

/** Enrollment lifecycle — removal flips to `removed`; re-adding reactivates the row. */
export const enrollmentStatus = pgEnum('enrollment_status', ['active', 'removed']);

/**
 * Materialized class occurrence lifecycle — "Encerrar chamada" sets `done`;
 * past dates are treated as done for derived stats regardless of the column
 * (lazy semantics). `canceled` is reserved, no cancel surface in this slice.
 */
export const classSessionStatus = pgEnum('class_session_status', [
  'scheduled',
  'done',
  'canceled',
]);

/** Check-in method — QR scan, 4-digit code, or manual (aluno or professor). */
export const checkinMethod = pgEnum('checkin_method', ['qr', 'code', 'manual']);

/** Belt ladder variant within a martial art — adult vs kids régua. */
export const beltLadderKind = pgEnum('belt_ladder_kind', ['adult', 'kids']);

/**
 * Graduation row kind — `degree`/`belt` are awards; `revocation` is the
 * admin-only compensation row reversing exactly one award (spec 005 GRD.3).
 */
export const graduationKind = pgEnum('graduation_kind', ['degree', 'belt', 'revocation']);

/** Academy->student plan recurrence — the handoff "recorrência" chips. */
export const billingRecurrence = pgEnum('billing_recurrence', [
  'monthly',
  'quarterly',
  'semiannual',
  'yearly',
]);

/** What a charge (cobrança) bills for — per-origin FK columns + CHECK. */
export const chargeOrigin = pgEnum('charge_origin', ['plan', 'event', 'order']);

/**
 * Charge lifecycle: `open → paid → refunded`; `open → overdue → paid|canceled`;
 * `open → canceled`. `overdue` is derived truth (`open AND due_date <
 * current_date`) flipped lazily by the materialization pass — money-truth
 * queries always use the predicate, never trust the flip having run.
 */
export const chargeStatus = pgEnum('charge_status', [
  'open',
  'paid',
  'overdue',
  'canceled',
  'refunded',
]);

/** Payment attempt lifecycle (Pix/boleto are async at the Stripe stage). */
export const paymentStatus = pgEnum('payment_status', [
  'pending',
  'succeeded',
  'failed',
  'refunded',
]);

/** Payment method — the three sheets of the aluno Carteira. */
export const paymentMethod = pgEnum('payment_method', ['pix', 'boleto', 'card']);

/**
 * Payment provider behind the port. v1 runtime is `simulated` only; `stripe`
 * lands with the stage-2 Connect swap (additive enum values only — the swap
 * needs no migration).
 */
export const paymentProvider = pgEnum('payment_provider', ['simulated', 'stripe']);

/** Card-recurrence mandate lifecycle ("recorrência ativa" toggle). */
export const mandateStatus = pgEnum('mandate_status', ['active', 'canceled']);

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
