import 'reflect-metadata';
import { ModulesContainer } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ROLES_KEY,
  STORE_ORDER_CANCELED,
  STORE_ORDER_DELIVERED,
  STORE_ORDER_READY,
} from '@org/api';
import { auditLogs, charges, payments, products, withPlatform } from '@tatame/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, createTestApp, type TestApp } from './support/test-app.js';

const TZ = 'America/Sao_Paulo';
const tzDate = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);

/**
 * STO.4/STO.6/STO.7 — the admin Loja console: overview tiles vs the seeded
 * fixtures (tenant timezone), categorias CRUD with the guarded delete,
 * produtos CRUD + archive (never hard-delete), the pedidos board (pending
 * excluded) with the paid→ready→delivered matrix and the Cancelado refund
 * path, read-only/RBAC/RLS, and the professor-consumer-only CI metadata
 * assertion.
 */
describe('store: admin console + orders lifecycle', () => {
  let t: TestApp;
  let admin: string;
  let alphaId: string;
  let productIdByName: Map<string, string>;
  const emitted: Record<string, any[]> = { ready: [], delivered: [], canceled: [] };

  beforeAll(async () => {
    t = await createTestApp();
    admin = (await t.login('admin@tatame.dev')).accessToken;
    alphaId = await t.academyIdBySlug('alpha-jj');

    const list = await t.http().get('/v1/admin/store/products').set(bearer(admin));
    productIdByName = new Map(list.body.products.map((p: any) => [p.name, p.id]));

    const emitter = t.app.get(EventEmitter2);
    emitter.on(STORE_ORDER_READY, (e) => emitted['ready']!.push(e));
    emitter.on(STORE_ORDER_DELIVERED, (e) => emitted['delivered']!.push(e));
    emitter.on(STORE_ORDER_CANCELED, (e) => emitted['canceled']!.push(e));
  });

  afterAll(async () => {
    await t.close();
  });

  const auditRows = (action: string, targetId: string) =>
    withPlatform(t.platformDb.db, (tx) =>
      tx
        .select()
        .from(auditLogs)
        .where(and(eq(auditLogs.action, action), eq(auditLogs.targetId, targetId))),
    );

  const stockOf = async (productId: string) => {
    const [row] = await withPlatform(t.platformDb.db, (tx) =>
      tx.select({ stockQty: products.stockQty }).from(products).where(eq(products.id, productId)),
    );
    return row!.stockQty;
  };

  const boardRow = async (number: number) => {
    const res = await t.http().get('/v1/admin/store/orders').set(bearer(admin));
    expect(res.status).toBe(200);
    return res.body.orders.find((o: any) => o.number === number);
  };

  it('overview tiles: vendas do mês (tenant tz), pedidos no mês, estoque baixo — vs seeds', async () => {
    const res = await t.http().get('/v1/admin/store/overview').set(bearer(admin));
    expect(res.status).toBe(200);

    const month = tzDate(new Date()).slice(0, 7);
    expect(res.body.month).toBe(month);

    // Seeded settled order payments (paid_at = N days ago): #2427 delivered
    // 11 800 @10d, #2428 refunded 12 900 @7d, #2429 ready 34 900 @2d,
    // #2430 paid 3 900 @1d. Recompute the month window like the API does.
    const inMonth = (daysAgo: number) =>
      tzDate(new Date(Date.now() - daysAgo * 86_400_000)).slice(0, 7) === month;
    const expectedVendas =
      (inMonth(10) ? 11_800 : 0) + (inMonth(2) ? 34_900 : 0) + (inMonth(1) ? 3_900 : 0);
    // Pedidos count orders that REACHED paid in the month — the later-refunded
    // #2428 still counts (paid_at survives the refund).
    const expectedPedidos = [10, 7, 2, 1].filter(inMonth).length;

    expect(res.body.vendasMesCents).toBe(expectedVendas);
    expect(res.body.pedidosMesCount).toBe(expectedPedidos);

    // Estoque baixo: only PB (stock 2 <= threshold 5), per-product threshold.
    expect(res.body.lowStock.count).toBe(1);
    expect(res.body.lowStock.products).toHaveLength(1);
    expect(res.body.lowStock.products[0]).toMatchObject({
      name: 'Protetor Bucal',
      monogram: 'PB',
      stockQty: 2,
      lowStockThreshold: 5,
    });
  });

  it('produto rows per admin-03: stock, derived vendidos, category, low-stock flag', async () => {
    const res = await t.http().get('/v1/admin/store/products').set(bearer(admin));
    expect(res.status).toBe(200);
    expect(res.body.products).toHaveLength(6);

    const byName = (name: string) => res.body.products.find((p: any) => p.name === name);
    // Vendidos across paid/ready/delivered only: TS ×2 (delivered), GI ×1
    // (ready), PB ×1 (paid); the refunded RG and pending FX count nothing.
    expect(byName('Camiseta da Academia')).toMatchObject({
      soldCount: 2,
      stockQty: 30,
      categoryName: 'Vestuario',
      lowStock: false,
    });
    expect(byName('Kimono Oficial')).toMatchObject({
      soldCount: 1,
      monogram: 'GI',
      gradientPreset: 'store-blue-purple',
      priceCents: 34_900,
      sizes: ['A1', 'A2', 'A3', 'A4'],
      categoryName: 'Kimonos',
    });
    expect(byName('Rashguard Team')).toMatchObject({ soldCount: 0, stockQty: 20 });
    expect(byName('Faixa Oficial')).toMatchObject({ soldCount: 0 });
    expect(byName('Protetor Bucal')).toMatchObject({ soldCount: 1, lowStock: true, stockQty: 2 });
  });

  it('categorias: chips with counts; create, duplicate 409, rename', async () => {
    const list = await t.http().get('/v1/admin/store/categories').set(bearer(admin));
    expect(list.status).toBe(200);
    const byName = (name: string) => list.body.categories.find((c: any) => c.name === name);
    expect(byName('Kimonos').productCount).toBe(1);
    expect(byName('Vestuario').productCount).toBe(2);
    expect(byName('Acessorios').productCount).toBe(2);

    const created = await t
      .http()
      .post('/v1/admin/store/categories')
      .set(bearer(admin))
      .send({ name: 'Promocoes' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Promocoes', productCount: 0 });
    expect(await auditRows('store.category.created', created.body.id)).toHaveLength(1);

    const dup = await t
      .http()
      .post('/v1/admin/store/categories')
      .set(bearer(admin))
      .send({ name: 'Promocoes' });
    expect(dup.status).toBe(409);

    const renamed = await t
      .http()
      .patch(`/v1/admin/store/categories/${created.body.id}`)
      .set(bearer(admin))
      .send({ name: 'Ofertas' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.name).toBe('Ofertas');
    expect(await auditRows('store.category.updated', created.body.id)).toHaveLength(1);
  });

  it('category delete is guarded: referenced → 409 category.in_use; empty deletes', async () => {
    const list = await t.http().get('/v1/admin/store/categories').set(bearer(admin));
    const kimonos = list.body.categories.find((c: any) => c.name === 'Kimonos');

    const blocked = await t
      .http()
      .delete(`/v1/admin/store/categories/${kimonos.id}`)
      .set(bearer(admin));
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('category.in_use');

    const ofertas = list.body.categories.find((c: any) => c.name === 'Ofertas');
    const gone = await t
      .http()
      .delete(`/v1/admin/store/categories/${ofertas.id}`)
      .set(bearer(admin));
    expect(gone.status).toBe(204);
    expect(await auditRows('store.category.deleted', ofertas.id)).toHaveLength(1);

    const after = await t.http().get('/v1/admin/store/categories').set(bearer(admin));
    expect(after.body.categories.map((c: any) => c.name)).not.toContain('Ofertas');
  });

  let createdProductId: string;

  it('novo produto: monogram derived from the name, gradient preset cycled', async () => {
    const res = await t
      .http()
      .post('/v1/admin/store/products')
      .set(bearer(admin))
      .send({
        name: 'Squeeze Oficial',
        priceCents: 4500,
        stockQty: 10,
        lowStockThreshold: 3,
        tags: ['squeeze', 'hidratacao'],
      });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      monogram: 'SO', // "Squeeze Oficial" initials
      status: 'active',
      soldCount: 0,
      lowStock: false,
      sizes: [],
    });
    // 6 seeded products → the 7th cycles to catalog index 6 % 4 = 2.
    expect(res.body.gradientPreset).toBe('store-orange-red');
    createdProductId = res.body.id;
    expect(await auditRows('store.product.created', createdProductId)).toHaveLength(1);

    const zero = await t
      .http()
      .post('/v1/admin/store/products')
      .set(bearer(admin))
      .send({ name: 'Gratis Errado', priceCents: 0 });
    expect(zero.status).toBe(422);
    expect(zero.body.code).toBe('validation.failed');

    const badCategory = await t
      .http()
      .post('/v1/admin/store/products')
      .set(bearer(admin))
      .send({
        name: 'Orfao',
        priceCents: 100,
        categoryId: '00000000-0000-0000-0000-000000000001',
      });
    expect(badCategory.status).toBe(422);
    expect(badCategory.body.errors[0].field).toBe('categoryId');
  });

  it('editar produto: partial update audited; archive freezes edits', async () => {
    const updated = await t
      .http()
      .patch(`/v1/admin/store/products/${createdProductId}`)
      .set(bearer(admin))
      .send({ priceCents: 4900, sizes: ['P', 'M'] });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ priceCents: 4900, sizes: ['P', 'M'] });
    expect(await auditRows('store.product.updated', createdProductId)).toHaveLength(1);

    // "Remover da loja" archives — the row survives with its history.
    const archived = await t
      .http()
      .delete(`/v1/admin/store/products/${createdProductId}`)
      .set(bearer(admin));
    expect(archived.status).toBe(200);
    expect(archived.body.status).toBe('archived');
    expect(await auditRows('store.product.archived', createdProductId)).toHaveLength(1);

    // Still on the admin list (as archived); frozen for edits; re-archive 409.
    const list = await t.http().get('/v1/admin/store/products').set(bearer(admin));
    const row = list.body.products.find((p: any) => p.id === createdProductId);
    expect(row.status).toBe('archived');
    const edit = await t
      .http()
      .patch(`/v1/admin/store/products/${createdProductId}`)
      .set(bearer(admin))
      .send({ priceCents: 5000 });
    expect(edit.status).toBe(409);
    const again = await t
      .http()
      .delete(`/v1/admin/store/products/${createdProductId}`)
      .set(bearer(admin));
    expect(again.status).toBe(409);

    // The vitrine never shows archived products (story 31).
    const aluno = await t.login('aluno@tatame.dev');
    const vitrine = await t.http().get('/v1/store/products').set(bearer(aluno.accessToken));
    expect(vitrine.status).toBe(200);
    expect(vitrine.body.products.map((p: any) => p.id)).not.toContain(createdProductId);
  });

  it('pedidos board per admin-04: pending excluded, buyer + item + status', async () => {
    const res = await t.http().get('/v1/admin/store/orders').set(bearer(admin));
    expect(res.status).toBe(200);

    const numbers = res.body.orders.map((o: any) => o.number);
    expect(numbers).toContain(2427); // delivered
    expect(numbers).toContain(2428); // canceled + refunded
    expect(numbers).toContain(2429); // ready (professor buyer)
    expect(numbers).toContain(2430); // paid
    expect(numbers).not.toContain(2431); // pending stays off the board

    const professorOrder = res.body.orders.find((o: any) => o.number === 2429);
    expect(professorOrder).toMatchObject({
      status: 'ready',
      totalCents: 34_900,
      pickupNote: 'Retirada na recepção',
    });
    expect(professorOrder.buyer.fullName).toBe('Paulo Professor');
    expect(professorOrder.item).toMatchObject({
      productName: 'Kimono Oficial',
      size: 'A2',
      quantity: 1,
      unitPriceCents: 34_900,
    });

    const anaOrder = res.body.orders.find((o: any) => o.number === 2427);
    expect(anaOrder.buyer.fullName).toBe('Ana Aluna');
    expect(anaOrder.item).toMatchObject({ productName: 'Camiseta da Academia', quantity: 2 });
  });

  it('transition matrix: paid → ready → delivered, audited; invalid moves 409', async () => {
    const paid = await boardRow(2430);
    expect(paid.status).toBe('paid');

    // No skipping: paid → delivered is invalid.
    const skip = await t
      .http()
      .post(`/v1/admin/store/orders/${paid.id}/status`)
      .set(bearer(admin))
      .send({ status: 'delivered' });
    expect(skip.status).toBe(409);
    expect(skip.body.code).toBe('store.order_invalid_transition');

    const ready = await t
      .http()
      .post(`/v1/admin/store/orders/${paid.id}/status`)
      .set(bearer(admin))
      .send({ status: 'ready' });
    expect(ready.status).toBe(200);
    expect(ready.body.status).toBe('ready');
    expect(emitted['ready']!.find((e) => e.orderId === paid.id)).toBeTruthy();

    // ready → ready is invalid (no re-application).
    const repeat = await t
      .http()
      .post(`/v1/admin/store/orders/${paid.id}/status`)
      .set(bearer(admin))
      .send({ status: 'ready' });
    expect(repeat.status).toBe(409);

    const delivered = await t
      .http()
      .post(`/v1/admin/store/orders/${paid.id}/status`)
      .set(bearer(admin))
      .send({ status: 'delivered' });
    expect(delivered.status).toBe(200);
    expect(delivered.body.status).toBe('delivered');
    expect(emitted['delivered']!.find((e) => e.orderId === paid.id)).toBeTruthy();

    // Delivered is terminal — no backward move, no cancel-with-refund.
    for (const status of ['ready', 'canceled'] as const) {
      const res = await t
        .http()
        .post(`/v1/admin/store/orders/${paid.id}/status`)
        .set(bearer(admin))
        .send({ status });
      expect(res.status, status).toBe(409);
      expect(res.body.code).toBe('store.order_invalid_transition');
    }

    // Both moves audited with from→to.
    const audits = await auditRows('store.order.status_changed', paid.id);
    const pairs = audits.map((a: any) => ({ from: a.metadata.from, to: a.metadata.to }));
    expect(pairs).toEqual(
      expect.arrayContaining([
        { from: 'paid', to: 'ready' },
        { from: 'ready', to: 'delivered' },
      ]),
    );
  });

  it('Cancelado runs the audited refund: order canceled + stock restored via the handler', async () => {
    const gi = productIdByName.get('Kimono Oficial')!;
    const stockBefore = await stockOf(gi);

    const ready = await boardRow(2429);
    const res = await t
      .http()
      .post(`/v1/admin/store/orders/${ready.id}/status`)
      .set(bearer(admin))
      .send({ status: 'canceled' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('canceled');

    // Money and cancellation never disagree: the charge + payment refunded…
    const [charge] = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select()
        .from(charges)
        .where(and(eq(charges.origin, 'order'), eq(charges.orderId, ready.id))),
    );
    expect(charge!.status).toBe('refunded');
    const [payment] = await withPlatform(t.platformDb.db, (tx) =>
      tx.select().from(payments).where(eq(payments.chargeId, charge!.id)),
    );
    expect(payment!.status).toBe('refunded');
    expect(payment!.providerRefundId).toBeTruthy();

    // …and the stock came back through the refund event, exactly once.
    expect(await stockOf(gi)).toBe(stockBefore + 1);
    const canceledEvent = emitted['canceled']!.find((e) => e.orderId === ready.id);
    expect(canceledEvent).toMatchObject({ refunded: true, number: 2429 });
    expect(await auditRows('store.order.canceled', ready.id)).toHaveLength(1);
    expect(await auditRows('billing.payment.refunded', payment!.id)).toHaveLength(1);

    // A canceled order cannot transition anywhere (409 on every move).
    const again = await t
      .http()
      .post(`/v1/admin/store/orders/${ready.id}/status`)
      .set(bearer(admin))
      .send({ status: 'canceled' });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('store.order_invalid_transition');
  });

  it('read-only academy: catalog + board mutations blocked, GETs served', async () => {
    await t.setAcademyStatus('alpha-jj', 'delinquent');

    const category = await t
      .http()
      .post('/v1/admin/store/categories')
      .set(bearer(admin))
      .send({ name: 'Bloqueada' });
    expect(category.status).toBe(403);
    expect(category.body.code).toBe('tenant.read_only');

    const product = await t
      .http()
      .post('/v1/admin/store/products')
      .set(bearer(admin))
      .send({ name: 'Bloqueado', priceCents: 100 });
    expect(product.status).toBe(403);

    const delivered = await boardRow(2427);
    const transition = await t
      .http()
      .post(`/v1/admin/store/orders/${delivered.id}/status`)
      .set(bearer(admin))
      .send({ status: 'ready' });
    expect(transition.status).toBe(403);
    expect(transition.body.code).toBe('tenant.read_only');

    const reads = await t.http().get('/v1/admin/store/overview').set(bearer(admin));
    expect(reads.status).toBe(200);
    await t.setAcademyStatus('alpha-jj', 'active');
  });

  it('RBAC: professor/aluno denied the admin console; cross-tenant ids are 404', async () => {
    const professor = await t.login('professor@tatame.dev');
    for (const [method, path] of [
      ['get', '/v1/admin/store/overview'],
      ['get', '/v1/admin/store/products'],
      ['get', '/v1/admin/store/orders'],
      ['post', '/v1/admin/store/categories'],
    ] as const) {
      const res = await (t.http() as any)[method](path).set(bearer(professor.accessToken)).send({});
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(res.body.code).toBe('authz.forbidden_role');
    }
    const aluno = await t.login('aluno@tatame.dev');
    const denied = await t.http().get('/v1/admin/store/products').set(bearer(aluno.accessToken));
    expect(denied.status).toBe(403);

    // RLS backstop: a bravo admin sees an alpha product id as 404, never 403.
    const bravoAdmin = await t.login('admin.bravo@tatame.dev');
    const foreign = await t
      .http()
      .patch(`/v1/admin/store/products/${productIdByName.get('Kimono Oficial')}`)
      .set(bearer(bravoAdmin.accessToken))
      .send({ priceCents: 1 });
    expect(foreign.status).toBe(404);
    // Alpha stock/price untouched (still 34 900 for the seeded kimono).
    const [kimono] = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select({ priceCents: products.priceCents, tenantId: products.tenantId })
        .from(products)
        .where(eq(products.id, productIdByName.get('Kimono Oficial')!)),
    );
    expect(kimono).toMatchObject({ priceCents: 34_900, tenantId: alphaId });
  });

  it('META: the professor is consumer-only — /store/* is student+professor, /admin/store/* is admin-only', () => {
    const modulesContainer = t.app.get(ModulesContainer, { strict: false });
    const storefrontRoutes: string[] = [];
    const adminRoutes: string[] = [];

    for (const module of modulesContainer.values()) {
      for (const wrapper of module.controllers.values()) {
        const metatype = wrapper.metatype as (new () => unknown) | undefined;
        if (!metatype) continue;
        const controllerPath: string = Reflect.getMetadata('path', metatype) ?? '';
        if (controllerPath !== 'store' && !controllerPath.startsWith('admin/store')) continue;
        const classRoles = Reflect.getMetadata(ROLES_KEY, metatype);
        const prototype = metatype.prototype as Record<string, unknown>;
        for (const name of Object.getOwnPropertyNames(prototype)) {
          if (name === 'constructor') continue;
          const handler = prototype[name];
          if (typeof handler !== 'function') continue;
          const path = Reflect.getMetadata('path', handler);
          const method = Reflect.getMetadata('method', handler);
          if (path === undefined || method === undefined) continue;
          const full = `${controllerPath}/${path}`.replaceAll('//', '/');
          const roles: string[] = Reflect.getMetadata(ROLES_KEY, handler) ?? classRoles ?? [];

          if (controllerPath.startsWith('admin/store')) {
            adminRoutes.push(full);
            // Zero professor (or any non-admin) access to store management.
            expect(roles, full).toEqual(['admin']);
          } else {
            storefrontRoutes.push(full);
            // The shared storefront: both consuming personas, nobody else.
            expect([...roles].sort(), full).toEqual(['professor', 'student']);
          }
        }
      }
    }

    // The spec surface exists: 6 storefront routes, 11 admin routes.
    expect(storefrontRoutes.length).toBe(6);
    expect(adminRoutes.length).toBe(11);
  });
});
