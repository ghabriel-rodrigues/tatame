import { EventEmitter2 } from '@nestjs/event-emitter';
import { BILLING_CHARGE_PAID } from '@org/api';
import { paymentMandates, charges, students, withPlatform } from '@tatame/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, createTestApp, type TestApp } from './support/test-app.js';

/**
 * BIL.9/BIL.12 — responsável Pagamentos: per-dependent cards with guardian
 * bill-to, Pix per child, boleto compensação, the card immediate-settle path
 * with the recurrence toggle, consolidated histórico, dependent-card alerts
 * and ownership 404s.
 */
describe('billing: responsável payments', () => {
  let t: TestApp;
  let guardian: Record<string, any>;
  let paidEvents: any[];
  let alphaId: string;

  beforeAll(async () => {
    t = await createTestApp();
    guardian = await t.login('responsavel@tatame.dev');
    alphaId = await t.academyIdBySlug('alpha-jj');
    paidEvents = [];
    t.app.get(EventEmitter2).on(BILLING_CHARGE_PAID, (event) => paidEvents.push(event));

    // Determinism: cancel the seeded alpha mandates so no materialization
    // pass auto-settles a current charge mid-test — the auto-settle path has
    // its own deterministic fixture in the admin spec; here the recurrence
    // toggle re-creates a mandate through the real endpoint.
    await withPlatform(t.platformDb.db, (tx) =>
      tx
        .update(paymentMandates)
        .set({ status: 'canceled', canceledAt: new Date() })
        .where(and(eq(paymentMandates.tenantId, alphaId), eq(paymentMandates.status, 'active'))),
    );
  });

  afterAll(async () => {
    await t.close();
  });

  let kiko: any;
  let lara: any;

  it('lists one card per dependent with plan subtitle and open charge', async () => {
    const res = await t.http().get('/v1/responsavel/payments').set(bearer(guardian.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.dependents.map((d: any) => d.fullName)).toEqual(['Kiko Kids', 'Lara Kids']);
    [kiko, lara] = res.body.dependents;

    for (const dependent of [kiko, lara]) {
      expect(dependent.plan).toMatchObject({ name: 'Kids Mensal', amountCents: 15000, dueDay: 10 });
      expect(dependent.currentCharge).toBeTruthy();
      expect(['open', 'overdue']).toContain(dependent.currentCharge.status);
      // Guardian bill-to denormalized at issuance — the payer of record.
      expect(dependent.currentCharge.guardianId).toBeTruthy();
      expect(dependent.recurrenceActive).toBe(false);
    }

    // Consolidated histórico: Kiko's Pix + Lara's card recurrence settlement.
    expect(res.body.history.length).toBe(2);
    expect(res.body.history.map((h: any) => h.method).sort()).toEqual(['card', 'pix']);
    const laraEntry = res.body.history.find((h: any) => h.studentName === 'Lara Kids');
    expect(laraEntry.method).toBe('card');
    expect(laraEntry.receiptUrl).toContain('/receipt');
  });

  it('dependent cards on the Filhos panel carry the mensalidade alert', async () => {
    const res = await t.http().get('/v1/responsavel/dependents').set(bearer(guardian.accessToken));
    expect(res.status).toBe(200);
    for (const dependent of res.body.dependents) {
      expect(dependent.mensalidade).toMatchObject({ amountCents: 15000 });
    }
  });

  it('boleto attempt + Pix attempt coexist; boleto compensação settles the charge', async () => {
    const boleto = await t
      .http()
      .post(`/v1/responsavel/payments/charges/${kiko.currentCharge.id}/payments`)
      .set(bearer(guardian.accessToken))
      .send({ method: 'boleto' });
    expect(boleto.status).toBe(201);
    expect(boleto.body.payment.providerData.linhaDigitavel).toContain('23790');
    expect(boleto.body.payment.providerData.barcodePayload).toBe(
      `TATAME-SIM-BOLETO-${kiko.currentCharge.id}`,
    );

    const pix = await t
      .http()
      .post(`/v1/responsavel/payments/charges/${kiko.currentCharge.id}/payments`)
      .set(bearer(guardian.accessToken))
      .send({ method: 'pix' });
    expect(pix.status).toBe(201);
    expect(pix.body.payment.providerData.copiaECola).toBe(
      `TATAME-SIM-PIX-${kiko.currentCharge.id}`,
    );

    // "Simular compensação" — the boleto settles through the same endpoint
    // and the same normalized handler as everything else.
    const simulate = await t
      .http()
      .post(`/v1/billing/payments/${boleto.body.payment.id}/simulate`)
      .set(bearer(guardian.accessToken));
    expect(simulate.status).toBe(200);
    expect(simulate.body.payment.method).toBe('boleto');
    expect(simulate.body.charge.status).toBe('paid');

    // Guardian variant: the event addresses the responsável.
    const event = paidEvents.find((e) => e.chargeId === kiko.currentCharge.id);
    expect(event.audience).toBe('guardian');
    expect(event.guardianId).toBe(kiko.currentCharge.guardianId);

    // "Ver comprovante" for the settled payment.
    const receipt = await t
      .http()
      .get(`/v1/billing/payments/${boleto.body.payment.id}/receipt`)
      .set(bearer(guardian.accessToken));
    expect(receipt.status).toBe(200);
    expect(receipt.body.studentName).toBe('Kiko Kids');
  });

  it('cartão + recurrence toggle settles inline and creates the mandate', async () => {
    const pay = await t
      .http()
      .post(`/v1/responsavel/payments/charges/${lara.currentCharge.id}/payments`)
      .set(bearer(guardian.accessToken))
      .send({ method: 'card', recurrence: true, card: { holderName: 'RENATA R', last4: '4242' } });
    expect(pay.status).toBe(201);
    expect(pay.body.mandateCreated).toBe(true);
    // Card settles inline — through the SAME normalized handler.
    expect(pay.body.payment.method).toBe('card');
    expect(pay.body.payment.status).toBe('succeeded');
    expect(pay.body.charge.status).toBe('paid');

    const event = paidEvents.find((e) => e.chargeId === lara.currentCharge.id);
    expect(event).toBeTruthy();
    expect(event.method).toBe('card');

    // The dependent card now shows recurrence active + Paga.
    const res = await t.http().get('/v1/responsavel/payments').set(bearer(guardian.accessToken));
    const laraCard = res.body.dependents.find((d: any) => d.fullName === 'Lara Kids');
    expect(laraCard.recurrenceActive).toBe(true);
    expect(laraCard.currentCharge.status).toBe('paid');
    // Consolidated histórico grew with the two settlements above.
    expect(res.body.history.length).toBe(4);
  });

  it('second recurrence opt-in on an open charge → 409 billing.mandate_already_active', async () => {
    // Deterministic open charge for Lara: a two-cycles-ago competência the
    // seeds never created (insert via the BYPASSRLS pool, like an ops fix).
    const [laraRow] = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select({ id: students.id, guardianId: students.guardianId, planId: students.academyPlanId })
        .from(students)
        .where(and(eq(students.tenantId, alphaId), eq(students.fullName, 'Lara Kids'))),
    );
    const past = new Date();
    past.setMonth(past.getMonth() - 2);
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const periodStart = `${iso(past).slice(0, 7)}-01`;
    const [inserted] = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .insert(charges)
        .values({
          tenantId: alphaId,
          studentId: laraRow!.id,
          guardianId: laraRow!.guardianId,
          origin: 'plan',
          academyPlanId: laraRow!.planId as string,
          periodStart,
          periodEnd: `${periodStart.slice(0, 7)}-28`,
          amountCents: 15000,
          dueDate: `${periodStart.slice(0, 7)}-10`,
          status: 'open',
        })
        .returning({ id: charges.id }),
    );

    const res = await t
      .http()
      .post(`/v1/responsavel/payments/charges/${inserted!.id}/payments`)
      .set(bearer(guardian.accessToken))
      .send({ method: 'card', recurrence: true });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('billing.mandate_already_active');

    // Without the toggle the ACTIVE mandate settles the charge inline.
    const pay = await t
      .http()
      .post(`/v1/responsavel/payments/charges/${inserted!.id}/payments`)
      .set(bearer(guardian.accessToken))
      .send({ method: 'card' });
    expect(pay.status).toBe(201);
    expect(pay.body.payment.status).toBe('succeeded');
    expect(pay.body.charge.status).toBe('paid');
  });

  it('ownership: a charge not billed to the caller is 404, never 403', async () => {
    // Ana's own charge (no guardian bill-to) is invisible to the responsável.
    const [anaCharge] = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select({ id: charges.id })
        .from(charges)
        .innerJoin(students, eq(students.id, charges.studentId))
        .where(
          and(
            eq(charges.tenantId, alphaId),
            eq(students.fullName, 'Ana Aluna'),
            eq(charges.status, 'open'),
          ),
        ),
    );
    expect(anaCharge).toBeTruthy();
    const res = await t
      .http()
      .post(`/v1/responsavel/payments/charges/${anaCharge!.id}/payments`)
      .set(bearer(guardian.accessToken))
      .send({ method: 'pix' });
    expect(res.status).toBe(404);

    // And the aluno cannot pay the guardian-billed dependent charge.
    const aluno = await t.login('aluno@tatame.dev');
    const inverse = await t
      .http()
      .post(`/v1/aluno/wallet/charges/${kiko.currentCharge.id}/payments`)
      .set(bearer(aluno.accessToken))
      .send({ method: 'pix' });
    expect(inverse.status).toBe(404);
  });

  it('professor is structurally blocked from every billing surface', async () => {
    const professor = await t.login('professor@tatame.dev');
    for (const [method, path] of [
      ['get', '/v1/responsavel/payments'],
      ['get', '/v1/aluno/wallet'],
      ['get', '/v1/admin/billing/overview'],
      ['get', '/v1/admin/billing/plans'],
      ['get', '/v1/platform/billing/repasses'],
    ] as const) {
      const res = await (t.http() as any)[method](path).set(bearer(professor.accessToken));
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(res.body.code).toBe('authz.forbidden_role');
    }
  });
});
