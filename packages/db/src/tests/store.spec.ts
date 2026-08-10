import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
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
  charges,
  orderItems,
  orders,
  productCategories,
  products,
  students,
  users,
} from '../schema/index.js';
import { createFreshDb, testAdminUrl, type FreshDb } from '../testing/test-db.js';

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

describe('store schema (spec 009, STO.1–STO.2)', () => {
  let fresh: FreshDb;
  let app: DbHandle;
  let platform: DbHandle;

  let tenantA: string;
  let tenantB: string;
  let buyerUserId: string;
  let studentA: string;
  let planA: string;

  beforeAll(async () => {
    fresh = await createFreshDb(testAdminUrl());
    app = createAppDb(fresh.url);
    platform = createPlatformDb(fresh.url);

    await withPlatform(platform.db, async (tx) => {
      const [a] = await tx
        .insert(academies)
        .values({ name: 'Store A', slug: 'store-a', contactEmail: 'a@s.dev', status: 'active' })
        .returning({ id: academies.id });
      const [b] = await tx
        .insert(academies)
        .values({ name: 'Store B', slug: 'store-b', contactEmail: 'b@s.dev', status: 'active' })
        .returning({ id: academies.id });
      tenantA = a!.id;
      tenantB = b!.id;

      const [buyer] = await tx
        .insert(users)
        .values({ email: 'buyer@s.dev', fullName: 'Buyer' })
        .returning({ id: users.id });
      buyerUserId = buyer!.id;
    });

    await withTenant(app.db, tenantA, async (tx) => {
      const [s] = await tx
        .insert(students)
        .values({ tenantId: tenantA, fullName: 'Student A', birthDate: '2000-01-01' })
        .returning({ id: students.id });
      studentA = s!.id;
      const [p] = await tx
        .insert(academyPlans)
        .values({ tenantId: tenantA, name: 'Mensal', amountCents: 18_000, recurrence: 'monthly', dueDay: 5 })
        .returning({ id: academyPlans.id });
      planA = p!.id;
    });
  });

  afterAll(async () => {
    await app?.close();
    await platform?.close();
    await fresh?.drop();
  });

  const product = (overrides: Partial<typeof products.$inferInsert> = {}) =>
    ({
      tenantId: tenantA,
      name: `Product ${randomUUID()}`,
      priceCents: 12_900,
      monogram: 'GI',
      gradientPreset: 'store-blue-purple',
      ...overrides,
    }) as typeof products.$inferInsert;

  async function createOrder(
    tenantId: string,
    overrides: Partial<typeof orders.$inferInsert> = {},
  ): Promise<string> {
    const [row] = await withTenant(app.db, tenantId, (tx) =>
      tx
        .insert(orders)
        .values({
          tenantId,
          number: Math.floor(Math.random() * 1_000_000),
          buyerUserId,
          totalCents: 12_900,
          ...overrides,
        })
        .returning({ id: orders.id }),
    );
    return row!.id;
  }

  async function createProduct(
    tenantId: string,
    overrides: Partial<typeof products.$inferInsert> = {},
  ): Promise<string> {
    const [row] = await withTenant(app.db, tenantId, (tx) =>
      tx
        .insert(products)
        .values(product({ tenantId, ...overrides }))
        .returning({ id: products.id }),
    );
    return row!.id;
  }

  describe('product_categories (STO.1)', () => {
    it('holds one chip per name per tenant; the same name lives in both tenants', async () => {
      await withTenant(app.db, tenantA, (tx) =>
        tx.insert(productCategories).values({ tenantId: tenantA, name: 'Kimonos' }),
      );
      await expectDbError(
        withTenant(app.db, tenantA, (tx) =>
          tx.insert(productCategories).values({ tenantId: tenantA, name: 'Kimonos' }),
        ),
        /product_categories_tenant_name_uq/,
      );
      // Tenants never share a catalog: the same chip name is fine elsewhere.
      await withTenant(app.db, tenantB, (tx) =>
        tx.insert(productCategories).values({ tenantId: tenantB, name: 'Kimonos' }),
      );
    });

    it('restricts deleting a category while a product references it; rename stays allowed', async () => {
      const [category] = await withTenant(app.db, tenantA, (tx) =>
        tx
          .insert(productCategories)
          .values({ tenantId: tenantA, name: 'Faixas' })
          .returning({ id: productCategories.id }),
      );
      const productId = await createProduct(tenantA, { categoryId: category!.id, monogram: 'FX' });

      // Referenced: delete is blocked by the restrict FK (story 4).
      await expectDbError(
        withTenant(app.db, tenantA, (tx) =>
          tx.delete(productCategories).where(eq(productCategories.id, category!.id)),
        ),
        /products_category_fk/,
      );
      // Rename never orphans products.
      await withTenant(app.db, tenantA, (tx) =>
        tx
          .update(productCategories)
          .set({ name: 'Faixas Oficiais' })
          .where(eq(productCategories.id, category!.id)),
      );
      // Once no product references it, delete succeeds.
      await withTenant(app.db, tenantA, (tx) =>
        tx.update(products).set({ categoryId: null }).where(eq(products.id, productId)),
      );
      await withTenant(app.db, tenantA, (tx) =>
        tx.delete(productCategories).where(eq(productCategories.id, category!.id)),
      );
    });
  });

  describe('products (STO.1)', () => {
    it('defaults stock 0, threshold 5, empty tags/sizes arrays and active status', async () => {
      const [row] = await withTenant(app.db, tenantA, (tx) =>
        tx.insert(products).values(product()).returning(),
      );
      expect(row!.stockQty).toBe(0);
      expect(row!.lowStockThreshold).toBe(5);
      expect(row!.tags).toEqual([]);
      expect(row!.sizes).toEqual([]);
      expect(row!.status).toBe('active');
      expect(row!.archivedAt).toBeNull();
      expect(row!.categoryId).toBeNull(); // a product may live outside the chips
    });

    it('rejects non-positive prices (products_price_ck)', async () => {
      await expectDbError(
        withTenant(app.db, tenantA, (tx) => tx.insert(products).values(product({ priceCents: 0 }))),
        /products_price_ck/,
      );
      await expectDbError(
        withTenant(app.db, tenantA, (tx) =>
          tx.insert(products).values(product({ priceCents: -100 })),
        ),
        /products_price_ck/,
      );
    });

    it('rejects a negative low-stock threshold and out-of-shape monograms', async () => {
      await expectDbError(
        withTenant(app.db, tenantA, (tx) =>
          tx.insert(products).values(product({ lowStockThreshold: -1 })),
        ),
        /products_low_stock_threshold_ck/,
      );
      await expectDbError(
        withTenant(app.db, tenantA, (tx) => tx.insert(products).values(product({ monogram: '' }))),
        /products_monogram_ck/,
      );
      await expectDbError(
        withTenant(app.db, tenantA, (tx) =>
          tx.insert(products).values(product({ monogram: 'GIGI' })),
        ),
        /products_monogram_ck/,
      );
    });

    it('lets stock go negative — the recorded oversell behavior (story 34)', async () => {
      // No `stock_qty >= 0` CHECK on purpose: pending orders never reserve
      // stock, so the losing concurrent settlement drives it negative rather
      // than failing a paid payment (surfaced on the admin board).
      const productId = await createProduct(tenantA, { stockQty: 1 });
      const [row] = await withTenant(app.db, tenantA, (tx) =>
        tx
          .update(products)
          .set({ stockQty: -1 })
          .where(eq(products.id, productId))
          .returning({ stockQty: products.stockQty }),
      );
      expect(row!.stockQty).toBe(-1);
    });

    it('rejects a category from another tenant (products_category_fk)', async () => {
      const [foreignCategory] = await withTenant(app.db, tenantB, (tx) =>
        tx
          .insert(productCategories)
          .values({ tenantId: tenantB, name: `Foreign ${randomUUID()}` })
          .returning({ id: productCategories.id }),
      );
      await expectDbError(
        withTenant(app.db, tenantA, (tx) =>
          tx.insert(products).values(product({ categoryId: foreignCategory!.id })),
        ),
        /products_category_fk/,
      );
    });
  });

  describe('orders + order_items (STO.2)', () => {
    it('defaults status pending and the fixed retirada pickup note', async () => {
      const [row] = await withTenant(app.db, tenantA, (tx) =>
        tx
          .insert(orders)
          .values({ tenantId: tenantA, number: 2431, buyerUserId, totalCents: 8_900 })
          .returning(),
      );
      expect(row!.status).toBe('pending');
      expect(row!.pickupNote).toBe('Retirada na recepção');
      expect(row!.canceledAt).toBeNull();
    });

    it('keeps the #NNNN number sequential truth per tenant (orders_tenant_number_uq)', async () => {
      await expectDbError(
        withTenant(app.db, tenantA, (tx) =>
          tx
            .insert(orders)
            .values({ tenantId: tenantA, number: 2431, buyerUserId, totalCents: 5_900 }),
        ),
        /orders_tenant_number_uq/,
      );
      // Another academy counts on its own: the same number is fine there.
      await withTenant(app.db, tenantB, (tx) =>
        tx.insert(orders).values({ tenantId: tenantB, number: 2431, buyerUserId, totalCents: 5_900 }),
      );
    });

    it('snapshots the item and rejects non-positive quantities (order_items_quantity_ck)', async () => {
      const orderId = await createOrder(tenantA);
      const productId = await createProduct(tenantA, { sizes: ['P', 'M', 'G'] });
      const item = {
        tenantId: tenantA,
        orderId,
        productId,
        size: 'M',
        quantity: 1,
        unitPriceCents: 12_900,
      };
      const [row] = await withTenant(app.db, tenantA, (tx) =>
        tx.insert(orderItems).values(item).returning(),
      );
      expect(row!.unitPriceCents).toBe(12_900); // snapshot, never the live price
      await expectDbError(
        withTenant(app.db, tenantA, (tx) => tx.insert(orderItems).values({ ...item, quantity: 0 })),
        /order_items_quantity_ck/,
      );
      await expectDbError(
        withTenant(app.db, tenantA, (tx) => tx.insert(orderItems).values({ ...item, quantity: -2 })),
        /order_items_quantity_ck/,
      );
    });

    it('rejects cross-tenant order and product references (composite FKs)', async () => {
      const foreignOrderId = await createOrder(tenantB);
      const productId = await createProduct(tenantA);
      await expectDbError(
        withTenant(app.db, tenantA, (tx) =>
          tx.insert(orderItems).values({
            tenantId: tenantA,
            orderId: foreignOrderId,
            productId,
            quantity: 1,
            unitPriceCents: 12_900,
          }),
        ),
        /order_items_order_fk/,
      );
      const orderId = await createOrder(tenantA);
      const foreignProductId = await createProduct(tenantB);
      await expectDbError(
        withTenant(app.db, tenantA, (tx) =>
          tx.insert(orderItems).values({
            tenantId: tenantA,
            orderId,
            productId: foreignProductId,
            quantity: 1,
            unitPriceCents: 12_900,
          }),
        ),
        /order_items_product_fk/,
      );
    });
  });

  describe('charges.order_id hardening (STO.2 closing the last BIL.2 stub)', () => {
    const orderCharge = (orderId: string, overrides: Partial<typeof charges.$inferInsert> = {}) =>
      ({
        tenantId: tenantA,
        origin: 'order' as const,
        orderId,
        amountCents: 12_900,
        dueDate: '2026-09-01',
        ...overrides,
      }) as typeof charges.$inferInsert;

    it('accepts an order charge linked to a real order, satisfying the per-origin CHECK', async () => {
      const orderId = await createOrder(tenantA);
      const [charge] = await withTenant(app.db, tenantA, (tx) =>
        tx.insert(charges).values(orderCharge(orderId, { studentId: studentA })).returning(),
      );
      expect(charge!.origin).toBe('order');
      expect(charge!.orderId).toBe(orderId);
      expect(charge!.academyPlanId).toBeNull();
      expect(charge!.eventRegistrationId).toBeNull();
    });

    it('rejects the dangling uuids the BIL.2 stub used to admit', async () => {
      await expectDbError(
        withTenant(app.db, tenantA, (tx) =>
          tx.insert(charges).values(orderCharge(randomUUID(), { studentId: studentA })),
        ),
        /charges_order_fk/,
      );
    });

    it('rejects an order charge referencing another tenant order', async () => {
      const foreignOrderId = await createOrder(tenantB);
      await expectDbError(
        withTenant(app.db, tenantA, (tx) =>
          tx.insert(charges).values(orderCharge(foreignOrderId, { studentId: studentA })),
        ),
        /charges_order_fk/,
      );
    });

    it('still enforces exactly-one-origin on order charges (charges_origin_ck)', async () => {
      const orderId = await createOrder(tenantA);
      await expectDbError(
        withTenant(app.db, tenantA, (tx) =>
          tx
            .insert(charges)
            .values(orderCharge(orderId, { studentId: studentA, academyPlanId: planA })),
        ),
        /charges_origin_ck/,
      );
      await expectDbError(
        withTenant(app.db, tenantA, (tx) =>
          tx.insert(charges).values(orderCharge(orderId, { studentId: studentA, orderId: null })),
        ),
        /charges_origin_ck/,
      );
    });
  });

  describe('charges.student_id relaxation (STO.2)', () => {
    it('accepts an order charge without a student — the professor buyer has no student row', async () => {
      const orderId = await createOrder(tenantA);
      const [charge] = await withTenant(app.db, tenantA, (tx) =>
        tx
          .insert(charges)
          .values({
            tenantId: tenantA,
            origin: 'order',
            orderId,
            amountCents: 34_900,
            dueDate: '2026-09-01',
          })
          .returning(),
      );
      expect(charge!.studentId).toBeNull();
      expect(charge!.guardianId).toBeNull(); // no responsável store in v1
    });

    it('still requires the student on plan charges (charges_student_origin_ck)', async () => {
      await expectDbError(
        withTenant(app.db, tenantA, (tx) =>
          tx.insert(charges).values({
            tenantId: tenantA,
            origin: 'plan',
            academyPlanId: planA,
            periodStart: '2026-08-01',
            periodEnd: '2026-08-31',
            amountCents: 18_000,
            dueDate: '2026-08-05',
          }),
        ),
        /charges_student_origin_ck/,
      );
    });
  });

  describe('RLS on the store tables', () => {
    it('fails closed with no tenant context on all four tables', async () => {
      expect(await app.db.select().from(productCategories)).toHaveLength(0);
      expect(await app.db.select().from(products)).toHaveLength(0);
      expect(await app.db.select().from(orders)).toHaveLength(0);
      expect(await app.db.select().from(orderItems)).toHaveLength(0);
    });

    it('keeps each tenant blind to the other tenant catalog and orders; WITH CHECK blocks cross-tenant writes', async () => {
      const productsB = await withTenant(app.db, tenantB, (tx) => tx.select().from(products));
      expect(productsB.length).toBeGreaterThanOrEqual(1);
      expect(productsB.every((p) => p.tenantId === tenantB)).toBe(true);

      const ordersB = await withTenant(app.db, tenantB, (tx) => tx.select().from(orders));
      expect(ordersB.every((o) => o.tenantId === tenantB)).toBe(true);

      await expectDbError(
        withTenant(app.db, tenantB, (tx) => tx.insert(products).values(product())),
        /row-level security/,
      );
      await expectDbError(
        withTenant(app.db, tenantB, (tx) =>
          tx
            .insert(orders)
            .values({ tenantId: tenantA, number: 9_999, buyerUserId, totalCents: 5_900 }),
        ),
        /row-level security/,
      );
    });
  });
});
