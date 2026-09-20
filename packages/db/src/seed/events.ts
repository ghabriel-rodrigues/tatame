import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import type { Database, DbTransaction } from '../lib/client.js';
import { withPlatform, withTenant } from '../lib/client.js';
import {
  academies,
  charges,
  eventRegistrations,
  events,
  guardians,
  payments,
  students,
  users,
} from '../schema/index.js';

/**
 * Events fixtures (spec 008, EVT.3). Per fixture academy: one draft event
 * ("Rascunho · Data a definir" — no date/local yet), one published free event
 * with confirmed registrations (the main aluno self-confirmed plus a
 * dependent confirmed by the guardian — the charter's per-dependent
 * confirmation), and one published paid event (R$ 60) with one settled
 * registration (confirmed + paid event-origin charge + simulated Pix payment,
 * the same render-ready payloads as the billing seeds) and one
 * `pending_payment` registration with its open charge billed to the guardian.
 *
 * All tenant rows go through `withTenant` (RLS honest); lifecycle and
 * registration transitions are audited in-transaction via `audit_append`
 * (`events.event.created/published`, `events.registration.confirmed`) and the
 * money rows via the billing action codes (`billing.charge.created/paid`).
 * Idempotent: events keyed on (tenant, name), registrations on the
 * (tenant, event, student) unique, charges on their registration linkage.
 */

/** Event registration price of the paid fixture — the handoff's R$ 60. */
const PAID_EVENT_PRICE_CENTS = 6_000;

interface DevEventFixture {
  name: string;
  description: string;
  bannerPreset: string;
  status: 'draft' | 'published';
  location?: string;
  /** Days from now (published fixtures only — drafts have no date). */
  startsInDays?: number;
  startHour?: number;
  priceCents?: number;
}

const DEV_EVENTS: DevEventFixture[] = [
  {
    // The prototype's "Rascunho · Data a definir" card: no date, no local.
    name: 'Seminario de Guarda',
    description: 'Seminario tecnico de guarda com convidado especial.',
    bannerPreset: 'event-purple-pink',
    status: 'draft',
  },
  {
    name: 'Open Mat de Verao',
    description: 'Treino livre aberto a todas as faixas. Traga um convidado!',
    bannerPreset: 'event-purple-pink',
    status: 'published',
    location: 'Tatame principal',
    startsInDays: 14,
    startHour: 10,
    // priceCents omitted — NULL = gratuito.
  },
  {
    name: 'Exame de Faixa',
    description: 'Exame de faixa do semestre. Inscricao ate uma semana antes.',
    bannerPreset: 'event-blue-teal',
    status: 'published',
    location: 'Ginasio central',
    startsInDays: 30,
    startHour: 9,
    priceCents: PAID_EVENT_PRICE_CENTS,
  },
];

/** Responsible professor per academy — mirrors DEV_CLASS_PROFESSOR. */
const EVENTS_PROFESSOR: Record<string, string> = {
  'alpha-jj': 'professor@tatame.dev',
  'bravo-bjj': 'multi@tatame.dev',
};

/** Audit actor (academy admin) per academy — mirrors DEV_ACADEMY_ADMIN. */
const EVENTS_ACADEMY_ADMIN: Record<string, string> = {
  'alpha-jj': 'admin@tatame.dev',
  'bravo-bjj': 'admin.bravo@tatame.dev',
};

/** Adult student carrying the confirmed/settled registrations, per academy. */
const EVENTS_MAIN_STUDENT: Record<string, string> = {
  'alpha-jj': 'Ana Aluna',
  'bravo-bjj': 'Fabio Fila',
};

export interface SeedEventHandles {
  /** RLS-enforced pool (`tatame_app`) — tenant-scoped rows go through it. */
  appDb: Database;
  /** BYPASSRLS pool (`tatame_platform`) — global lookups only. */
  platformDb: Database;
}

/** Local YYYY-MM-DD for a Date (charge due dates are tenant-local days). */
function isoDate(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/**
 * Upcoming fixture date at a fixed TENANT-local hour (America/Sao_Paulo),
 * `days` from now — independent of the process timezone. CI runners are UTC
 * while the API formats times in the tenant zone, so seeding with
 * `setHours()` shifts every asserted "10:00" to "07:00" there. Brazil has
 * had no DST since 2019, so the fixed -03:00 offset is exact.
 */
function upcoming(days: number, hour: number): Date {
  const base = new Date(Date.now() + days * 86_400_000);
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
  }).format(base);
  return new Date(`${ymd}T${String(hour).padStart(2, '0')}:00:00-03:00`);
}

/**
 * Requires `seedDevFixtures` (students/guardians/users) to have run first.
 */
export async function seedEventFixtures({
  appDb,
  platformDb,
}: SeedEventHandles): Promise<void> {
  for (const slug of Object.keys(EVENTS_MAIN_STUDENT)) {
    const [academy] = await withPlatform(platformDb, (tx) =>
      tx
        .select({ id: academies.id })
        .from(academies)
        .where(eq(academies.slug, slug)),
    );
    if (!academy)
      throw new Error(
        `Fixture academy ${slug} missing — run seedDevFixtures first`,
      );
    const tenantId = academy.id;

    const adminEmail = EVENTS_ACADEMY_ADMIN[slug];
    const professorEmail = EVENTS_PROFESSOR[slug];
    if (!adminEmail || !professorEmail)
      throw new Error(`Missing event fixture cast for ${slug}`);
    const [admin] = await withPlatform(platformDb, (tx) =>
      tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, adminEmail)),
    );
    const [professor] = await withPlatform(platformDb, (tx) =>
      tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, professorEmail)),
    );
    if (!admin || !professor)
      throw new Error(`Missing fixture users for ${slug}`);
    const actorUserId = admin.id;

    await withTenant(appDb, tenantId, async (tx) => {
      // The three events (draft / published free / published paid).
      const eventIdByName = new Map<
        string,
        { id: string; startsAt: Date | null }
      >();
      for (const e of DEV_EVENTS) {
        const startsAt =
          e.startsInDays === undefined
            ? null
            : upcoming(e.startsInDays, e.startHour ?? 10);
        const id = await ensureEvent(tx, {
          tenantId,
          name: e.name,
          description: e.description,
          bannerPreset: e.bannerPreset,
          location: e.location ?? null,
          startsAt,
          priceCents: e.priceCents ?? null,
          status: e.status,
          responsibleUserId: professor.id,
          actorUserId,
        });
        eventIdByName.set(e.name, { id, startsAt });
      }
      const free = eventIdByName.get('Open Mat de Verao');
      const paid = eventIdByName.get('Exame de Faixa');
      if (!free || !paid?.startsAt) throw new Error('Fixture events missing');

      // Cast: the main aluno and the guardian's dependents.
      const mainName = EVENTS_MAIN_STUDENT[slug]!;
      const [main] = await tx
        .select({ id: students.id, userId: students.userId })
        .from(students)
        .where(
          and(eq(students.tenantId, tenantId), eq(students.fullName, mainName)),
        );
      if (!main)
        throw new Error(`Fixture student ${mainName} missing for ${slug}`);

      const [guardian] = await tx
        .select({ id: guardians.id, userId: guardians.userId })
        .from(guardians)
        .where(eq(guardians.tenantId, tenantId));
      if (!guardian) throw new Error(`Fixture guardian missing for ${slug}`);
      const dependents = await tx
        .select({ id: students.id })
        .from(students)
        .where(
          and(
            eq(students.tenantId, tenantId),
            eq(students.guardianId, guardian.id),
            isNotNull(students.guardianId),
          ),
        )
        .orderBy(asc(students.fullName));
      if (dependents.length < 2)
        throw new Error(`Fixture dependents missing for ${slug}`);
      const [dep0, dep1] = dependents as [{ id: string }, { id: string }];

      // Free event: "gratuito = confirmar direto". The aluno confirms
      // themselves (record-only students fall back to the admin actor) and
      // the guardian confirms the first dependent — the same row shape.
      await ensureRegistration(tx, {
        tenantId,
        eventId: free.id,
        studentId: main.id,
        confirmedByUserId: main.userId ?? actorUserId,
        status: 'confirmed',
        actorUserId,
      });
      await ensureRegistration(tx, {
        tenantId,
        eventId: free.id,
        studentId: dep0.id,
        confirmedByUserId: guardian.userId ?? actorUserId,
        status: 'confirmed',
        actorUserId,
      });

      // Paid event, settled path: registration confirmed with its event-origin
      // charge paid through the simulated Pix rails (the handler contract's
      // end state — payment.succeeded settled the charge AND confirmed the
      // registration).
      const settled = await ensureRegistration(tx, {
        tenantId,
        eventId: paid.id,
        studentId: main.id,
        confirmedByUserId: main.userId ?? actorUserId,
        status: 'confirmed',
        actorUserId,
      });
      const settledCharge = await ensureEventCharge(tx, {
        tenantId,
        studentId: main.id,
        eventRegistrationId: settled,
        amountCents: PAID_EVENT_PRICE_CENTS,
        dueDate: isoDate(paid.startsAt),
        status: 'paid',
        actorUserId,
      });
      await ensureSettledPayment(tx, {
        tenantId,
        chargeId: settledCharge.id,
        created: settledCharge.created,
        amountCents: PAID_EVENT_PRICE_CENTS,
        paidAt: new Date(),
        actorUserId,
      });

      // Paid event, pending path: the guardian registered the second
      // dependent — pending_payment with the open charge billed to the
      // responsável (guardian bill-to, like a mensalidade).
      const pending = await ensureRegistration(tx, {
        tenantId,
        eventId: paid.id,
        studentId: dep1.id,
        confirmedByUserId: guardian.userId ?? actorUserId,
        status: 'pending_payment',
        actorUserId,
      });
      await ensureEventCharge(tx, {
        tenantId,
        studentId: dep1.id,
        guardianId: guardian.id,
        eventRegistrationId: pending,
        amountCents: PAID_EVENT_PRICE_CENTS,
        dueDate: isoDate(paid.startsAt),
        status: 'open',
        actorUserId,
      });
    });
  }
}

/**
 * Inserts one event keyed on (tenant, name) — skip-if-present keeps re-runs
 * stable. Creation is audited (`events.event.created`, plus
 * `events.event.published` for fixtures seeded already published) with the
 * academy admin as actor, mirroring the audited billing seed pattern.
 */
async function ensureEvent(
  tx: DbTransaction,
  e: {
    tenantId: string;
    name: string;
    description: string;
    bannerPreset: string;
    location: string | null;
    startsAt: Date | null;
    priceCents: number | null;
    status: 'draft' | 'published';
    responsibleUserId: string;
    actorUserId: string;
  },
): Promise<string> {
  const found = await tx
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.tenantId, e.tenantId), eq(events.name, e.name)));
  if (found[0]) return found[0].id;

  const [inserted] = await tx
    .insert(events)
    .values({
      tenantId: e.tenantId,
      name: e.name,
      description: e.description,
      bannerPreset: e.bannerPreset,
      location: e.location,
      startsAt: e.startsAt,
      priceCents: e.priceCents,
      status: e.status,
      responsibleUserId: e.responsibleUserId,
    })
    .returning({ id: events.id });
  if (!inserted) throw new Error(`Failed to insert event ${e.name}`);

  await tx.execute(
    sql`SELECT audit_append(${e.tenantId}::uuid, ${e.actorUserId}::uuid, NULL,
          ${'events.event.created'}, ${'event'}, ${inserted.id},
          ${JSON.stringify({
            name: e.name,
            status: e.status,
            price_cents: e.priceCents,
          })}::jsonb)`,
  );
  if (e.status === 'published') {
    await tx.execute(
      sql`SELECT audit_append(${e.tenantId}::uuid, ${e.actorUserId}::uuid, NULL,
            ${'events.event.published'}, ${'event'}, ${inserted.id},
            ${JSON.stringify({ starts_at: e.startsAt?.toISOString() ?? null })}::jsonb)`,
    );
  }
  return inserted.id;
}

/**
 * Inserts one registration keyed on the (tenant, event, student) unique —
 * skip-if-present keeps re-runs stable. Confirmed fixtures are audited
 * (`events.registration.confirmed`) with the acting user recorded in the
 * metadata (pending_payment rows await the handler, nothing to audit yet).
 */
async function ensureRegistration(
  tx: DbTransaction,
  r: {
    tenantId: string;
    eventId: string;
    studentId: string;
    confirmedByUserId: string;
    status: 'pending_payment' | 'confirmed';
    actorUserId: string;
  },
): Promise<string> {
  const found = await tx
    .select({ id: eventRegistrations.id })
    .from(eventRegistrations)
    .where(
      and(
        eq(eventRegistrations.tenantId, r.tenantId),
        eq(eventRegistrations.eventId, r.eventId),
        eq(eventRegistrations.studentId, r.studentId),
      ),
    );
  if (found[0]) return found[0].id;

  const [inserted] = await tx
    .insert(eventRegistrations)
    .values({
      tenantId: r.tenantId,
      eventId: r.eventId,
      studentId: r.studentId,
      confirmedByUserId: r.confirmedByUserId,
      status: r.status,
    })
    .returning({ id: eventRegistrations.id });
  if (!inserted) throw new Error('Failed to insert event registration');

  if (r.status === 'confirmed') {
    await tx.execute(
      sql`SELECT audit_append(${r.tenantId}::uuid, ${r.actorUserId}::uuid, NULL,
            ${'events.registration.confirmed'}, ${'event_registration'}, ${inserted.id},
            ${JSON.stringify({
              event_id: r.eventId,
              student_id: r.studentId,
              confirmed_by_user_id: r.confirmedByUserId,
            })}::jsonb)`,
    );
  }
  return inserted.id;
}

/**
 * Inserts one event-origin charge keyed on its registration linkage
 * (`(tenant, event_registration_id)` — one charge per registration in the
 * fixtures) — skip-if-present keeps re-runs stable. Audited with the billing
 * action codes: money rows stay billing's, whatever their origin.
 */
async function ensureEventCharge(
  tx: DbTransaction,
  c: {
    tenantId: string;
    studentId: string;
    guardianId?: string;
    eventRegistrationId: string;
    amountCents: number;
    dueDate: string;
    status: 'open' | 'paid';
    actorUserId: string;
  },
): Promise<{ id: string; created: boolean }> {
  const found = await tx
    .select({ id: charges.id })
    .from(charges)
    .where(
      and(
        eq(charges.tenantId, c.tenantId),
        eq(charges.eventRegistrationId, c.eventRegistrationId),
      ),
    );
  if (found[0]) return { id: found[0].id, created: false };

  const [inserted] = await tx
    .insert(charges)
    .values({
      tenantId: c.tenantId,
      studentId: c.studentId,
      guardianId: c.guardianId,
      origin: 'event',
      eventRegistrationId: c.eventRegistrationId,
      amountCents: c.amountCents,
      dueDate: c.dueDate,
      status: c.status,
    })
    .returning({ id: charges.id });
  if (!inserted) throw new Error('Failed to insert event charge');

  await tx.execute(
    sql`SELECT audit_append(${c.tenantId}::uuid, ${c.actorUserId}::uuid, NULL,
          ${'billing.charge.created'}, ${'charge'}, ${inserted.id},
          ${JSON.stringify({
            origin: 'event',
            event_registration_id: c.eventRegistrationId,
            amount_cents: c.amountCents,
          })}::jsonb)`,
  );
  return { id: inserted.id, created: true };
}

/**
 * Attaches the settled simulated-Pix payment for a charge seeded `paid` —
 * the exact deterministic payload strings the billing seeds emit (Pix QR /
 * copia-e-cola keyed by charge id) + the internal receipt route, so event
 * money renders in the Carteira histórico like any mensalidade.
 */
async function ensureSettledPayment(
  tx: DbTransaction,
  p: {
    tenantId: string;
    chargeId: string;
    /** Skip lookup work when the charge already existed with its payment. */
    created: boolean;
    amountCents: number;
    paidAt: Date;
    actorUserId: string;
  },
): Promise<void> {
  if (!p.created) {
    const existing = await tx
      .select({ id: payments.id })
      .from(payments)
      .where(
        and(
          eq(payments.tenantId, p.tenantId),
          eq(payments.chargeId, p.chargeId),
        ),
      );
    if (existing.length > 0) return;
  }

  const paymentId = uuidv7();
  const providerPaymentId = `SIM-PIX-${p.chargeId}`;
  await tx.insert(payments).values({
    id: paymentId,
    tenantId: p.tenantId,
    chargeId: p.chargeId,
    method: 'pix',
    status: 'succeeded',
    amountCents: p.amountCents,
    provider: 'simulated',
    providerPaymentId,
    providerData: {
      qrPayload: `TATAME-SIM-PIX-${p.chargeId}`,
      copiaECola: `TATAME-SIM-PIX-${p.chargeId}`,
    },
    paidAt: p.paidAt,
    receiptUrl: `/v1/billing/payments/${paymentId}/receipt`,
  });

  await tx.execute(
    sql`SELECT audit_append(${p.tenantId}::uuid, ${p.actorUserId}::uuid, NULL,
          ${'billing.charge.paid'}, ${'charge'}, ${p.chargeId},
          ${JSON.stringify({
            payment_id: paymentId,
            method: 'pix',
            provider_payment_id: providerPaymentId,
          })}::jsonb)`,
  );
}
