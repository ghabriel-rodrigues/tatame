import { EventEmitter2 } from '@nestjs/event-emitter';
import { BILLING_CHARGE_PAID } from '@org/api';
import { charges, withPlatform } from '@tatame/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, createTestApp, type TestApp } from './support/test-app.js';

/**
 * BIL.8/BIL.12 — aluno Carteira over the simulated driver: wallet payload,
 * the full Pix paid-flow (pay → simulate → paid + receipt + event), boleto
 * attempt semantics, mandate cancel, empty state, RLS isolation and the
 * read-only bypass on payment routes. The whole paid-flow runs while the
 * academy is delinquent (read-only) — story 16: the academy's debt to the
 * platform never blocks a student from paying theirs.
 */
describe('billing: aluno wallet + simulated paid-flow', () => {
  let t: TestApp;
  let aluno: Record<string, any>;
  let paidEvents: any[];

  beforeAll(async () => {
    t = await createTestApp();
    aluno = await t.login('aluno@tatame.dev');
    paidEvents = [];
    t.app.get(EventEmitter2).on(BILLING_CHARGE_PAID, (event) => paidEvents.push(event));
  });

  afterAll(async () => {
    await t.setAcademyStatus('alpha-jj', 'active');
    await t.close();
  });

  it('cancels the seeded card recurrence (deterministic wallet from here on)', async () => {
    // Ana ships with an active mandate; with it, any materialization pass
    // would auto-settle her due charge — cancel first so the manual Pix flow
    // below is exercised deterministically regardless of the calendar day.
    const res = await t.http().delete('/v1/aluno/wallet/mandate').set(bearer(aluno.accessToken));
    expect(res.status).toBe(204);

    // Cancel is not idempotent-silent: nothing active left → 404.
    const again = await t.http().delete('/v1/aluno/wallet/mandate').set(bearer(aluno.accessToken));
    expect(again.status).toBe(404);
  });

  let currentChargeId: string;

  it('wallet payload: plan header, open current charge, histórico, no banner', async () => {
    const res = await t.http().get('/v1/aluno/wallet').set(bearer(aluno.accessToken));
    expect(res.status).toBe(200);

    expect(res.body.plan).toMatchObject({
      name: 'Mensal',
      amountCents: 18000,
      currency: 'BRL',
      recurrence: 'monthly',
      dueDay: 5,
    });
    expect(res.body.currentCharge).toBeTruthy();
    expect(['open', 'overdue']).toContain(res.body.currentCharge.status);
    expect(res.body.currentCharge.amountCents).toBe(18000);
    currentChargeId = res.body.currentCharge.id;

    // Mandate canceled above → banner off.
    expect(res.body.recurrence).toEqual({ active: false, nextChargeDueDate: null });

    // Histórico: the seeded previous-cycle Pix settlement + Ana's settled
    // event inscription (spec 008) + her store order settlements (spec 009 —
    // delivered #2427, refunded #2428, paid #2430) — one record for ALL money.
    expect(res.body.history.length).toBe(5);
    for (const entry of res.body.history) {
      expect(entry.method).toBe('pix');
      expect(['paid', 'refunded']).toContain(entry.chargeStatus);
      expect(entry.receiptUrl).toContain('/receipt');
    }
    expect(
      res.body.history.map((h: any) => h.amountCents).sort((a: number, b: number) => a - b),
    ).toEqual([3900, 6000, 11800, 12900, 18000]);
    // The refunded store order is the only refunded record.
    expect(
      res.body.history.filter((h: any) => h.chargeStatus === 'refunded').map((h: any) => h.amountCents),
    ).toEqual([12900]);
  });

  it('materialization is idempotent: repeated and concurrent wallet opens never double-bill', async () => {
    const countCharges = async () => {
      const rows = await withPlatform(t.platformDb.db, (tx) =>
        tx.select({ id: charges.id }).from(charges),
      );
      return rows.length;
    };
    const before = await countCharges();
    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        t.http().get('/v1/aluno/wallet').set(bearer(aluno.accessToken)),
      ),
    );
    for (const res of responses) expect(res.status).toBe(200);
    expect(await countCharges()).toBe(before);
  });

  it('home "mensalidade em aberto" alert is fed by the real charge', async () => {
    const res = await t.http().get('/v1/aluno/home').set(bearer(aluno.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.mensalidade).toMatchObject({ chargeId: currentChargeId, amountCents: 18000 });
  });

  let pixPaymentId: string;

  it('pays with Pix under a read-only (delinquent) academy — @BypassReadOnly', async () => {
    await t.setAcademyStatus('alpha-jj', 'delinquent');

    const res = await t
      .http()
      .post(`/v1/aluno/wallet/charges/${currentChargeId}/payments`)
      .set(bearer(aluno.accessToken))
      .send({ method: 'pix' });
    expect(res.status).toBe(201);
    expect(res.body.payment.status).toBe('pending');
    expect(res.body.payment.providerData).toMatchObject({
      qrPayload: `TATAME-SIM-PIX-${currentChargeId}`,
      copiaECola: `TATAME-SIM-PIX-${currentChargeId}`,
    });
    pixPaymentId = res.body.payment.id;

    // Reopening the Pix sheet reuses the same pending attempt (deterministic
    // provider ids keyed by charge — no duplicate rows, same copia-e-cola).
    const again = await t
      .http()
      .post(`/v1/aluno/wallet/charges/${currentChargeId}/payments`)
      .set(bearer(aluno.accessToken))
      .send({ method: 'pix' });
    expect(again.status).toBe(201);
    expect(again.body.payment.id).toBe(pixPaymentId);

    // While a non-payment mutation stays blocked by read-only mode.
    const admin = await t.login('admin@tatame.dev');
    const blocked = await t
      .http()
      .post('/v1/admin/billing/plans')
      .set(bearer(admin.accessToken))
      .send({ name: 'Bloqueado', amountCents: 1000, recurrence: 'monthly', dueDay: 5 });
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('tenant.read_only');
  });

  let boletoPaymentId: string;

  it('boleto sheet payload: linha digitável + barcode', async () => {
    const res = await t
      .http()
      .post(`/v1/aluno/wallet/charges/${currentChargeId}/payments`)
      .set(bearer(aluno.accessToken))
      .send({ method: 'boleto' });
    expect(res.status).toBe(201);
    expect(res.body.payment.providerData.linhaDigitavel).toContain('23790');
    expect(res.body.payment.providerData.barcodePayload).toBe(
      `TATAME-SIM-BOLETO-${currentChargeId}`,
    );
    boletoPaymentId = res.body.payment.id;
  });

  it('recurrence toggle on a non-card method → 422 billing.method_mandate_mismatch', async () => {
    const res = await t
      .http()
      .post(`/v1/aluno/wallet/charges/${currentChargeId}/payments`)
      .set(bearer(aluno.accessToken))
      .send({ method: 'pix', recurrence: true });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('billing.method_mandate_mismatch');
  });

  it('simulate settles the charge through the normalized handler (event + receipt), still read-only', async () => {
    const res = await t
      .http()
      .post(`/v1/billing/payments/${pixPaymentId}/simulate`)
      .set(bearer(aluno.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.payment.status).toBe('succeeded');
    expect(res.body.charge.status).toBe('paid');

    // billing.charge.paid emitted post-commit, addressed to the aluno.
    const event = paidEvents.find((e) => e.chargeId === currentChargeId);
    expect(event).toBeTruthy();
    expect(event.audience).toBe('student');
    expect(event.paymentId).toBe(pixPaymentId);

    // The card flips to Paga and the histórico gains the settlement (on top
    // of the seeded plan + event + store entries).
    const wallet = await t.http().get('/v1/aluno/wallet').set(bearer(aluno.accessToken));
    expect(wallet.body.currentCharge.status).toBe('paid');
    expect(wallet.body.history.length).toBe(6);

    // Home alert now tells the truth: nothing open.
    const home = await t.http().get('/v1/aluno/home').set(bearer(aluno.accessToken));
    expect(home.body.mensalidade).toBeNull();

    await t.setAcademyStatus('alpha-jj', 'active');
  });

  it('receipt renders for the settled payment; unsettled and foreign are 404', async () => {
    const receipt = await t
      .http()
      .get(`/v1/billing/payments/${pixPaymentId}/receipt`)
      .set(bearer(aluno.accessToken));
    expect(receipt.status).toBe(200);
    expect(receipt.body).toMatchObject({
      studentName: 'Ana Aluna',
      planName: 'Mensal',
      academyName: 'Alpha Jiu-Jitsu',
    });
    expect(receipt.body.payment.paidAt).toBeTruthy();

    // The (still pending) boleto attempt has no comprovante.
    const pending = await t
      .http()
      .get(`/v1/billing/payments/${boletoPaymentId}/receipt`)
      .set(bearer(aluno.accessToken));
    expect(pending.status).toBe(404);

    // Cross-tenant admin (RLS backstop): bravo admin cannot see alpha money.
    const bravoAdmin = await t.login('admin.bravo@tatame.dev');
    const foreign = await t
      .http()
      .get(`/v1/billing/payments/${pixPaymentId}/receipt`)
      .set(bearer(bravoAdmin.accessToken));
    expect(foreign.status).toBe(404);
  });

  it('simulating the stale boleto attempt on a paid charge → 409 billing.charge_not_payable', async () => {
    const res = await t
      .http()
      .post(`/v1/billing/payments/${boletoPaymentId}/simulate`)
      .set(bearer(aluno.accessToken));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('billing.charge_not_payable');

    // Idempotent endpoint semantics: re-simulating the settled Pix is 409 too
    // (the normalized handler itself no-ops; the endpoint refuses cleanly).
    const paid = await t
      .http()
      .post(`/v1/billing/payments/${pixPaymentId}/simulate`)
      .set(bearer(aluno.accessToken));
    expect(paid.status).toBe(409);
  });

  it('paying with pix again on the paid charge → 409 (charge not payable)', async () => {
    const res = await t
      .http()
      .post(`/v1/aluno/wallet/charges/${currentChargeId}/payments`)
      .set(bearer(aluno.accessToken))
      .send({ method: 'pix' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('billing.charge_not_payable');
  });

  it('RLS isolation: a bravo charge id behaves as 404 for an alpha aluno', async () => {
    const bravoId = await t.academyIdBySlug('bravo-bjj');
    const [bravoCharge] = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select({ id: charges.id })
        .from(charges)
        .where(and(eq(charges.tenantId, bravoId), eq(charges.status, 'open'))),
    );
    expect(bravoCharge).toBeTruthy();
    const res = await t
      .http()
      .post(`/v1/aluno/wallet/charges/${bravoCharge!.id}/payments`)
      .set(bearer(aluno.accessToken))
      .send({ method: 'pix' });
    expect(res.status).toBe(404);
  });

  it('a student with no plan gets the clean empty state (billing never invents money)', async () => {
    // Invite-accept a fresh adult student with no plan binding.
    const admin = await t.login('admin@tatame.dev');
    const invite = await t
      .http()
      .post('/v1/invites')
      .set(bearer(admin.accessToken))
      .send({ kind: 'student' });
    expect(invite.status).toBe(201);
    const accept = await t
      .http()
      .post(`/v1/public/invites/${invite.body.token}/accept`)
      .send({
        email: 'planless@tatame.dev',
        password: 'planless-pass-123',
        fullName: 'Pedro Planless',
        birthDate: '1999-01-01',
      });
    expect(accept.status).toBe(201);

    const fresh = await t.login('planless@tatame.dev', 'planless-pass-123');
    const wallet = await t.http().get('/v1/aluno/wallet').set(bearer(fresh.accessToken));
    expect(wallet.status).toBe(200);
    expect(wallet.body.plan).toBeNull();
    expect(wallet.body.currentCharge).toBeNull();
    expect(wallet.body.history).toEqual([]);
    expect(wallet.body.recurrence.active).toBe(false);
  });
});
