import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ProviderEventsService,
  STORE_ORDER_CANCELED,
  STORE_ORDER_PAID,
  STORE_PRODUCT_LOW_STOCK,
} from '@org/api';
import { charges, products, users, withPlatform } from '@tatame/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, createTestApp, type TestApp } from './support/test-app.js';

/**
 * STO.5/STO.6/STO.7 — the shared aluno + professor storefront over the
 * billing rails: vitrine scoping/search/filter, the full Pix purchase through
 * the normalized-handler contract (order → charge → payment → simulate →
 * paid + stock decrement + low-stock crossing), the professor buyer with a
 * NULL student_id and simulate access, refund → canceled + restore, the
 * idempotent re-delivery contract, the recorded oversell race, Meus pedidos
 * scoping, pending cancel, RBAC/RLS and the read-only bypass.
 */
describe('store: storefront + purchase lifecycle', () => {
  let t: TestApp;
  let aluno: string;
  let professor: string;
  let alphaId: string;
  let anaUserId: string;
  let productIdByName: Map<string, string>;
  const emitted: Record<string, any[]> = {
    paid: [],
    lowStock: [],
    canceled: [],
  };

  beforeAll(async () => {
    t = await createTestApp();
    aluno = (await t.login('aluno@tatame.dev')).accessToken;
    professor = (await t.login('professor@tatame.dev')).accessToken;
    alphaId = await t.academyIdBySlug('alpha-jj');

    const [ana] = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, 'aluno@tatame.dev')),
    );
    anaUserId = ana!.id;

    const vitrine = await t.http().get('/v1/store/products').set(bearer(aluno));
    productIdByName = new Map(
      vitrine.body.products.map((p: any) => [p.name, p.id]),
    );

    const emitter = t.app.get(EventEmitter2);
    emitter.on(STORE_ORDER_PAID, (e) => emitted['paid']!.push(e));
    emitter.on(STORE_PRODUCT_LOW_STOCK, (e) => emitted['lowStock']!.push(e));
    emitter.on(STORE_ORDER_CANCELED, (e) => emitted['canceled']!.push(e));
  });

  afterAll(async () => {
    await t.setAcademyStatus('alpha-jj', 'active');
    await t.close();
  });

  const stockOf = async (name: string) => {
    const [row] = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select({ stockQty: products.stockQty })
        .from(products)
        .where(eq(products.id, productIdByName.get(name)!)),
    );
    return row!.stockQty;
  };

  const chargeOfOrder = async (orderId: string) => {
    const [row] = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select()
        .from(charges)
        .where(and(eq(charges.origin, 'order'), eq(charges.orderId, orderId))),
    );
    return row!;
  };

  /** order → Pix payment → simulate, over the public routes. */
  const payAndSimulate = async (token: string, chargeId: string) => {
    const payment = await t
      .http()
      .post(`/v1/store/charges/${chargeId}/payments`)
      .set(bearer(token))
      .send({ method: 'pix' });
    expect(payment.status).toBe(201);
    expect(payment.body.payment.status).toBe('pending');
    expect(payment.body.payment.providerData.qrPayload).toBe(
      `TATAME-SIM-PIX-${chargeId}`,
    );
    const simulated = await t
      .http()
      .post(`/v1/billing/payments/${payment.body.payment.id}/simulate`)
      .set(bearer(token));
    expect(simulated.status).toBe(200);
    expect(simulated.body.charge.status).toBe('paid');
    return payment.body.payment;
  };

  it('vitrine: active-only grid + category chips, shared by aluno and professor', async () => {
    for (const token of [aluno, professor]) {
      const res = await t.http().get('/v1/store/products').set(bearer(token));
      expect(res.status).toBe(200);
      expect(res.body.products).toHaveLength(6);
      expect(res.body.categories.map((c: any) => c.name).sort()).toEqual([
        'Acessorios',
        'Faixas',
        'Kimonos',
        'Vestuario',
      ]);
    }
    const res = await t.http().get('/v1/store/products').set(bearer(aluno));
    const kimono = res.body.products.find(
      (p: any) => p.name === 'Kimono Oficial',
    );
    expect(kimono).toMatchObject({
      priceCents: 34_900,
      monogram: 'GI',
      gradientPreset: 'store-blue-purple',
      categoryName: 'Kimonos',
    });
  });

  it('vitrine search matches name AND tags; category chip filters; honest empty state', async () => {
    // "nogi" is only a tag (Rashguard Team).
    const byTag = await t
      .http()
      .get('/v1/store/products?search=nogi')
      .set(bearer(aluno));
    expect(byTag.body.products.map((p: any) => p.name)).toEqual([
      'Rashguard Team',
    ]);

    const byName = await t
      .http()
      .get('/v1/store/products?search=mochila')
      .set(bearer(aluno));
    expect(byName.body.products.map((p: any) => p.name)).toEqual([
      'Mochila de Treino',
    ]);

    const acessorios = (
      await t.http().get('/v1/store/products').set(bearer(aluno))
    ).body.categories.find((c: any) => c.name === 'Acessorios');
    const filtered = await t
      .http()
      .get(`/v1/store/products?categoryId=${acessorios.id}`)
      .set(bearer(aluno));
    expect(filtered.body.products.map((p: any) => p.name).sort()).toEqual([
      'Mochila de Treino',
      'Protetor Bucal',
    ]);

    const empty = await t
      .http()
      .get('/v1/store/products?search=inexistente')
      .set(bearer(aluno));
    expect(empty.status).toBe(200);
    expect(empty.body.products).toEqual([]);
  });

  it('product detail: gallery derivation inputs, size pills, stock; cross-tenant 404', async () => {
    const res = await t
      .http()
      .get(`/v1/store/products/${productIdByName.get('Kimono Oficial')}`)
      .set(bearer(professor));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: 'Kimono Oficial',
      monogram: 'GI',
      gradientPreset: 'store-blue-purple',
      sizes: ['A1', 'A2', 'A3', 'A4'],
      stockQty: 12,
      tags: ['kimono', 'gi', 'competicao'],
    });

    // RLS backstop: a bravo product id behaves as 404 for an alpha buyer.
    const bravoId = await t.academyIdBySlug('bravo-bjj');
    const [bravoProduct] = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select({ id: products.id })
        .from(products)
        .where(eq(products.tenantId, bravoId)),
    );
    const foreign = await t
      .http()
      .get(`/v1/store/products/${bravoProduct!.id}`)
      .set(bearer(aluno));
    expect(foreign.status).toBe(404);
  });

  it('aluno home gains the "Loja da academia" strip (first 3 active products)', async () => {
    const res = await t.http().get('/v1/aluno/home').set(bearer(aluno));
    expect(res.status).toBe(200);
    expect(res.body.storeStrip).toHaveLength(3);
    expect(res.body.storeStrip.map((p: any) => p.name)).toEqual([
      'Kimono Oficial',
      'Rashguard Team',
      'Faixa Oficial',
    ]);
  });

  it('order validation: stock cap, size required / size invalid, archived product', async () => {
    const gi = productIdByName.get('Kimono Oficial')!;
    const mochila = productIdByName.get('Mochila de Treino')!;

    const tooMany = await t
      .http()
      .post('/v1/store/orders')
      .set(bearer(aluno))
      .send({ productId: gi, size: 'A2', quantity: 99 });
    expect(tooMany.status).toBe(422);
    expect(tooMany.body.code).toBe('store.insufficient_stock');

    const noSize = await t
      .http()
      .post('/v1/store/orders')
      .set(bearer(aluno))
      .send({ productId: gi, quantity: 1 });
    expect(noSize.status).toBe(422);
    expect(noSize.body.code).toBe('store.size_required');

    const wrongSize = await t
      .http()
      .post('/v1/store/orders')
      .set(bearer(aluno))
      .send({ productId: gi, size: 'XL', quantity: 1 });
    expect(wrongSize.status).toBe(422);
    expect(wrongSize.body.code).toBe('store.size_invalid');

    // A sizeless product refuses a size (nothing silently dropped).
    const sizeless = await t
      .http()
      .post('/v1/store/orders')
      .set(bearer(aluno))
      .send({ productId: mochila, size: 'M', quantity: 1 });
    expect(sizeless.status).toBe(422);
    expect(sizeless.body.code).toBe('store.size_invalid');

    const zero = await t
      .http()
      .post('/v1/store/orders')
      .set(bearer(aluno))
      .send({ productId: gi, size: 'A2', quantity: 0 });
    expect(zero.status).toBe(422);
    expect(zero.body.code).toBe('validation.failed');

    // Archive a throwaway product as admin, then try to buy it: 422.
    const admin = (await t.login('admin@tatame.dev')).accessToken;
    const throwaway = await t
      .http()
      .post('/v1/admin/store/products')
      .set(bearer(admin))
      .send({ name: 'Sumido', priceCents: 100, stockQty: 5 });
    await t
      .http()
      .delete(`/v1/admin/store/products/${throwaway.body.id}`)
      .set(bearer(admin));
    const archived = await t
      .http()
      .post('/v1/store/orders')
      .set(bearer(aluno))
      .send({ productId: throwaway.body.id, quantity: 1 });
    expect(archived.status).toBe(422);
    expect(archived.body.code).toBe('store.product_not_purchasable');
  });

  let giOrderId: string;
  let giChargeId: string;

  it('full aluno purchase: order #max+1 + snapshot + charge → Pix → simulate → paid + stock decrement', async () => {
    expect(await stockOf('Kimono Oficial')).toBe(12);

    const created = await t
      .http()
      .post('/v1/store/orders')
      .set(bearer(aluno))
      .send({
        productId: productIdByName.get('Kimono Oficial'),
        size: 'A2',
        quantity: 1,
      });
    expect(created.status).toBe(201);
    expect(created.body.order).toMatchObject({
      number: 2432, // seeded max #2431 + 1
      status: 'pending',
      totalCents: 34_900,
      pickupNote: 'Retirada na recepção',
    });
    expect(created.body.order.item).toMatchObject({
      productName: 'Kimono Oficial',
      size: 'A2',
      quantity: 1,
      unitPriceCents: 34_900,
    });
    giOrderId = created.body.order.id;
    giChargeId = created.body.chargeId;
    expect(created.body.order.chargeId).toBe(giChargeId);

    // The charge is order-origin, addressed to Ana's student row (Carteira).
    const charge = await chargeOfOrder(giOrderId);
    expect(charge).toMatchObject({
      id: giChargeId,
      origin: 'order',
      amountCents: 34_900,
      status: 'open',
    });
    expect(charge.studentId).not.toBeNull();

    // No reservation: creating the pending order moved no stock.
    expect(await stockOf('Kimono Oficial')).toBe(12);

    await payAndSimulate(aluno, giChargeId);

    // Handler effects: order paid, stock decremented exactly once, receipt event.
    const mine = await t.http().get('/v1/store/orders').set(bearer(aluno));
    const order = mine.body.orders.find((o: any) => o.id === giOrderId);
    expect(order.status).toBe('paid');
    expect(order.chargeId).toBeNull(); // nothing left to pay
    expect(await stockOf('Kimono Oficial')).toBe(11);

    const paidEvent = emitted['paid']!.find((e) => e.orderId === giOrderId);
    expect(paidEvent).toMatchObject({
      number: 2432,
      productName: 'Kimono Oficial',
      buyerUserId: anaUserId,
      totalCents: 34_900,
    });

    // The aluno Carteira histórico picked the store payment up (story 29).
    const wallet = await t.http().get('/v1/aluno/wallet').set(bearer(aluno));
    expect(wallet.body.history.map((h: any) => h.amountCents)).toContain(
      34_900,
    );
  });

  it('CONTRACT: re-delivered payment.succeeded no-ops — never a second decrement', async () => {
    const providerEvents = t.app.get(ProviderEventsService);
    const outcome = await providerEvents.handleProviderEvent(
      {
        type: 'payment.succeeded',
        provider: 'simulated',
        tenantId: alphaId,
        providerPaymentId: `SIM-PIX-${giChargeId}`,
        paidAt: new Date().toISOString(),
      },
      { userId: anaUserId, impersonatorUserId: null },
    );
    expect(outcome.applied).toBe(false);
    expect(await stockOf('Kimono Oficial')).toBe(11);
    expect(
      emitted['paid']!.filter((e) => e.orderId === giOrderId),
    ).toHaveLength(1);
  });

  let mcOrderId: string;
  let mcChargeId: string;

  it('professor purchase: order charge with NULL student_id, simulate allowed for the role', async () => {
    const created = await t
      .http()
      .post('/v1/store/orders')
      .set(bearer(professor))
      .send({
        productId: productIdByName.get('Mochila de Treino'),
        quantity: 1,
      });
    expect(created.status).toBe(201);
    expect(created.body.order.number).toBe(2433);
    mcOrderId = created.body.order.id;
    mcChargeId = created.body.chargeId;

    // The STO.2 relaxation: a professor buyer has no student row.
    const charge = await chargeOfOrder(mcOrderId);
    expect(charge.studentId).toBeNull();
    expect(charge.guardianId).toBeNull();

    await payAndSimulate(professor, mcChargeId);
    expect(await stockOf('Mochila de Treino')).toBe(7);

    const mine = await t.http().get('/v1/store/orders').set(bearer(professor));
    const order = mine.body.orders.find((o: any) => o.id === mcOrderId);
    expect(order.status).toBe('paid');
    // 8 → 7 with threshold 5: no crossing, no low-stock emission.
    expect(
      emitted['lowStock']!.filter((e) => e.name === 'Mochila de Treino'),
    ).toHaveLength(0);
  });

  it('low-stock event fires exactly when a paid decrement crosses the threshold', async () => {
    // Mochila at 7, threshold 5: buying 3 crosses (7 > 5 ≥ 4).
    const created = await t
      .http()
      .post('/v1/store/orders')
      .set(bearer(aluno))
      .send({
        productId: productIdByName.get('Mochila de Treino'),
        quantity: 3,
      });
    expect(created.status).toBe(201);
    await payAndSimulate(aluno, created.body.chargeId);

    expect(await stockOf('Mochila de Treino')).toBe(4);
    const events = emitted['lowStock']!.filter(
      (e) => e.name === 'Mochila de Treino',
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ stockQty: 4, lowStockThreshold: 5 });
  });

  it('CONTRACT: refund → order canceled + stock restored, idempotent re-delivery', async () => {
    const providerEvents = t.app.get(ProviderEventsService);
    const refundEvent = {
      type: 'payment.refunded' as const,
      provider: 'simulated' as const,
      tenantId: alphaId,
      providerPaymentId: `SIM-PIX-${mcChargeId}`,
      providerRefundId: `SIM-REFUND-SIM-PIX-${mcChargeId}`,
      reason: 'contract-test',
    };
    const first = await providerEvents.handleProviderEvent(refundEvent, {
      userId: anaUserId,
      impersonatorUserId: null,
    });
    expect(first.applied).toBe(true);

    // Order flipped + the mochila unit came back (4 → 5).
    const mine = await t.http().get('/v1/store/orders').set(bearer(professor));
    expect(mine.body.orders.find((o: any) => o.id === mcOrderId).status).toBe(
      'canceled',
    );
    expect(await stockOf('Mochila de Treino')).toBe(5);
    const canceled = emitted['canceled']!.find((e) => e.orderId === mcOrderId);
    expect(canceled).toMatchObject({ refunded: true, number: 2433 });

    // Re-delivery no-ops: no second restore, no second emission.
    const second = await providerEvents.handleProviderEvent(refundEvent, {
      userId: anaUserId,
      impersonatorUserId: null,
    });
    expect(second.applied).toBe(false);
    expect(await stockOf('Mochila de Treino')).toBe(5);
    expect(
      emitted['canceled']!.filter((e) => e.orderId === mcOrderId),
    ).toHaveLength(1);
  });

  it('OVERSELL: two pendings race to settlement — both paid, stock goes negative (recorded)', async () => {
    // Protetor Bucal: stock 2. Two buyers order 2 each — both pass the
    // creation check (no reservation on pending, story 34).
    const pb = productIdByName.get('Protetor Bucal')!;
    const first = await t
      .http()
      .post('/v1/store/orders')
      .set(bearer(aluno))
      .send({ productId: pb, quantity: 2 });
    const second = await t
      .http()
      .post('/v1/store/orders')
      .set(bearer(professor))
      .send({ productId: pb, quantity: 2 });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    // Both settle: a paid settlement NEVER fails on stock.
    await payAndSimulate(aluno, first.body.chargeId);
    await payAndSimulate(professor, second.body.chargeId);

    expect(await stockOf('Protetor Bucal')).toBe(-2);
    const alunoOrders = await t
      .http()
      .get('/v1/store/orders')
      .set(bearer(aluno));
    expect(
      alunoOrders.body.orders.find((o: any) => o.id === first.body.order.id)
        .status,
    ).toBe('paid');
    const professorOrders = await t
      .http()
      .get('/v1/store/orders')
      .set(bearer(professor));
    expect(
      professorOrders.body.orders.find(
        (o: any) => o.id === second.body.order.id,
      ).status,
    ).toBe('paid');

    // The oversell surfaces on the admin tile (negative stock is still low).
    const admin = (await t.login('admin@tatame.dev')).accessToken;
    const overview = await t
      .http()
      .get('/v1/admin/store/overview')
      .set(bearer(admin));
    const pbTile = overview.body.lowStock.products.find(
      (p: any) => p.name === 'Protetor Bucal',
    );
    expect(pbTile.stockQty).toBe(-2);
  });

  it('meus pedidos is buyer-scoped; pending cancel voids the charge; paid cannot be canceled', async () => {
    const mine = await t.http().get('/v1/store/orders').set(bearer(aluno));
    const numbers = mine.body.orders.map((o: any) => o.number);
    // Ana's seeded orders + her purchases above — never the professor's.
    expect(numbers).toEqual(
      expect.arrayContaining([2427, 2428, 2430, 2431, 2432]),
    );
    expect(numbers).not.toContain(2429);
    expect(numbers).not.toContain(2433);

    // Buyer cancel of a fresh pending order voids its open charge.
    const created = await t
      .http()
      .post('/v1/store/orders')
      .set(bearer(aluno))
      .send({
        productId: productIdByName.get('Faixa Oficial'),
        size: 'A2',
        quantity: 1,
      });
    expect(created.status).toBe(201);
    const canceled = await t
      .http()
      .delete(`/v1/store/orders/${created.body.order.id}`)
      .set(bearer(aluno));
    expect(canceled.status).toBe(204);
    const charge = await chargeOfOrder(created.body.order.id);
    expect(charge.status).toBe('canceled');
    const after = await t.http().get('/v1/store/orders').set(bearer(aluno));
    const row = after.body.orders.find(
      (o: any) => o.id === created.body.order.id,
    );
    expect(row).toMatchObject({ status: 'canceled', chargeId: null });

    // Cancel is pending-only: re-cancel and canceling a paid order are 409.
    const again = await t
      .http()
      .delete(`/v1/store/orders/${created.body.order.id}`)
      .set(bearer(aluno));
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('store.order_not_cancelable');
    const paidRow = after.body.orders.find((o: any) => o.number === 2430);
    const paidCancel = await t
      .http()
      .delete(`/v1/store/orders/${paidRow.id}`)
      .set(bearer(aluno));
    expect(paidCancel.status).toBe(409);

    // Another buyer's pending order behaves as 404 (no existence leak).
    const anaPending = after.body.orders.find((o: any) => o.number === 2431);
    const foreignCancel = await t
      .http()
      .delete(`/v1/store/orders/${anaPending.id}`)
      .set(bearer(professor));
    expect(foreignCancel.status).toBe(404);
  });

  it('charge ownership is the order buyer: foreign charges and non-order charges are 404', async () => {
    // The professor cannot pay Ana's open order charge (#2431).
    const mine = await t.http().get('/v1/store/orders').set(bearer(aluno));
    const anaPending = mine.body.orders.find((o: any) => o.number === 2431);
    const foreign = await t
      .http()
      .post(`/v1/store/charges/${anaPending.chargeId}/payments`)
      .set(bearer(professor))
      .send({ method: 'pix' });
    expect(foreign.status).toBe(404);

    // The store route pays ORDER charges only — a mensalidade charge is 404.
    const wallet = await t.http().get('/v1/aluno/wallet').set(bearer(aluno));
    if (wallet.body.currentCharge) {
      const plan = await t
        .http()
        .post(`/v1/store/charges/${wallet.body.currentCharge.id}/payments`)
        .set(bearer(aluno))
        .send({ method: 'pix' });
      expect(plan.status).toBe(404);
    }

    // Pix-only in v1: the prototype's single CTA is enforced by the DTO.
    const card = await t
      .http()
      .post(`/v1/store/charges/${anaPending.chargeId}/payments`)
      .set(bearer(aluno))
      .send({ method: 'card' });
    expect(card.status).toBe(422);
    expect(card.body.code).toBe('validation.failed');
  });

  it('RBAC: responsável, admin and platform roles are denied the storefront', async () => {
    for (const email of [
      'responsavel@tatame.dev',
      'admin@tatame.dev',
      'owner@tatame.dev',
    ]) {
      const session = await t.login(email);
      const res = await t
        .http()
        .get('/v1/store/products')
        .set(bearer(session.accessToken));
      expect(res.status, email).toBe(403);
      expect(res.body.code).toBe('authz.forbidden_role');
    }
  });

  it('read-only academy: new orders blocked, paying an existing order charge still works', async () => {
    await t.setAcademyStatus('alpha-jj', 'delinquent');

    const blocked = await t
      .http()
      .post('/v1/store/orders')
      .set(bearer(aluno))
      .send({
        productId: productIdByName.get('Faixa Oficial'),
        size: 'A2',
        quantity: 1,
      });
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('tenant.read_only');

    // Reads still serve the vitrine.
    const vitrine = await t.http().get('/v1/store/products').set(bearer(aluno));
    expect(vitrine.status).toBe(200);

    // @BypassReadOnly: the seeded pending #2431 settles end to end.
    const mine = await t.http().get('/v1/store/orders').set(bearer(aluno));
    const pending = mine.body.orders.find((o: any) => o.number === 2431);
    expect(pending.chargeId).toBeTruthy();
    await payAndSimulate(aluno, pending.chargeId);

    const after = await t.http().get('/v1/store/orders').set(bearer(aluno));
    expect(after.body.orders.find((o: any) => o.number === 2431).status).toBe(
      'paid',
    );
    expect(await stockOf('Faixa Oficial')).toBe(14); // 15 − the settled unit

    await t.setAcademyStatus('alpha-jj', 'active');
  });
});
