import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import type { Database, DbTransaction } from '../lib/client.js';
import { withPlatform, withTenant } from '../lib/client.js';
import {
  academies,
  academyPlans,
  academySubscriptions,
  charges,
  guardians,
  paymentMandates,
  payments,
  platformPlans,
  students,
  users,
  type billingRecurrence,
} from '../schema/index.js';

type BillingRecurrence = (typeof billingRecurrence.enumValues)[number];

/**
 * Billing fixtures (spec 006, BIL.5). Per fixture academy: the mensalidade
 * plan catalog (Mensal R$ 180 due 5, Kids Mensal R$ 150 due 10, an archived
 * Trimestral), plan assignment on the seeded students, and charge histories —
 * current-cycle open, previous-cycle paid with a simulated Pix payment
 * (provider_data QR payload + copia-e-cola + receipt), one overdue student,
 * guardian-billed charges for the minor dependents (one settled by card
 * "recorrência") — plus active card mandates where a payer login exists.
 *
 * Platform side: one extra academy seeded delinquent with a `past_due`
 * subscription (repasse retention fixture) — `fee_bps` on the platform plans
 * comes from `seedPlatformPlans`. All tenant rows go through `withTenant`
 * (RLS honest); every charge/mandate mutation is audited in-transaction via
 * `audit_append`. Idempotent: keyed on the same partial-unique competência
 * key the materialization pass uses.
 */

/** Mensalidade catalog per fixture academy (handoff chips: due 5/10/15). */
const BILLING_ACADEMY_PLANS: Array<{
  name: string;
  amountCents: number;
  recurrence: BillingRecurrence;
  dueDay: number;
  isActive: boolean;
}> = [
  {
    name: 'Mensal',
    amountCents: 18_000,
    recurrence: 'monthly',
    dueDay: 5,
    isActive: true,
  },
  {
    name: 'Kids Mensal',
    amountCents: 15_000,
    recurrence: 'monthly',
    dueDay: 10,
    isActive: true,
  },
  // Archived plan — exercises the soft-archive path (never hard-delete).
  {
    name: 'Trimestral',
    amountCents: 48_000,
    recurrence: 'quarterly',
    dueDay: 15,
    isActive: false,
  },
];

/** The delinquent-academy fixture: subscription past_due ⇒ repasse Retido. */
const DELINQUENT_ACADEMY = {
  slug: 'charlie-fc',
  name: 'Charlie Fight Club',
  plan: 'Pro',
  // No brand triplet: charlie exists for the delinquency fixtures only; the
  // white-label demo academy is bravo (Oceano preset, spec 011 CFG.2).
};

/** Adult student carrying the open/paid mensalidade history, per academy. */
const BILLING_MAIN_STUDENT: Record<string, string> = {
  'alpha-jj': 'Ana Aluna',
  'bravo-bjj': 'Fabio Fila',
};

/** Student left overdue (inadimplência fixture), per academy. */
const BILLING_OVERDUE_STUDENT: Record<string, string> = {
  'alpha-jj': 'Flavia Fila',
  'bravo-bjj': 'Flavia Fila',
};

/** Audit actor (academy admin) per academy — mirrors DEV_ACADEMY_ADMIN. */
const BILLING_ACADEMY_ADMIN: Record<string, string> = {
  'alpha-jj': 'admin@tatame.dev',
  'bravo-bjj': 'admin.bravo@tatame.dev',
};

export interface SeedBillingHandles {
  /** RLS-enforced pool (`tatame_app`) — tenant-scoped rows go through it. */
  appDb: Database;
  /** BYPASSRLS pool (`tatame_platform`) — global provisioning rows. */
  platformDb: Database;
}

/** Local YYYY-MM-DD for a Date (charge dates are tenant-local days). */
function isoDate(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/** Competência of the month `offset` months from now (0 = current cycle). */
function cycle(offset: number, dueDay: number) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  const due = new Date(now.getFullYear(), now.getMonth() + offset, dueDay);
  return {
    periodStart: isoDate(start),
    periodEnd: isoDate(end),
    dueDate: isoDate(due),
    due,
  };
}

/**
 * Requires `seedDevFixtures` (students/guardians) and `seedPlatformPlans`
 * (fee_bps) to have run first.
 */
export async function seedBillingFixtures({
  appDb,
  platformDb,
}: SeedBillingHandles): Promise<void> {
  // Platform side: the delinquent academy with a past_due subscription.
  await withPlatform(platformDb, async (tx) => {
    const [academy] = await tx
      .insert(academies)
      .values({
        name: DELINQUENT_ACADEMY.name,
        slug: DELINQUENT_ACADEMY.slug,
        status: 'delinquent',
        contactEmail: `contato@${DELINQUENT_ACADEMY.slug}.tatame.dev`,
        city: 'Sao Paulo',
      })
      .onConflictDoUpdate({
        target: academies.slug,
        set: { status: 'delinquent', updatedAt: new Date() },
      })
      .returning({ id: academies.id });
    if (!academy)
      throw new Error(`Failed to upsert academy ${DELINQUENT_ACADEMY.slug}`);

    const [plan] = await tx
      .select({ id: platformPlans.id })
      .from(platformPlans)
      .where(eq(platformPlans.name, DELINQUENT_ACADEMY.plan));
    if (!plan)
      throw new Error(
        'Platform plans not seeded — run seedPlatformPlans first',
      );

    const existing = await tx
      .select({ id: academySubscriptions.id })
      .from(academySubscriptions)
      .where(eq(academySubscriptions.academyId, academy.id));
    if (existing.length === 0) {
      await tx.insert(academySubscriptions).values({
        academyId: academy.id,
        platformPlanId: plan.id,
        status: 'past_due',
        currentPeriodStart: new Date(Date.now() - 40 * 24 * 3600 * 1000),
        currentPeriodEnd: new Date(Date.now() - 10 * 24 * 3600 * 1000),
      });
    }
  });

  // Tenant side, per fixture academy.
  for (const slug of Object.keys(BILLING_MAIN_STUDENT)) {
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

    const adminEmail = BILLING_ACADEMY_ADMIN[slug];
    if (!adminEmail) throw new Error(`Missing billing admin for ${slug}`);
    const [admin] = await withPlatform(platformDb, (tx) =>
      tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, adminEmail)),
    );
    if (!admin)
      throw new Error(`Missing user ${adminEmail} — run seedDevFixtures first`);
    const actorUserId = admin.id;

    await withTenant(appDb, tenantId, async (tx) => {
      // Plan catalog (skip-if-present, mirrors the class fixture pattern).
      const planIdByName = new Map<string, string>();
      for (const p of BILLING_ACADEMY_PLANS) {
        const found = await tx
          .select({ id: academyPlans.id })
          .from(academyPlans)
          .where(
            and(
              eq(academyPlans.tenantId, tenantId),
              eq(academyPlans.name, p.name),
            ),
          );
        if (found[0]) {
          planIdByName.set(p.name, found[0].id);
          continue;
        }
        const [inserted] = await tx
          .insert(academyPlans)
          .values({ tenantId, ...p })
          .returning({ id: academyPlans.id });
        if (!inserted) throw new Error(`Failed to insert plan ${p.name}`);
        planIdByName.set(p.name, inserted.id);
      }
      const mensalId = planIdByName.get('Mensal');
      const kidsPlanId = planIdByName.get('Kids Mensal');
      if (!mensalId || !kidsPlanId) throw new Error('Fixture plans missing');
      const mensal = BILLING_ACADEMY_PLANS[0]!;
      const kidsPlan = BILLING_ACADEMY_PLANS[1]!;

      // Cast: the fixture students + the guardian's dependents.
      const mainName = BILLING_MAIN_STUDENT[slug]!;
      const overdueName = BILLING_OVERDUE_STUDENT[slug]!;
      const [main] = await tx
        .select({ id: students.id, userId: students.userId })
        .from(students)
        .where(
          and(eq(students.tenantId, tenantId), eq(students.fullName, mainName)),
        );
      const [late] = await tx
        .select({ id: students.id })
        .from(students)
        .where(
          and(
            eq(students.tenantId, tenantId),
            eq(students.fullName, overdueName),
          ),
        );
      if (!main || !late)
        throw new Error(`Fixture students missing for ${slug}`);

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

      // Plan assignment — what materialization will charge (BIL.4 closure).
      // The alpha 'Fabio Fila' stays planless on purpose: the Carteira
      // empty-state fixture (billing never invents money).
      for (const { studentId, planId } of [
        { studentId: main.id, planId: mensalId },
        { studentId: late.id, planId: mensalId },
        { studentId: dep0.id, planId: kidsPlanId },
        { studentId: dep1.id, planId: kidsPlanId },
      ]) {
        await tx
          .update(students)
          .set({ academyPlanId: planId })
          .where(
            and(eq(students.tenantId, tenantId), eq(students.id, studentId)),
          );
      }

      const prev = (dueDay: number) => cycle(-1, dueDay);
      const curr = (dueDay: number) => cycle(0, dueDay);

      // Main student: previous cycle settled by Pix, current cycle open.
      const mainPaid = await ensurePlanCharge(tx, {
        tenantId,
        studentId: main.id,
        academyPlanId: mensalId,
        amountCents: mensal.amountCents,
        status: 'paid',
        actorUserId,
        ...prev(mensal.dueDay),
      });
      await ensureSettledPayment(tx, {
        tenantId,
        chargeId: mainPaid.id,
        created: mainPaid.created,
        method: 'pix',
        amountCents: mensal.amountCents,
        paidAt: dayBefore(prev(mensal.dueDay).due, 2),
        actorUserId,
      });
      await ensurePlanCharge(tx, {
        tenantId,
        studentId: main.id,
        academyPlanId: mensalId,
        amountCents: mensal.amountCents,
        status: 'open',
        actorUserId,
        ...curr(mensal.dueDay),
      });

      // Inadimplência: previous cycle never settled, lazily flipped overdue.
      await ensurePlanCharge(tx, {
        tenantId,
        studentId: late.id,
        academyPlanId: mensalId,
        amountCents: mensal.amountCents,
        status: 'overdue',
        actorUserId,
        ...prev(mensal.dueDay),
      });

      // Dependents: guardian-billed (the responsável is payer of record).
      const dep0Paid = await ensurePlanCharge(tx, {
        tenantId,
        studentId: dep0.id,
        guardianId: guardian.id,
        academyPlanId: kidsPlanId,
        amountCents: kidsPlan.amountCents,
        status: 'paid',
        actorUserId,
        ...prev(kidsPlan.dueDay),
      });
      await ensureSettledPayment(tx, {
        tenantId,
        chargeId: dep0Paid.id,
        created: dep0Paid.created,
        method: 'pix',
        amountCents: kidsPlan.amountCents,
        paidAt: dayBefore(prev(kidsPlan.dueDay).due, 1),
        actorUserId,
      });
      const dep1Paid = await ensurePlanCharge(tx, {
        tenantId,
        studentId: dep1.id,
        guardianId: guardian.id,
        academyPlanId: kidsPlanId,
        amountCents: kidsPlan.amountCents,
        status: 'paid',
        actorUserId,
        ...prev(kidsPlan.dueDay),
      });
      // "Pago via recorrência no cartão" (responsável story 19).
      await ensureSettledPayment(tx, {
        tenantId,
        chargeId: dep1Paid.id,
        created: dep1Paid.created,
        method: 'card',
        amountCents: kidsPlan.amountCents,
        paidAt: prev(kidsPlan.dueDay).due,
        actorUserId,
      });
      for (const dep of [dep0, dep1]) {
        await ensurePlanCharge(tx, {
          tenantId,
          studentId: dep.id,
          guardianId: guardian.id,
          academyPlanId: kidsPlanId,
          amountCents: kidsPlan.amountCents,
          status: 'open',
          actorUserId,
          ...curr(kidsPlan.dueDay),
        });
      }

      // Active card mandates ("recorrência ativa") where a payer login
      // exists: the claimed aluno pays their own; the claimed responsável
      // pays the card-settled dependent's (alpha only — bravo's guardian and
      // fillers have no logins).
      if (main.userId) {
        await ensureActiveMandate(tx, {
          tenantId,
          studentId: main.id,
          payerUserId: main.userId,
          actorUserId,
        });
      }
      if (guardian.userId) {
        await ensureActiveMandate(tx, {
          tenantId,
          studentId: dep1.id,
          payerUserId: guardian.userId,
          actorUserId,
        });
      }
    });
  }
}

function dayBefore(d: Date, days: number): Date {
  return new Date(d.getTime() - days * 24 * 3600 * 1000);
}

type ChargeStatusSeed = 'open' | 'paid' | 'overdue';

/**
 * Inserts one plan charge keyed on the materialization idempotency key
 * `(tenant, student, plan, period_start)` — skip-if-present keeps re-runs
 * stable. Inserted charges are audited (`billing.charge.created`, plus
 * `billing.charge.paid` for fixtures seeded settled) with the academy admin
 * as actor, mirroring the audited graduation seed pattern.
 */
async function ensurePlanCharge(
  tx: DbTransaction,
  c: {
    tenantId: string;
    studentId: string;
    guardianId?: string;
    academyPlanId: string;
    amountCents: number;
    periodStart: string;
    periodEnd: string;
    dueDate: string;
    status: ChargeStatusSeed;
    actorUserId: string;
  },
): Promise<{ id: string; created: boolean }> {
  const found = await tx
    .select({ id: charges.id })
    .from(charges)
    .where(
      and(
        eq(charges.tenantId, c.tenantId),
        eq(charges.studentId, c.studentId),
        eq(charges.academyPlanId, c.academyPlanId),
        eq(charges.periodStart, c.periodStart),
      ),
    );
  if (found[0]) return { id: found[0].id, created: false };

  const [inserted] = await tx
    .insert(charges)
    .values({
      tenantId: c.tenantId,
      studentId: c.studentId,
      guardianId: c.guardianId,
      origin: 'plan',
      academyPlanId: c.academyPlanId,
      periodStart: c.periodStart,
      periodEnd: c.periodEnd,
      amountCents: c.amountCents,
      dueDate: c.dueDate,
      status: c.status,
    })
    .returning({ id: charges.id });
  if (!inserted) throw new Error('Failed to insert charge');

  await tx.execute(
    sql`SELECT audit_append(${c.tenantId}::uuid, ${c.actorUserId}::uuid, NULL,
          ${'billing.charge.created'}, ${'charge'}, ${inserted.id},
          ${JSON.stringify({
            origin: 'plan',
            academy_plan_id: c.academyPlanId,
            period_start: c.periodStart,
            amount_cents: c.amountCents,
          })}::jsonb)`,
  );
  return { id: inserted.id, created: true };
}

/**
 * Attaches the settled payment for a charge seeded `paid`: deterministic
 * simulated-provider payload (the exact strings the drivers will emit —
 * Pix QR/copia-e-cola keyed by charge id) + internal receipt route.
 */
async function ensureSettledPayment(
  tx: DbTransaction,
  p: {
    tenantId: string;
    chargeId: string;
    /** Skip lookup work when the charge already existed with its payment. */
    created: boolean;
    method: 'pix' | 'card' | 'boleto';
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
  const providerPaymentId = `SIM-${p.method.toUpperCase()}-${p.chargeId}`;
  const providerData =
    p.method === 'pix'
      ? {
          qrPayload: `TATAME-SIM-PIX-${p.chargeId}`,
          copiaECola: `TATAME-SIM-PIX-${p.chargeId}`,
        }
      : p.method === 'boleto'
        ? {
            linhaDigitavel: `23790.00000 00000.000000 00000.000000 0 0000${p.amountCents}`,
            barcodePayload: `TATAME-SIM-BOLETO-${p.chargeId}`,
          }
        : { brand: 'visa', last4: '4242', recurring: true };

  await tx.insert(payments).values({
    id: paymentId,
    tenantId: p.tenantId,
    chargeId: p.chargeId,
    method: p.method,
    status: 'succeeded',
    amountCents: p.amountCents,
    provider: 'simulated',
    providerPaymentId,
    providerData,
    paidAt: p.paidAt,
    receiptUrl: `/v1/billing/payments/${paymentId}/receipt`,
  });

  await tx.execute(
    sql`SELECT audit_append(${p.tenantId}::uuid, ${p.actorUserId}::uuid, NULL,
          ${'billing.charge.paid'}, ${'charge'}, ${p.chargeId},
          ${JSON.stringify({
            payment_id: paymentId,
            method: p.method,
            provider_payment_id: providerPaymentId,
          })}::jsonb)`,
  );
}

/** Active card mandate under the single-active partial unique; audited. */
async function ensureActiveMandate(
  tx: DbTransaction,
  m: {
    tenantId: string;
    studentId: string;
    payerUserId: string;
    actorUserId: string;
  },
): Promise<void> {
  const active = await tx
    .select({ id: paymentMandates.id })
    .from(paymentMandates)
    .where(
      and(
        eq(paymentMandates.tenantId, m.tenantId),
        eq(paymentMandates.studentId, m.studentId),
        eq(paymentMandates.status, 'active'),
      ),
    );
  if (active[0]) return;

  const [inserted] = await tx
    .insert(paymentMandates)
    .values({
      tenantId: m.tenantId,
      studentId: m.studentId,
      payerUserId: m.payerUserId,
      method: 'card',
      status: 'active',
      provider: 'simulated',
      providerMandateId: `SIM-MANDATE-${m.studentId}`,
    })
    .returning({ id: paymentMandates.id });
  if (!inserted) throw new Error('Failed to insert mandate');

  await tx.execute(
    sql`SELECT audit_append(${m.tenantId}::uuid, ${m.actorUserId}::uuid, NULL,
          ${'billing.mandate.created'}, ${'payment_mandate'}, ${inserted.id},
          ${JSON.stringify({ student_id: m.studentId, method: 'card' })}::jsonb)`,
  );
}
