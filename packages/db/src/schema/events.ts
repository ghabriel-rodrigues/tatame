import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
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
import { students } from './enrollment.js';
import { eventRegistrationStatus, eventStatus } from './enums.js';
import { id, timestamps } from './helpers.js';
import { appRole } from './roles.js';

/**
 * Events slice (spec 008, EVT.1/EVT.2) — the admin's Eventos program and the
 * per-student registrations behind "Confirmar presença" / "Pagar inscrição".
 *
 * Both tenant-scoped (RLS class 1): fail-closed tenant policy on the
 * `app.tenant_id` GUC, `UNIQUE (tenant_id, id)` + composite `(tenant_id, …)`
 * FKs so events and registrations can never reference another academy's rows.
 * RLS is FORCED in the hardening migration (mirrors 0002/0016). Neither table
 * is append-only (status mutates through the lifecycle); transitions are
 * audited on the existing seam (`events.event.*`, `events.registration.*`).
 */

const tenantPolicy = (tenantId: AnyPgColumn) => ({
  using: sql`${tenantId} = NULLIF(current_setting('app.tenant_id', true), '')::uuid`,
  withCheck: sql`${tenantId} = NULLIF(current_setting('app.tenant_id', true), '')::uuid`,
});

/**
 * One academy event ("Open mat de verão", "Exame de faixa"). Exactly the
 * admin form: nome, descrição, banner as a **gradient preset slug** (resolved
 * by the design-system catalog — no image upload in v1, recorded debt),
 * local, data/hora, valor where **NULL = gratuito**, responsável professor
 * (tenant membership validated in the service) and the `draft → published →
 * canceled` lifecycle. Drafts may lack date/local ("Data a definir");
 * publishing requires both. Canceling never hard-deletes — history
 * referencing the event stays intact.
 */
export const events = pgTable(
  'events',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => academies.id),
    name: text('name').notNull(),
    description: text('description'),
    /** Design-system gradient catalog slug; default = purple→pink event gradient. */
    bannerPreset: text('banner_preset').notNull().default('event-purple-pink'),
    location: text('location'),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    /** NULL = gratuito (the form's "Valor (vazio = gratuito)"). */
    priceCents: integer('price_cents'),
    /** The "Responsável: Prof. …" line; role validated in the service. */
    responsibleUserId: uuid('responsible_user_id')
      .notNull()
      .references(() => users.id),
    status: eventStatus('status').notNull().default('draft'),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique('events_tenant_id_id_uq').on(t.tenantId, t.id),
    // Every upcoming/month query: aluno home next-2, agenda "Eventos do mês",
    // professor dashboard tile, the three persona calendars.
    index('events_tenant_status_starts_at_idx').on(t.tenantId, t.status, t.startsAt),
    // Students never see an undated event: publishing requires date + local.
    check(
      'events_published_ck',
      sql`${t.status} <> 'published' OR (${t.startsAt} IS NOT NULL AND ${t.location} IS NOT NULL)`,
    ),
    // Paid means a real price; gratuito is NULL, never 0.
    check('events_price_ck', sql`${t.priceCents} IS NULL OR ${t.priceCents} > 0`),
    pgPolicy('events_tenant_all', { for: 'all', to: appRole, ...tenantPolicy(t.tenantId) }),
  ],
);

/**
 * One row per (event, student): the aluno confirming themselves and the
 * guardian confirming a dependent write the same shape — `confirmed_by_user_id`
 * records the acting user. Status flips (`pending_payment/confirmed/canceled`)
 * on the same row so cancel-and-reconfirm never duplicates and counts stay
 * honest; transitions are audited. No `charge_id` column: the linkage lives
 * on the charge (billing owns money rows).
 */
export const eventRegistrations = pgTable(
  'event_registrations',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => academies.id),
    eventId: uuid('event_id').notNull(),
    studentId: uuid('student_id').notNull(),
    /** The acting user — the aluno themself or the guardian. */
    confirmedByUserId: uuid('confirmed_by_user_id')
      .notNull()
      .references(() => users.id),
    status: eventRegistrationStatus('status').notNull(),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique('event_registrations_tenant_id_id_uq').on(t.tenantId, t.id),
    // One row per student per event — status mutates, never a second row.
    unique('event_registrations_tenant_event_student_uq').on(t.tenantId, t.eventId, t.studentId),
    // Per-student registration state lookups (home cards, dependent chips).
    index('event_registrations_tenant_student_idx').on(t.tenantId, t.studentId),
    foreignKey({
      name: 'event_registrations_event_fk',
      columns: [t.tenantId, t.eventId],
      foreignColumns: [events.tenantId, events.id],
    }),
    foreignKey({
      name: 'event_registrations_student_fk',
      columns: [t.tenantId, t.studentId],
      foreignColumns: [students.tenantId, students.id],
    }),
    pgPolicy('event_registrations_tenant_all', {
      for: 'all',
      to: appRole,
      ...tenantPolicy(t.tenantId),
    }),
  ],
);
