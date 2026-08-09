import { createHash, randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createAppDb,
  createPlatformDb,
  withPlatform,
  withTenant,
  type DbHandle,
} from '../lib/client.js';
import {
  academies,
  academyPlans,
  billingCustomers,
  charges,
  guardians,
  invites,
  paymentMandates,
  payments,
  students,
  users,
} from '../schema/index.js';
import { createFreshDb, testAdminUrl, type FreshDb } from '../testing/test-db.js';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** Drizzle wraps pg errors; constraint names live on the cause chain. */
async function expectDbError(promise: Promise<unknown>, pattern: RegExp): Promise<void> {
  await expect(promise).rejects.toSatisfy((error: unknown) => {
    let current = error as (Error & { cause?: unknown }) | undefined;
    while (current) {
      if (pattern.test(current.message)) return true;
      current = current.cause as (Error & { cause?: unknown }) | undefined;
    }
    return false;
  });
}

describe('billing schema (spec 006, BIL.1–BIL.4)', () => {
  let fresh: FreshDb;
  let app: DbHandle;
  let platform: DbHandle;

  let tenantA: string;
  let tenantB: string;
  let payerUserId: string;
  let studentA: string;
  let studentA2: string;
  let studentB: string;
  let guardianB: string;
  let planA: string;
  let planB: string;

  beforeAll(async () => {
    fresh = await createFreshDb(testAdminUrl());
    app = createAppDb(fresh.url);
    platform = createPlatformDb(fresh.url);

    await withPlatform(platform.db, async (tx) => {
      const [a] = await tx
        .insert(academies)
        .values({ name: 'Bill A', slug: 'bill-a', contactEmail: 'a@b.dev', status: 'active' })
        .returning({ id: academies.id });
      const [b] = await tx
        .insert(academies)
        .values({ name: 'Bill B', slug: 'bill-b', contactEmail: 'b@b.dev', status: 'active' })
        .returning({ id: academies.id });
      tenantA = a!.id;
      tenantB = b!.id;

      const [payer] = await tx
        .insert(users)
        .values({ email: 'payer@b.dev', fullName: 'Payer' })
        .returning({ id: users.id });
      payerUserId = payer!.id;
    });

    await withTenant(app.db, tenantA, async (tx) => {
      const [s] = await tx
        .insert(students)
        .values({ tenantId: tenantA, fullName: 'Student A', birthDate: '2000-01-01' })
        .returning({ id: students.id });
      studentA = s!.id;
      const [s2] = await tx
        .insert(students)
        .values({ tenantId: tenantA, fullName: 'Student A2', birthDate: '2001-01-01' })
        .returning({ id: students.id });
      studentA2 = s2!.id;
      const [p] = await tx
        .insert(academyPlans)
        .values({ tenantId: tenantA, name: 'Mensal', amountCents: 18_000, recurrence: 'monthly', dueDay: 5 })
        .returning({ id: academyPlans.id });
      planA = p!.id;
    });

    await withTenant(app.db, tenantB, async (tx) => {
      const [g] = await tx
        .insert(guardians)
        .values({ tenantId: tenantB, fullName: 'Guardian B' })
        .returning({ id: guardians.id });
      guardianB = g!.id;
      const [s] = await tx
        .insert(students)
        .values({ tenantId: tenantB, fullName: 'Student B', birthDate: '2000-01-01' })
        .returning({ id: students.id });
      studentB = s!.id;
      const [p] = await tx
        .insert(academyPlans)
        .values({ tenantId: tenantB, name: 'Mensal', amountCents: 20_000, recurrence: 'monthly', dueDay: 10 })
        .returning({ id: academyPlans.id });
      planB = p!.id;
    });
  });

  afterAll(async () => {
    await app?.close();
    await platform?.close();
    await fresh?.drop();
  });

  const planCharge = (overrides: Partial<typeof charges.$inferInsert> = {}) =>
    ({
      tenantId: tenantA,
      studentId: studentA,
      origin: 'plan' as const,
      academyPlanId: planA,
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      amountCents: 18_000,
      dueDate: '2026-08-05',
      ...overrides,
    }) as typeof charges.$inferInsert;

  describe('academy_plans (BIL.1)', () => {
    it('rejects non-positive amounts and out-of-range due days', async () => {
      await expectDbError(
        withTenant(app.db, tenantA, (tx) =>
          tx.insert(academyPlans).values({
            tenantId: tenantA, name: 'Zero', amountCents: 0, recurrence: 'monthly', dueDay: 5,
          }),
        ),
        /academy_plans_amount_ck/,
      );
      await expectDbError(
        withTenant(app.db, tenantA, (tx) =>
          tx.insert(academyPlans).values({
            tenantId: tenantA, name: 'Feb', amountCents: 100, recurrence: 'monthly', dueDay: 29,
          }),
        ),
        /academy_plans_due_day_ck/,
      );
      await expectDbError(
        withTenant(app.db, tenantA, (tx) =>
          tx.insert(academyPlans).values({
            tenantId: tenantA, name: 'Zero Day', amountCents: 100, recurrence: 'monthly', dueDay: 0,
          }),
        ),
        /academy_plans_due_day_ck/,
      );
    });

    it('enforces UNIQUE (tenant, name) while both tenants may share a name', async () => {
      await expectDbError(
        withTenant(app.db, tenantA, (tx) =>
          tx.insert(academyPlans).values({
            tenantId: tenantA, name: 'Mensal', amountCents: 100, recurrence: 'monthly', dueDay: 5,
          }),
        ),
        /academy_plans_tenant_name_uq/,
      );
      // Tenant B already carries its own 'Mensal' (created in setup).
      const rows = await withTenant(app.db, tenantB, (tx) =>
        tx.select().from(academyPlans).where(eq(academyPlans.name, 'Mensal')),
      );
      expect(rows).toHaveLength(1);
    });
  });

  describe('charges origin hardening (BIL.2)', () => {
    it('accepts one charge per origin with exactly its origin column set', async () => {
      await withTenant(app.db, tenantA, (tx) => tx.insert(charges).values(planCharge()));
      // Event/order columns are plain uuids until their slices land — the
      // CHECK already governs them.
      await withTenant(app.db, tenantA, (tx) =>
        tx.insert(charges).values(
          planCharge({
            origin: 'event',
            academyPlanId: null,
            periodStart: null,
            periodEnd: null,
            eventRegistrationId: randomUUID(),
          }),
        ),
      );
      await withTenant(app.db, tenantA, (tx) =>
        tx.insert(charges).values(
          planCharge({
            origin: 'order',
            academyPlanId: null,
            periodStart: null,
            periodEnd: null,
            orderId: randomUUID(),
          }),
        ),
      );
      const rows = await withTenant(app.db, tenantA, (tx) =>
        tx.select().from(charges).where(eq(charges.studentId, studentA)),
      );
      expect(rows.map((r) => r.origin).sort()).toEqual(['event', 'order', 'plan']);
    });

    it('rejects a plan charge missing its plan and any mixed-origin combination', async () => {
      await expectDbError(
        withTenant(app.db, tenantA, (tx) =>
          tx.insert(charges).values(planCharge({ academyPlanId: null })),
        ),
        /charges_origin_ck/,
      );
      await expectDbError(
        withTenant(app.db, tenantA, (tx) =>
          tx.insert(charges).values(planCharge({ orderId: randomUUID(), periodStart: '2026-09-01' })),
        ),
        /charges_origin_ck/,
      );
      await expectDbError(
        withTenant(app.db, tenantA, (tx) =>
          tx.insert(charges).values(
            planCharge({ origin: 'event', academyPlanId: null, eventRegistrationId: null }),
          ),
        ),
        /charges_origin_ck/,
      );
    });

    it('rejects a plan charge without its competência (period_start)', async () => {
      await expectDbError(
        withTenant(app.db, tenantA, (tx) =>
          tx.insert(charges).values(planCharge({ periodStart: null })),
        ),
        /charges_plan_period_ck/,
      );
    });

    it('materialization idempotency: the plan-cycle partial unique holds and upserts race safely', async () => {
      // The 2026-08 cycle for studentA exists from the origin test above.
      await expectDbError(
        withTenant(app.db, tenantA, (tx) => tx.insert(charges).values(planCharge())),
        /charges_plan_cycle_uq/,
      );
      // insert-on-conflict-do-nothing — the concurrent wallet-open contract.
      const upserted = await withTenant(app.db, tenantA, (tx) =>
        tx.insert(charges).values(planCharge()).onConflictDoNothing().returning({ id: charges.id }),
      );
      expect(upserted).toHaveLength(0);
      // The next cycle inserts freely.
      const next = await withTenant(app.db, tenantA, (tx) =>
        tx
          .insert(charges)
          .values(planCharge({ periodStart: '2026-09-01', periodEnd: '2026-09-30', dueDate: '2026-09-05' }))
          .returning({ id: charges.id }),
      );
      expect(next).toHaveLength(1);
    });
  });

  describe('payments (BIL.3)', () => {
    it('enforces the (provider, provider_payment_id) partial unique; NULL ids stay free', async () => {
      const [charge] = await withTenant(app.db, tenantA, (tx) =>
        tx
          .select({ id: charges.id })
          .from(charges)
          .where(and(eq(charges.studentId, studentA), eq(charges.origin, 'plan'))),
      );
      const base = {
        tenantId: tenantA,
        chargeId: charge!.id,
        method: 'pix' as const,
        amountCents: 18_000,
        provider: 'simulated' as const,
      };
      await withTenant(app.db, tenantA, (tx) =>
        tx.insert(payments).values({ ...base, providerPaymentId: 'SIM-PIX-1' }),
      );
      await expectDbError(
        withTenant(app.db, tenantA, (tx) =>
          tx.insert(payments).values({ ...base, providerPaymentId: 'SIM-PIX-1' }),
        ),
        /payments_provider_payment_uq/,
      );
      // Pending attempts without a provider id may coexist.
      await withTenant(app.db, tenantA, (tx) => tx.insert(payments).values(base));
      await withTenant(app.db, tenantA, (tx) => tx.insert(payments).values(base));
    });
  });

  describe('payment_mandates (BIL.3)', () => {
    it('allows at most one active mandate per student; cancel + re-opt-in works', async () => {
      const mandate = {
        tenantId: tenantA,
        studentId: studentA2,
        payerUserId,
        method: 'card' as const,
        provider: 'simulated' as const,
      };
      const [first] = await withTenant(app.db, tenantA, (tx) =>
        tx.insert(paymentMandates).values(mandate).returning({ id: paymentMandates.id }),
      );
      await expectDbError(
        withTenant(app.db, tenantA, (tx) => tx.insert(paymentMandates).values(mandate)),
        /payment_mandates_single_active_uq/,
      );
      await withTenant(app.db, tenantA, (tx) =>
        tx
          .update(paymentMandates)
          .set({ status: 'canceled', canceledAt: new Date() })
          .where(eq(paymentMandates.id, first!.id)),
      );
      const [second] = await withTenant(app.db, tenantA, (tx) =>
        tx.insert(paymentMandates).values(mandate).returning({ id: paymentMandates.id }),
      );
      expect(second!.id).not.toBe(first!.id);
    });
  });

  describe('billing_customers (BIL.3)', () => {
    it('enforces one provider customer per (tenant, user, provider)', async () => {
      const row = {
        tenantId: tenantA,
        userId: payerUserId,
        provider: 'stripe' as const,
        providerCustomerId: 'cus_test_1',
      };
      await withTenant(app.db, tenantA, (tx) => tx.insert(billingCustomers).values(row));
      await expectDbError(
        withTenant(app.db, tenantA, (tx) =>
          tx.insert(billingCustomers).values({ ...row, providerCustomerId: 'cus_test_2' }),
        ),
        /billing_customers_tenant_user_provider_uq/,
      );
    });
  });

  describe('composite tenant FKs (BIL.2/BIL.4) — cross-tenant references impossible', () => {
    it('rejects charges referencing another tenant student, guardian or plan', async () => {
      await expectDbError(
        withTenant(app.db, tenantA, (tx) =>
          tx.insert(charges).values(planCharge({ studentId: studentB, periodStart: '2026-10-01' })),
        ),
        /charges_student_fk/,
      );
      await expectDbError(
        withTenant(app.db, tenantA, (tx) =>
          tx.insert(charges).values(planCharge({ guardianId: guardianB, periodStart: '2026-10-01' })),
        ),
        /charges_guardian_fk/,
      );
      await expectDbError(
        withTenant(app.db, tenantA, (tx) =>
          tx.insert(charges).values(planCharge({ academyPlanId: planB, periodStart: '2026-10-01' })),
        ),
        /charges_academy_plan_fk/,
      );
    });

    it('rejects payments and mandates reaching across tenants', async () => {
      const [foreignCharge] = await withTenant(app.db, tenantB, (tx) =>
        tx
          .insert(charges)
          .values(
            planCharge({
              tenantId: tenantB,
              studentId: studentB,
              academyPlanId: planB,
              amountCents: 20_000,
              dueDate: '2026-08-10',
            }),
          )
          .returning({ id: charges.id }),
      );
      await expectDbError(
        withTenant(app.db, tenantA, (tx) =>
          tx.insert(payments).values({
            tenantId: tenantA,
            chargeId: foreignCharge!.id,
            method: 'pix',
            amountCents: 20_000,
            provider: 'simulated',
          }),
        ),
        /payments_charge_fk/,
      );
      await expectDbError(
        withTenant(app.db, tenantA, (tx) =>
          tx.insert(paymentMandates).values({
            tenantId: tenantA,
            studentId: studentB,
            payerUserId,
            method: 'card',
            provider: 'simulated',
          }),
        ),
        /payment_mandates_student_fk/,
      );
    });

    it('the upgraded academy_plan_id stubs reject cross-tenant plans (students + invites)', async () => {
      await expectDbError(
        withTenant(app.db, tenantA, (tx) =>
          tx
            .update(students)
            .set({ academyPlanId: planB })
            .where(eq(students.id, studentA)),
        ),
        /students_academy_plan_fk/,
      );
      await expectDbError(
        withTenant(app.db, tenantA, (tx) =>
          tx.insert(invites).values({
            tenantId: tenantA,
            tokenHash: sha256('billing-invite-cross'),
            kind: 'student',
            academyPlanId: planB,
            createdByUserId: payerUserId,
            expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
          }),
        ),
        /invites_academy_plan_fk/,
      );
      // Same-tenant bindings work.
      await withTenant(app.db, tenantA, (tx) =>
        tx.update(students).set({ academyPlanId: planA }).where(eq(students.id, studentA)),
      );
      await withTenant(app.db, tenantA, (tx) =>
        tx.insert(invites).values({
          tenantId: tenantA,
          tokenHash: sha256('billing-invite-ok'),
          kind: 'student',
          academyPlanId: planA,
          createdByUserId: payerUserId,
          expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        }),
      );
    });
  });

  describe('RLS on the billing tables', () => {
    it('fails closed with no tenant context on all five tables', async () => {
      expect(await app.db.select().from(academyPlans)).toHaveLength(0);
      expect(await app.db.select().from(charges)).toHaveLength(0);
      expect(await app.db.select().from(payments)).toHaveLength(0);
      expect(await app.db.select().from(paymentMandates)).toHaveLength(0);
      expect(await app.db.select().from(billingCustomers)).toHaveLength(0);
    });

    it('keeps each tenant blind to the other tenant money', async () => {
      const rowsB = await withTenant(app.db, tenantB, (tx) => tx.select().from(charges));
      expect(rowsB.length).toBeGreaterThanOrEqual(1);
      expect(rowsB.every((c) => c.tenantId === tenantB)).toBe(true);

      const plansB = await withTenant(app.db, tenantB, (tx) => tx.select().from(academyPlans));
      expect(plansB.every((p) => p.tenantId === tenantB)).toBe(true);

      // WITH CHECK blocks writing money into another academy.
      await expectDbError(
        withTenant(app.db, tenantB, (tx) => tx.insert(charges).values(planCharge())),
        /row-level security/,
      );
    });
  });
});
