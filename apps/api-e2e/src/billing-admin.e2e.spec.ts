import { EventEmitter2 } from '@nestjs/event-emitter';
import { BILLING_CHARGE_REFUNDED, ProviderEventsService } from '@org/api';
import {
  auditLogs,
  charges,
  payments,
  students,
  users,
  withPlatform,
} from '@tatame/db';
import { and, eq, sql as dsql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, createTestApp, type TestApp } from './support/test-app.js';

/**
 * BIL.7/BIL.10/BIL.12 — admin billing: materialization (idempotency, race,
 * audit), Visão financeira aggregates against the seeded truth, plans CRUD +
 * assignment validation (the invite-create FK hole), the audited full-refund
 * flow, the mandate auto-settle fixture and the normalized-event contract.
 */
describe('billing: admin overview, plans, materialization, refund', () => {
  let t: TestApp;
  let admin: Record<string, any>;
  let alphaId: string;

  beforeAll(async () => {
    t = await createTestApp();
    admin = await t.login('admin@tatame.dev');
    alphaId = await t.academyIdBySlug('alpha-jj');
  });

  afterAll(async () => {
    await t.close();
  });

  it('POST materialize creates the missing current-cycle charges exactly once (audited)', async () => {
    // Seeds leave the overdue student (Flavia) without a current-cycle
    // charge; the pass creates it. Ana + both kids already have theirs.
    const first = await t
      .http()
      .post('/v1/admin/billing/charges/materialize')
      .set(bearer(admin.accessToken));
    expect(first.status).toBe(200);
    expect(first.body.created).toBeGreaterThanOrEqual(1);

    const second = await t
      .http()
      .post('/v1/admin/billing/charges/materialize')
      .set(bearer(admin.accessToken));
    expect(second.status).toBe(200);
    expect(second.body.created).toBe(0);

    // The trigger is audited with the pass outcome.
    const audits = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.tenantId, alphaId),
            eq(auditLogs.action, 'billing.charge.materialized'),
          ),
        ),
    );
    expect(audits.length).toBeGreaterThanOrEqual(2);

    // Every inserted charge carries its billing.charge.created audit row.
    const created = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.tenantId, alphaId),
            eq(auditLogs.action, 'billing.charge.created'),
          ),
        ),
    );
    expect(created.length).toBeGreaterThanOrEqual(1);
  });

  it('materialization survives a concurrent race on the partial-unique key', async () => {
    const chargeCount = async () => {
      const [row] = await withPlatform(t.platformDb.db, (tx) =>
        tx
          .select({ n: dsql<string>`COUNT(*)` })
          .from(charges)
          .where(eq(charges.tenantId, alphaId)),
      );
      return Number(row!.n);
    };
    const before = await chargeCount();
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        t
          .http()
          .post('/v1/admin/billing/charges/materialize')
          .set(bearer(admin.accessToken)),
      ),
    );
    for (const res of results) expect(res.status).toBe(200);
    expect(await chargeCount()).toBe(before);

    // No duplicated competência per (student, plan, period).
    const [dupes] = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .execute(
          dsql`
        SELECT COUNT(*) AS n FROM (
          SELECT student_id, academy_plan_id, period_start
          FROM charges WHERE origin = 'plan'
          GROUP BY 1, 2, 3 HAVING COUNT(*) > 1
        ) d
      `,
        )
        .then((r) => r.rows as Array<{ n: string }>),
    );
    expect(Number(dupes!.n)).toBe(0);
  });

  it('overview aggregates match the database truth (tenant timezone, derived on read)', async () => {
    const res = await t
      .http()
      .get('/v1/admin/billing/overview')
      .set(bearer(admin.accessToken));
    expect(res.status).toBe(200);
    const body = res.body;

    // Independent recomputation over the same predicates.
    const [truth] = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .execute(
          dsql`
        WITH local AS (
          SELECT p.amount_cents,
                 to_char(p.paid_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') AS month
          FROM payments p
          WHERE p.tenant_id = ${alphaId} AND p.status = 'succeeded' AND p.paid_at IS NOT NULL
        )
        SELECT
          COALESCE(SUM(amount_cents) FILTER (WHERE month = to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM')), 0) AS mes,
          COALESCE(SUM(amount_cents) FILTER (WHERE month >= to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY') || '-01'), 0) AS ano
        FROM local
      `,
        )
        .then((r) => r.rows as Array<{ mes: string; ano: string }>),
    );
    expect(body.receitaMesCents).toBe(Number(truth!.mes));
    expect(body.receitaAnoCents).toBe(Number(truth!.ano));

    // 6-month series ends at the current month and its last bucket = receita.
    expect(body.series).toHaveLength(6);
    expect(body.series[5].month).toBe(body.month);
    expect(body.series[5].totalCents).toBe(body.receitaMesCents);

    // Inadimplência: numerator from the PREDICATE (open|overdue AND past due).
    const [overdue] = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .execute(
          dsql`
        SELECT COALESCE(SUM(amount_cents), 0) AS total
        FROM charges
        WHERE tenant_id = ${alphaId} AND origin = 'plan'
          AND status IN ('open', 'overdue')
          AND due_date < (now() AT TIME ZONE 'America/Sao_Paulo')::date
      `,
        )
        .then((r) => r.rows as Array<{ total: string }>),
    );
    const overdueCents = Number(overdue!.total);
    if (overdueCents > 0) {
      expect(body.inadimplenciaPct).toBeGreaterThan(0);
      // Flavia (seeded overdue, no settlement) must be on the target list.
      const flavia = body.inadimplentes.find(
        (d: any) => d.fullName === 'Flavia Fila',
      );
      expect(flavia).toBeTruthy();
      expect(flavia.totalCents).toBeGreaterThanOrEqual(18000);
      expect(flavia.oldestDueDate < new Date().toISOString().slice(0, 10)).toBe(
        true,
      );
    }

    // Próximos vencimentos: only future/today open charges, grouped by day.
    for (const group of body.proximosVencimentos) {
      expect(group.count).toBe(group.charges.length);
      expect(group.totalCents).toBe(
        group.charges.reduce((sum: number, c: any) => sum + c.amountCents, 0),
      );
    }

    // Previsão: open charges due inside the next tenant-local month.
    expect(typeof body.previsaoProximoMesCents).toBe('number');
  });

  it('plans CRUD: list, create, duplicate-name 409, edit, archive', async () => {
    const list = await t
      .http()
      .get('/v1/admin/billing/plans')
      .set(bearer(admin.accessToken));
    expect(list.status).toBe(200);
    expect(list.body.plans.map((p: any) => p.name).sort()).toEqual([
      'Kids Mensal',
      'Mensal',
      'Trimestral',
    ]);
    const trimestral = list.body.plans.find(
      (p: any) => p.name === 'Trimestral',
    );
    expect(trimestral.isActive).toBe(false); // seeded soft-archived

    const dup = await t
      .http()
      .post('/v1/admin/billing/plans')
      .set(bearer(admin.accessToken))
      .send({
        name: 'Mensal',
        amountCents: 20000,
        recurrence: 'monthly',
        dueDay: 5,
      });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('plan.name_taken');

    const created = await t
      .http()
      .post('/v1/admin/billing/plans')
      .set(bearer(admin.accessToken))
      .send({
        name: 'Anual Black',
        amountCents: 190000,
        recurrence: 'yearly',
        dueDay: 15,
      });
    expect(created.status).toBe(201);
    expect(created.body.plan).toMatchObject({
      name: 'Anual Black',
      amountCents: 190000,
      recurrence: 'yearly',
      dueDay: 15,
      isActive: true,
    });

    const edited = await t
      .http()
      .patch(`/v1/admin/billing/plans/${created.body.plan.id}`)
      .set(bearer(admin.accessToken))
      .send({ amountCents: 180000 });
    expect(edited.status).toBe(200);
    expect(edited.body.plan.amountCents).toBe(180000);

    const archived = await t
      .http()
      .post(`/v1/admin/billing/plans/${created.body.plan.id}/archive`)
      .set(bearer(admin.accessToken));
    expect(archived.status).toBe(200);
    expect(archived.body.plan.isActive).toBe(false);

    const invalidDay = await t
      .http()
      .post('/v1/admin/billing/plans')
      .set(bearer(admin.accessToken))
      .send({
        name: 'Dia 30',
        amountCents: 10000,
        recurrence: 'monthly',
        dueDay: 30,
      });
    expect(invalidDay.status).toBe(422);
  });

  it('student create/update validates the plan assignment (404/409, never a 500)', async () => {
    const list = await t
      .http()
      .get('/v1/admin/billing/plans')
      .set(bearer(admin.accessToken));
    const mensal = list.body.plans.find((p: any) => p.name === 'Mensal');
    const archived = list.body.plans.find((p: any) => p.name === 'Trimestral');

    const dangling = await t
      .http()
      .post('/v1/admin/students')
      .set(bearer(admin.accessToken))
      .send({
        fullName: 'Sem Plano Valido',
        birthDate: '1990-01-01',
        academyPlanId: '00000000-0000-4000-8000-000000000000',
      });
    expect(dangling.status).toBe(404);
    expect(dangling.body.code).toBe('plan.not_found');

    const toArchived = await t
      .http()
      .post('/v1/admin/students')
      .set(bearer(admin.accessToken))
      .send({
        fullName: 'Plano Arquivado',
        birthDate: '1990-01-01',
        academyPlanId: archived.id,
      });
    expect(toArchived.status).toBe(409);
    expect(toArchived.body.code).toBe('plan.archived');

    const ok = await t
      .http()
      .post('/v1/admin/students')
      .set(bearer(admin.accessToken))
      .send({
        fullName: 'Aluno Novo Plano',
        birthDate: '1990-01-01',
        academyPlanId: mensal.id,
      });
    expect(ok.status).toBe(201);
    expect(ok.body.student.academyPlanId).toBe(mensal.id);

    // PATCH unassigns with null; archived plans refuse NEW assignment.
    const unassign = await t
      .http()
      .patch(`/v1/admin/students/${ok.body.student.id}`)
      .set(bearer(admin.accessToken))
      .send({ academyPlanId: null });
    expect(unassign.status).toBe(200);
    expect(unassign.body.student.academyPlanId).toBeNull();

    const reAssignArchived = await t
      .http()
      .patch(`/v1/admin/students/${ok.body.student.id}`)
      .set(bearer(admin.accessToken))
      .send({ academyPlanId: archived.id });
    expect(reAssignArchived.status).toBe(409);
    expect(reAssignArchived.body.code).toBe('plan.archived');
  });

  it('invite create validates the plan and accept lands the student pre-assigned', async () => {
    const list = await t
      .http()
      .get('/v1/admin/billing/plans')
      .set(bearer(admin.accessToken));
    const mensal = list.body.plans.find((p: any) => p.name === 'Mensal');
    const archived = list.body.plans.find((p: any) => p.name === 'Trimestral');

    const dangling = await t
      .http()
      .post('/v1/invites')
      .set(bearer(admin.accessToken))
      .send({
        kind: 'student',
        academyPlanId: '00000000-0000-4000-8000-000000000000',
      });
    expect(dangling.status).toBe(404);
    expect(dangling.body.code).toBe('plan.not_found');

    const toArchived = await t
      .http()
      .post('/v1/invites')
      .set(bearer(admin.accessToken))
      .send({ kind: 'student', academyPlanId: archived.id });
    expect(toArchived.status).toBe(409);
    expect(toArchived.body.code).toBe('plan.archived');

    const invite = await t
      .http()
      .post('/v1/invites')
      .set(bearer(admin.accessToken))
      .send({ kind: 'student', academyPlanId: mensal.id });
    expect(invite.status).toBe(201);

    // Landing exposes the plan binding; accept copies it onto the student.
    const landing = await t
      .http()
      .get(`/v1/public/invites/${invite.body.token}`);
    expect(landing.status).toBe(200);
    expect(landing.body.academyPlanId).toBe(mensal.id);

    const accept = await t
      .http()
      .post(`/v1/public/invites/${invite.body.token}/accept`)
      .send({
        email: 'convidado.plano@tatame.dev',
        password: 'SenhaForte!123',
        fullName: 'Convidado Com Plano',
        birthDate: '1995-06-06',
      });
    expect(accept.status).toBe(201);

    const [row] = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select({ academyPlanId: students.academyPlanId })
        .from(students)
        .where(
          and(
            eq(students.tenantId, alphaId),
            eq(students.fullName, 'Convidado Com Plano'),
          ),
        ),
    );
    expect(row!.academyPlanId).toBe(mensal.id);
  });

  it('audited full refund flips payment + charge through the provider path', async () => {
    const refundedEvents: any[] = [];
    t.app
      .get(EventEmitter2)
      .on(BILLING_CHARGE_REFUNDED, (e) => refundedEvents.push(e));

    // The seeded previous-cycle Pix settlement of Ana Aluna.
    const [target] = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select({ id: payments.id, chargeId: payments.chargeId })
        .from(payments)
        .innerJoin(charges, eq(charges.id, payments.chargeId))
        .innerJoin(students, eq(students.id, charges.studentId))
        .where(
          and(
            eq(payments.tenantId, alphaId),
            eq(payments.status, 'succeeded'),
            eq(payments.method, 'pix'),
            eq(students.fullName, 'Ana Aluna'),
          ),
        ),
    );
    expect(target).toBeTruthy();

    const res = await t
      .http()
      .post(`/v1/admin/billing/payments/${target!.id}/refund`)
      .set(bearer(admin.accessToken))
      .send({ reason: 'cobranca indevida' });
    expect(res.status).toBe(200);
    expect(res.body.payment.status).toBe('refunded');
    expect(res.body.charge.status).toBe('refunded');

    const event = refundedEvents.find((e) => e.chargeId === target!.chargeId);
    expect(event).toBeTruthy();
    expect(event.providerRefundId).toContain('SIM-REFUND-');

    // Audited twice: the admin trigger + the charge lifecycle transition.
    const audits = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select({ action: auditLogs.action })
        .from(auditLogs)
        .where(eq(auditLogs.tenantId, alphaId)),
    );
    const actions = audits.map((a) => a.action);
    expect(actions).toContain('billing.payment.refunded');
    expect(actions).toContain('billing.charge.refunded');

    // Full refund only once: a refunded payment is unsettled for refund.
    const again = await t
      .http()
      .post(`/v1/admin/billing/payments/${target!.id}/refund`)
      .set(bearer(admin.accessToken))
      .send({});
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('billing.refund_unsettled');

    // Refunding a pending payment is refused with the same stable code.
    const [pending] = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select({ id: payments.id })
        .from(payments)
        .where(
          and(eq(payments.tenantId, alphaId), eq(payments.status, 'pending')),
        ),
    );
    if (pending) {
      const unsettled = await t
        .http()
        .post(`/v1/admin/billing/payments/${pending.id}/refund`)
        .set(bearer(admin.accessToken))
        .send({});
      expect(unsettled.status).toBe(409);
    }
  });

  it('an active card mandate auto-settles due charges at materialization', async () => {
    // Deterministic fixture: an unpaid past competência for Lara Kids, whose
    // seeded mandate is ACTIVE in this database.
    const [lara] = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select({
          id: students.id,
          guardianId: students.guardianId,
          planId: students.academyPlanId,
        })
        .from(students)
        .where(
          and(
            eq(students.tenantId, alphaId),
            eq(students.fullName, 'Lara Kids'),
          ),
        ),
    );
    const past = new Date();
    past.setMonth(past.getMonth() - 3);
    const month = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, '0')}`;
    const [inserted] = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .insert(charges)
        .values({
          tenantId: alphaId,
          studentId: lara!.id,
          guardianId: lara!.guardianId,
          origin: 'plan',
          academyPlanId: lara!.planId as string,
          periodStart: `${month}-01`,
          periodEnd: `${month}-28`,
          amountCents: 15000,
          dueDate: `${month}-10`,
          status: 'open',
        })
        .returning({ id: charges.id }),
    );

    const res = await t
      .http()
      .post('/v1/admin/billing/charges/materialize')
      .set(bearer(admin.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.autoSettled).toBeGreaterThanOrEqual(1);

    const [settled] = await withPlatform(t.platformDb.db, (tx) =>
      tx.select().from(charges).where(eq(charges.id, inserted!.id)),
    );
    expect(settled!.status).toBe('paid');
    const [cardPayment] = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select()
        .from(payments)
        .where(
          and(eq(payments.chargeId, inserted!.id), eq(payments.method, 'card')),
        ),
    );
    expect(cardPayment!.status).toBe('succeeded');
    expect(cardPayment!.providerPaymentId).toBe(`SIM-CARD-${inserted!.id}`);
  });

  it('CONTRACT: the normalized-event handler is idempotent under re-delivery', async () => {
    const handler = t.app.get(ProviderEventsService);
    const [adminUser] = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, 'admin@tatame.dev')),
    );
    const actor = { userId: adminUser!.id, impersonatorUserId: null };

    // A pending attempt to drive: open one via the API for Flavia's charge?
    // Flavia has no login — use a raw pending payment on her overdue charge.
    const [flavia] = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select({ id: students.id })
        .from(students)
        .where(
          and(
            eq(students.tenantId, alphaId),
            eq(students.fullName, 'Flavia Fila'),
          ),
        ),
    );
    const [openCharge] = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select()
        .from(charges)
        .where(
          and(eq(charges.studentId, flavia!.id), eq(charges.status, 'overdue')),
        ),
    );
    expect(openCharge).toBeTruthy();
    const providerPaymentId = `SIM-PIX-${openCharge!.id}`;
    await withPlatform(t.platformDb.db, (tx) =>
      tx.insert(payments).values({
        tenantId: alphaId,
        chargeId: openCharge!.id,
        method: 'pix',
        status: 'pending',
        amountCents: openCharge!.amountCents,
        provider: 'simulated',
        providerPaymentId,
        providerData: { qrPayload: `TATAME-SIM-PIX-${openCharge!.id}` },
      }),
    );

    const event = {
      type: 'payment.succeeded' as const,
      provider: 'simulated' as const,
      tenantId: alphaId,
      providerPaymentId,
      paidAt: new Date().toISOString(),
    };
    const first = await handler.handleProviderEvent(event, actor);
    expect(first.applied).toBe(true);

    const [afterCharge] = await withPlatform(t.platformDb.db, (tx) =>
      tx.select().from(charges).where(eq(charges.id, openCharge!.id)),
    );
    expect(afterCharge!.status).toBe('paid');

    // Idempotent re-delivery: resolved by the provider unique key, no-op.
    const second = await handler.handleProviderEvent(event, actor);
    expect(second.applied).toBe(false);

    // Unknown provider payment id: ignored, never a throw.
    const unknown = await handler.handleProviderEvent(
      { ...event, providerPaymentId: 'SIM-PIX-unknown' },
      actor,
    );
    expect(unknown.applied).toBe(false);

    // payment.failed leaves the charge alone and marks the attempt failed.
    const [failCharge] = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select()
        .from(charges)
        .where(and(eq(charges.tenantId, alphaId), eq(charges.status, 'open'))),
    );
    if (failCharge) {
      const failProviderId = `SIM-BOLETO-${failCharge.id}`;
      await withPlatform(t.platformDb.db, (tx) =>
        tx.insert(payments).values({
          tenantId: alphaId,
          chargeId: failCharge.id,
          method: 'boleto',
          status: 'pending',
          amountCents: failCharge.amountCents,
          provider: 'simulated',
          providerPaymentId: failProviderId,
        }),
      );
      const failed = await handler.handleProviderEvent(
        {
          type: 'payment.failed',
          provider: 'simulated',
          tenantId: alphaId,
          providerPaymentId: failProviderId,
        },
        actor,
      );
      expect(failed.applied).toBe(true);
      const [charge] = await withPlatform(t.platformDb.db, (tx) =>
        tx.select().from(charges).where(eq(charges.id, failCharge.id)),
      );
      expect(charge!.status).toBe('open');
    }
  });
});
