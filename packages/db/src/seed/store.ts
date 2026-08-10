import { and, eq, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import type { Database, DbTransaction } from '../lib/client.js';
import { withPlatform, withTenant } from '../lib/client.js';
import {
  academies,
  charges,
  orderItems,
  orders,
  payments,
  productCategories,
  products,
  students,
  users,
} from '../schema/index.js';

/**
 * Store fixtures (spec 009, STO.3). Per fixture academy: the prototype
 * catalog — 4 categories and the 6 monogram-tile products (GI kimono, RG
 * rashguard, FX faixa, TS camiseta, MC mochila, PB protetor bucal) with
 * tags, size pills and gradient presets, PB seeded low-stock (`stock_qty <=
 * low_stock_threshold`) — plus mixed orders walking the whole lifecycle:
 * pending with its open charge, paid with a settled Pix payment (the PB
 * stock already reflects the decrement — that is why it is low), ready,
 * delivered, and canceled-after-paid with a refunded charge/payment and the
 * stock restored. Order-origin charges ride the billing seed patterns: a
 * student buyer's charge sets `student_id` (Carteira histórico), a professor
 * buyer's leaves it NULL (the STO.2 relaxation — professors have no student
 * row). Alpha mixes both buyers; bravo has no student login, so its
 * professor-admin `multi` buys everything.
 *
 * All tenant rows go through `withTenant` (RLS honest); catalog and order
 * mutations are audited in-transaction via `audit_append` (`store.category/
 * product/order.*`) and the money rows via the billing action codes
 * (`billing.charge.created/paid/refunded`). Idempotent: categories and
 * products keyed on (tenant, name), orders on the (tenant, number) unique,
 * charges on their order linkage.
 */

interface DevProductFixture {
  name: string;
  description: string;
  category: string;
  priceCents: number;
  stockQty: number;
  lowStockThreshold?: number;
  tags: string[];
  sizes: string[];
  monogram: string;
  gradientPreset: string;
}

/** The admin's chip catalog ("+ Nova categoria"). */
const DEV_CATEGORIES = ['Kimonos', 'Vestuario', 'Faixas', 'Acessorios'];

/** The prototype's GI/RG/FX/TS/MC/PB tiles, gradient presets cycling. */
const DEV_PRODUCTS: DevProductFixture[] = [
  {
    name: 'Kimono Oficial',
    description: 'Kimono trancado oficial da academia, corte competicao.',
    category: 'Kimonos',
    priceCents: 34_900,
    stockQty: 12,
    tags: ['kimono', 'gi', 'competicao'],
    sizes: ['A1', 'A2', 'A3', 'A4'],
    monogram: 'GI',
    gradientPreset: 'store-blue-purple',
  },
  {
    name: 'Rashguard Team',
    description: 'Rashguard manga longa para treinos no-gi.',
    category: 'Vestuario',
    priceCents: 12_900,
    // The canceled+refunded fixture order restored its unit — stock is whole.
    stockQty: 20,
    tags: ['rashguard', 'nogi'],
    sizes: ['P', 'M', 'G', 'GG'],
    monogram: 'RG',
    gradientPreset: 'store-teal-green',
  },
  {
    name: 'Faixa Oficial',
    description: 'Faixa oficial bordada com o logo da academia.',
    category: 'Faixas',
    priceCents: 8_900,
    stockQty: 15,
    tags: ['faixa', 'graduacao'],
    sizes: ['A1', 'A2', 'A3', 'A4'],
    monogram: 'FX',
    gradientPreset: 'store-orange-red',
  },
  {
    name: 'Camiseta da Academia',
    description: 'Camiseta casual em algodao com estampa da equipe.',
    category: 'Vestuario',
    priceCents: 5_900,
    stockQty: 30,
    tags: ['camiseta', 'casual'],
    sizes: ['P', 'M', 'G', 'GG'],
    monogram: 'TS',
    gradientPreset: 'store-pink-purple',
  },
  {
    name: 'Mochila de Treino',
    description: 'Mochila com compartimento ventilado para o kimono.',
    category: 'Acessorios',
    priceCents: 19_900,
    stockQty: 8,
    tags: ['mochila', 'treino'],
    sizes: [],
    monogram: 'MC',
    gradientPreset: 'store-blue-purple',
  },
  {
    // The "estoque baixo" tile fixture: a paid order decremented it to 2,
    // at-or-below its threshold of 5.
    name: 'Protetor Bucal',
    description: 'Protetor bucal moldavel com estojo.',
    category: 'Acessorios',
    priceCents: 3_900,
    stockQty: 2,
    lowStockThreshold: 5,
    tags: ['protetor', 'competicao'],
    sizes: [],
    monogram: 'PB',
    gradientPreset: 'store-teal-green',
  },
];

type OrderStatusSeed = 'pending' | 'paid' | 'ready' | 'delivered' | 'canceled';

interface DevOrderFixture {
  /** Per-tenant sequential — ends at the prototype's #2431. */
  number: number;
  status: OrderStatusSeed;
  productName: string;
  size: string | null;
  quantity: number;
  /** 'student' only where the academy has a student login (alpha). */
  buyer: 'student' | 'professor';
  /** Days ago the settled payment landed (paid+ fixtures only). */
  paidDaysAgo?: number;
}

const DEV_ORDERS: DevOrderFixture[] = [
  {
    // Retirado pelo comprador — the full happy path, qty 2.
    number: 2427,
    status: 'delivered',
    productName: 'Camiseta da Academia',
    size: 'M',
    quantity: 2,
    buyer: 'student',
    paidDaysAgo: 10,
  },
  {
    // Canceled after payment: refunded charge + payment, stock restored.
    number: 2428,
    status: 'canceled',
    productName: 'Rashguard Team',
    size: 'G',
    quantity: 1,
    buyer: 'student',
    paidDaysAgo: 7,
  },
  {
    // Em andamento (separando) — bought by the professor: the order charge
    // without a student row (the STO.2 student_id relaxation fixture).
    number: 2429,
    status: 'ready',
    productName: 'Kimono Oficial',
    size: 'A2',
    quantity: 1,
    buyer: 'professor',
    paidDaysAgo: 2,
  },
  {
    // Recebido — the paid decrement that drove PB into "estoque baixo".
    number: 2430,
    status: 'paid',
    productName: 'Protetor Bucal',
    size: null,
    quantity: 1,
    buyer: 'student',
    paidDaysAgo: 1,
  },
  {
    // Aguardando pagamento — open order-origin charge, kept off the board.
    number: 2431,
    status: 'pending',
    productName: 'Faixa Oficial',
    size: 'A2',
    quantity: 1,
    buyer: 'student',
  },
];

/** Audit actor (academy admin) per academy — mirrors DEV_ACADEMY_ADMIN. */
const STORE_ACADEMY_ADMIN: Record<string, string> = {
  'alpha-jj': 'admin@tatame.dev',
  'bravo-bjj': 'admin.bravo@tatame.dev',
};

/** Student-persona buyer login per academy (none in bravo — no student login). */
const STORE_STUDENT_BUYER: Record<string, string | undefined> = {
  'alpha-jj': 'aluno@tatame.dev',
  'bravo-bjj': undefined,
};

/** Professor-persona buyer login per academy — mirrors DEV_CLASS_PROFESSOR. */
const STORE_PROFESSOR_BUYER: Record<string, string> = {
  'alpha-jj': 'professor@tatame.dev',
  'bravo-bjj': 'multi@tatame.dev',
};

export interface SeedStoreHandles {
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

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 3600 * 1000);

/**
 * Requires `seedDevFixtures` (students/users/memberships) to have run first.
 */
export async function seedStoreFixtures({ appDb, platformDb }: SeedStoreHandles): Promise<void> {
  for (const slug of Object.keys(STORE_ACADEMY_ADMIN)) {
    const [academy] = await withPlatform(platformDb, (tx) =>
      tx.select({ id: academies.id }).from(academies).where(eq(academies.slug, slug)),
    );
    if (!academy) throw new Error(`Fixture academy ${slug} missing — run seedDevFixtures first`);
    const tenantId = academy.id;

    const adminEmail = STORE_ACADEMY_ADMIN[slug];
    const professorEmail = STORE_PROFESSOR_BUYER[slug];
    if (!adminEmail || !professorEmail) throw new Error(`Missing store fixture cast for ${slug}`);
    const studentEmail = STORE_STUDENT_BUYER[slug];

    const userIdByEmail = new Map<string, string>();
    for (const email of [adminEmail, professorEmail, studentEmail].filter(
      (e): e is string => !!e,
    )) {
      const [user] = await withPlatform(platformDb, (tx) =>
        tx.select({ id: users.id }).from(users).where(eq(users.email, email)),
      );
      if (!user) throw new Error(`Missing user ${email} — run seedDevFixtures first`);
      userIdByEmail.set(email, user.id);
    }
    const actorUserId = userIdByEmail.get(adminEmail)!;
    const professorUserId = userIdByEmail.get(professorEmail)!;
    const studentUserId = studentEmail ? userIdByEmail.get(studentEmail) : undefined;

    await withTenant(appDb, tenantId, async (tx) => {
      // The chip catalog, then the 6 prototype products.
      const categoryIdByName = new Map<string, string>();
      for (const name of DEV_CATEGORIES) {
        categoryIdByName.set(name, await ensureCategory(tx, { tenantId, name, actorUserId }));
      }
      const productByName = new Map<string, { id: string; priceCents: number }>();
      for (const p of DEV_PRODUCTS) {
        const categoryId = categoryIdByName.get(p.category);
        if (!categoryId) throw new Error(`Fixture category ${p.category} missing`);
        const id = await ensureProduct(tx, { tenantId, categoryId, actorUserId, ...p });
        productByName.set(p.name, { id, priceCents: p.priceCents });
      }

      // The buyer's student row (Carteira addressing) where one exists.
      let studentBuyer: { userId: string; studentId: string } | undefined;
      if (studentUserId) {
        const [row] = await tx
          .select({ id: students.id })
          .from(students)
          .where(and(eq(students.tenantId, tenantId), eq(students.userId, studentUserId)));
        if (!row) throw new Error(`Fixture student row missing for ${studentEmail}`);
        studentBuyer = { userId: studentUserId, studentId: row.id };
      }

      // Mixed lifecycle orders + their order-origin charges.
      for (const o of DEV_ORDERS) {
        const product = productByName.get(o.productName);
        if (!product) throw new Error(`Fixture product ${o.productName} missing`);
        // Bravo has no student login: the professor buys everything.
        const asStudent = o.buyer === 'student' && studentBuyer !== undefined;
        const buyerUserId = asStudent ? studentBuyer!.userId : professorUserId;
        const totalCents = product.priceCents * o.quantity;

        const order = await ensureOrder(tx, {
          tenantId,
          number: o.number,
          buyerUserId,
          status: o.status,
          totalCents,
          productId: product.id,
          size: o.size,
          quantity: o.quantity,
          unitPriceCents: product.priceCents,
          actorUserId,
        });

        const chargeStatus =
          o.status === 'pending' ? 'open' : o.status === 'canceled' ? 'refunded' : 'paid';
        const charge = await ensureOrderCharge(tx, {
          tenantId,
          orderId: order.id,
          // The relaxation: student buyers keep the Carteira linkage,
          // professor buyers leave student_id NULL.
          studentId: asStudent ? studentBuyer!.studentId : undefined,
          amountCents: totalCents,
          dueDate: isoDate(new Date()),
          status: chargeStatus,
          actorUserId,
        });
        if (chargeStatus !== 'open') {
          await ensureOrderPayment(tx, {
            tenantId,
            chargeId: charge.id,
            created: charge.created,
            amountCents: totalCents,
            paidAt: daysAgo(o.paidDaysAgo ?? 0),
            refunded: chargeStatus === 'refunded',
            actorUserId,
          });
        }
      }
    });
  }
}

/**
 * Inserts one category keyed on the (tenant, name) unique — skip-if-present
 * keeps re-runs stable. Audited (`store.category.created`) with the academy
 * admin as actor, mirroring the audited events seed pattern.
 */
async function ensureCategory(
  tx: DbTransaction,
  c: { tenantId: string; name: string; actorUserId: string },
): Promise<string> {
  const found = await tx
    .select({ id: productCategories.id })
    .from(productCategories)
    .where(and(eq(productCategories.tenantId, c.tenantId), eq(productCategories.name, c.name)));
  if (found[0]) return found[0].id;

  const [inserted] = await tx
    .insert(productCategories)
    .values({ tenantId: c.tenantId, name: c.name })
    .returning({ id: productCategories.id });
  if (!inserted) throw new Error(`Failed to insert category ${c.name}`);

  await tx.execute(
    sql`SELECT audit_append(${c.tenantId}::uuid, ${c.actorUserId}::uuid, NULL,
          ${'store.category.created'}, ${'product_category'}, ${inserted.id},
          ${JSON.stringify({ name: c.name })}::jsonb)`,
  );
  return inserted.id;
}

/**
 * Inserts one product keyed on (tenant, name) — skip-if-present keeps re-runs
 * stable. Audited (`store.product.created`).
 */
async function ensureProduct(
  tx: DbTransaction,
  p: DevProductFixture & { tenantId: string; categoryId: string; actorUserId: string },
): Promise<string> {
  const found = await tx
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.tenantId, p.tenantId), eq(products.name, p.name)));
  if (found[0]) return found[0].id;

  const [inserted] = await tx
    .insert(products)
    .values({
      tenantId: p.tenantId,
      name: p.name,
      description: p.description,
      priceCents: p.priceCents,
      stockQty: p.stockQty,
      ...(p.lowStockThreshold !== undefined ? { lowStockThreshold: p.lowStockThreshold } : {}),
      categoryId: p.categoryId,
      tags: p.tags,
      sizes: p.sizes,
      monogram: p.monogram,
      gradientPreset: p.gradientPreset,
    })
    .returning({ id: products.id });
  if (!inserted) throw new Error(`Failed to insert product ${p.name}`);

  await tx.execute(
    sql`SELECT audit_append(${p.tenantId}::uuid, ${p.actorUserId}::uuid, NULL,
          ${'store.product.created'}, ${'product'}, ${inserted.id},
          ${JSON.stringify({
            name: p.name,
            monogram: p.monogram,
            price_cents: p.priceCents,
          })}::jsonb)`,
  );
  return inserted.id;
}

/**
 * Inserts one order (+ its single item — the v1 shape) keyed on the
 * (tenant, number) unique — skip-if-present keeps re-runs stable. Creation is
 * audited (`store.order.created`), and fixtures seeded past `paid` also carry
 * their transition audits: `store.order.status_changed` with from→to for
 * ready/delivered, `store.order.canceled` (refund variant) for the
 * canceled-after-paid fixture.
 */
async function ensureOrder(
  tx: DbTransaction,
  o: {
    tenantId: string;
    number: number;
    buyerUserId: string;
    status: OrderStatusSeed;
    totalCents: number;
    productId: string;
    size: string | null;
    quantity: number;
    unitPriceCents: number;
    actorUserId: string;
  },
): Promise<{ id: string; created: boolean }> {
  const found = await tx
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.tenantId, o.tenantId), eq(orders.number, o.number)));
  if (found[0]) return { id: found[0].id, created: false };

  const [inserted] = await tx
    .insert(orders)
    .values({
      tenantId: o.tenantId,
      number: o.number,
      buyerUserId: o.buyerUserId,
      status: o.status,
      totalCents: o.totalCents,
      canceledAt: o.status === 'canceled' ? new Date() : null,
    })
    .returning({ id: orders.id });
  if (!inserted) throw new Error(`Failed to insert order #${o.number}`);

  await tx.insert(orderItems).values({
    tenantId: o.tenantId,
    orderId: inserted.id,
    productId: o.productId,
    size: o.size,
    quantity: o.quantity,
    unitPriceCents: o.unitPriceCents,
  });

  await tx.execute(
    sql`SELECT audit_append(${o.tenantId}::uuid, ${o.actorUserId}::uuid, NULL,
          ${'store.order.created'}, ${'order'}, ${inserted.id},
          ${JSON.stringify({
            number: o.number,
            buyer_user_id: o.buyerUserId,
            total_cents: o.totalCents,
          })}::jsonb)`,
  );
  const transitions: Array<{ from: string; to: string }> =
    o.status === 'ready'
      ? [{ from: 'paid', to: 'ready' }]
      : o.status === 'delivered'
        ? [
            { from: 'paid', to: 'ready' },
            { from: 'ready', to: 'delivered' },
          ]
        : [];
  for (const t of transitions) {
    await tx.execute(
      sql`SELECT audit_append(${o.tenantId}::uuid, ${o.actorUserId}::uuid, NULL,
            ${'store.order.status_changed'}, ${'order'}, ${inserted.id},
            ${JSON.stringify(t)}::jsonb)`,
    );
  }
  if (o.status === 'canceled') {
    await tx.execute(
      sql`SELECT audit_append(${o.tenantId}::uuid, ${o.actorUserId}::uuid, NULL,
            ${'store.order.canceled'}, ${'order'}, ${inserted.id},
            ${JSON.stringify({ refunded: true, stock_restored: true })}::jsonb)`,
    );
  }
  return { id: inserted.id, created: true };
}

/**
 * Inserts one order-origin charge keyed on its order linkage
 * (`(tenant, order_id)` — one charge per order in v1) — skip-if-present keeps
 * re-runs stable. Audited with the billing action codes: money rows stay
 * billing's, whatever their origin. `student_id` is set only for student
 * buyers (the STO.2 relaxation); `guardian_id` stays NULL on order charges.
 */
async function ensureOrderCharge(
  tx: DbTransaction,
  c: {
    tenantId: string;
    orderId: string;
    studentId?: string;
    amountCents: number;
    dueDate: string;
    status: 'open' | 'paid' | 'refunded';
    actorUserId: string;
  },
): Promise<{ id: string; created: boolean }> {
  const found = await tx
    .select({ id: charges.id })
    .from(charges)
    .where(and(eq(charges.tenantId, c.tenantId), eq(charges.orderId, c.orderId)));
  if (found[0]) return { id: found[0].id, created: false };

  const [inserted] = await tx
    .insert(charges)
    .values({
      tenantId: c.tenantId,
      studentId: c.studentId ?? null,
      origin: 'order',
      orderId: c.orderId,
      amountCents: c.amountCents,
      dueDate: c.dueDate,
      status: c.status,
    })
    .returning({ id: charges.id });
  if (!inserted) throw new Error('Failed to insert order charge');

  await tx.execute(
    sql`SELECT audit_append(${c.tenantId}::uuid, ${c.actorUserId}::uuid, NULL,
          ${'billing.charge.created'}, ${'charge'}, ${inserted.id},
          ${JSON.stringify({
            origin: 'order',
            order_id: c.orderId,
            amount_cents: c.amountCents,
          })}::jsonb)`,
  );
  return { id: inserted.id, created: true };
}

/**
 * Attaches the simulated-Pix settlement for a charge seeded `paid` or
 * `refunded` — the exact deterministic payload strings the billing seeds emit
 * (Pix QR / copia-e-cola keyed by charge id) + the internal receipt route.
 * Refunded fixtures carry the full-refund columns (the admin Cancelado path:
 * "Estorno do Pix em até 1 dia útil"). Audited `billing.charge.paid`, plus
 * `billing.charge.refunded` for the refund variant.
 */
async function ensureOrderPayment(
  tx: DbTransaction,
  p: {
    tenantId: string;
    chargeId: string;
    /** Skip lookup work when the charge already existed with its payment. */
    created: boolean;
    amountCents: number;
    paidAt: Date;
    refunded: boolean;
    actorUserId: string;
  },
): Promise<void> {
  if (!p.created) {
    const existing = await tx
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.tenantId, p.tenantId), eq(payments.chargeId, p.chargeId)));
    if (existing.length > 0) return;
  }

  const paymentId = uuidv7();
  const providerPaymentId = `SIM-PIX-${p.chargeId}`;
  await tx.insert(payments).values({
    id: paymentId,
    tenantId: p.tenantId,
    chargeId: p.chargeId,
    method: 'pix',
    status: p.refunded ? 'refunded' : 'succeeded',
    amountCents: p.amountCents,
    provider: 'simulated',
    providerPaymentId,
    providerData: {
      qrPayload: `TATAME-SIM-PIX-${p.chargeId}`,
      copiaECola: `TATAME-SIM-PIX-${p.chargeId}`,
    },
    paidAt: p.paidAt,
    receiptUrl: `/v1/billing/payments/${paymentId}/receipt`,
    ...(p.refunded
      ? {
          refundedAt: new Date(),
          providerRefundId: `SIM-REFUND-${p.chargeId}`,
          refundReason: 'Pedido cancelado pelo admin — estorno do Pix',
        }
      : {}),
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
  if (p.refunded) {
    await tx.execute(
      sql`SELECT audit_append(${p.tenantId}::uuid, ${p.actorUserId}::uuid, NULL,
            ${'billing.charge.refunded'}, ${'charge'}, ${p.chargeId},
            ${JSON.stringify({
              payment_id: paymentId,
              provider_refund_id: `SIM-REFUND-${p.chargeId}`,
            })}::jsonb)`,
    );
  }
}
