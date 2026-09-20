import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { academies } from './academies.js';
import { users } from './auth.js';
import { orderStatus, productStatus } from './enums.js';
import { id, timestamps } from './helpers.js';
import { appRole } from './roles.js';

/**
 * Store slice (spec 009, STO.1/STO.2) — the "Loja licenciada": the admin's
 * chip catalog and products, plus the single-product orders the aluno and
 * professor storefronts create over the billing rails.
 *
 * All tenant-scoped (RLS class 1): fail-closed tenant policy on the
 * `app.tenant_id` GUC, `UNIQUE (tenant_id, id)` + composite `(tenant_id, …)`
 * FKs so catalogs and orders can never reference another academy's rows.
 * RLS is FORCED in the hardening migration (mirrors 0002/0016/0019). None of
 * the tables is append-only (status mutates through the lifecycles);
 * transitions are audited on the existing seam (`store.category.*`,
 * `store.product.*`, `store.order.*`).
 */

const tenantPolicy = (tenantId: AnyPgColumn) => ({
  using: sql`${tenantId} = NULLIF(current_setting('app.tenant_id', true), '')::uuid`,
  withCheck: sql`${tenantId} = NULLIF(current_setting('app.tenant_id', true), '')::uuid`,
});

/**
 * The admin's "Categorias da loja" chips ("+ Nova categoria", one chip per
 * category with its product count derived on read). Rename is allowed; delete
 * is allowed only while no product references the category — the plain
 * (restrict) composite FK from `products` blocks it otherwise, surfaced as a
 * stable error by the service. Names are unique per academy.
 */
export const productCategories = pgTable(
  'product_categories',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => academies.id),
    name: text('name').notNull(),
    ...timestamps,
  },
  (t) => [
    unique('product_categories_tenant_id_id_uq').on(t.tenantId, t.id),
    // One chip per name — "+ Nova categoria" never duplicates.
    unique('product_categories_tenant_name_uq').on(t.tenantId, t.name),
    pgPolicy('product_categories_tenant_all', {
      for: 'all',
      to: appRole,
      ...tenantPolicy(t.tenantId),
    }),
  ],
);

/**
 * One store product — exactly the admin-06 form: nome, descrição, preço in
 * integer cents, estoque with a per-product low-stock threshold ("estoque
 * baixo" = active AND `stock_qty <= low_stock_threshold`; derived, no flag
 * column), categoria, tags (the comma input rendered as #chips and searched
 * by the vitrine), tamanhos as size-pill values (empty = the product has no
 * sizes). v1 visual identity is a **letter monogram + gradient preset slug**
 * like the prototypes' GI/RG/FX tiles — the monogram is auto-derived from the
 * name at creation but stored so seeds can pin the prototype letters, and the
 * preset is resolved by the design-system gradient catalog (same mechanism as
 * `events.banner_preset`; the creation default cycles the catalog app-side,
 * so no DB default). No image upload in v1 (recorded debt): the detail's 3
 * "fotos" are deterministic catalog-neighbor variants derived client-side.
 *
 * `stock_qty` deliberately has NO `>= 0` CHECK: pending orders never reserve
 * stock, so two settlements can race and the loser drives stock negative
 * rather than failing a paid payment — recorded v1 behavior, surfaced on the
 * admin board (spec 009 story 34). "Remover da loja" archives, never deletes.
 */
export const products = pgTable(
  'products',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => academies.id),
    name: text('name').notNull(),
    description: text('description'),
    priceCents: integer('price_cents').notNull(),
    stockQty: integer('stock_qty').notNull().default(0),
    /** Per-product "estoque baixo" cut — the admin decides what low means. */
    lowStockThreshold: integer('low_stock_threshold').notNull().default(5),
    /** Nullable: a product may live outside the chip catalog. */
    categoryId: uuid('category_id'),
    /** The form's comma input, rendered as #chips + searched by the vitrine. */
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Size-pill values (UI seeds P/M/G/GG); empty = product has no sizes. */
    sizes: text('sizes')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** 1–3 letters on the gradient tile (GI/RG/FX…). */
    monogram: text('monogram').notNull(),
    /** Design-system gradient catalog slug (assigned at creation). */
    gradientPreset: text('gradient_preset').notNull(),
    status: productStatus('status').notNull().default('active'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique('products_tenant_id_id_uq').on(t.tenantId, t.id),
    // Vitrine (active only) and admin rows — every catalog list query.
    index('products_tenant_status_idx').on(t.tenantId, t.status),
    // A product always costs something; free giveaways are not store rows.
    check('products_price_ck', sql`${t.priceCents} > 0`),
    // The threshold is a cut-off, never negative (stock itself may go
    // negative — the recorded oversell behavior).
    check('products_low_stock_threshold_ck', sql`${t.lowStockThreshold} >= 0`),
    // The tile monogram is 1–3 letters, exactly like the prototypes.
    check(
      'products_monogram_ck',
      sql`char_length(${t.monogram}) BETWEEN 1 AND 3`,
    ),
    foreignKey({
      name: 'products_category_fk',
      columns: [t.tenantId, t.categoryId],
      foreignColumns: [productCategories.tenantId, productCategories.id],
    }),
    pgPolicy('products_tenant_all', {
      for: 'all',
      to: appRole,
      ...tenantPolicy(t.tenantId),
    }),
  ],
);

/**
 * One single-product purchase (v1) — buyer is any **student or professor
 * membership** of the tenant (the two consuming personas; no FK to students
 * because professors buy too — membership validated in the service). Carries
 * the per-tenant `#2431`-style sequential number (assigned max+1 in the
 * creation transaction, guarded by the `(tenant_id, number)` unique), the
 * `pending → paid → ready → delivered` lifecycle plus `canceled`, and the
 * fixed "retirada na recepção" pickup note (a column so per-order notes need
 * no migration). No `charge_id` column: the linkage lives on the charge
 * (billing owns money rows, same direction as events). `paid` and the
 * post-payment `canceled` flip come only from the normalized provider-event
 * handler (stock decrement/restore ride them, idempotent by the transition).
 */
export const orders = pgTable(
  'orders',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => academies.id),
    /** Per-tenant sequential, rendered `#2431`. */
    number: integer('number').notNull(),
    /** Student or professor member — the service validates the membership. */
    buyerUserId: uuid('buyer_user_id')
      .notNull()
      .references(() => users.id),
    status: orderStatus('status').notNull().default('pending'),
    /** Always `unit_price_cents × quantity` from the snapshot at creation. */
    totalCents: integer('total_cents').notNull(),
    /** Fixed copy in v1 — retirada na recepção is the only fulfillment. */
    pickupNote: text('pickup_note').notNull().default('Retirada na recepção'),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique('orders_tenant_id_id_uq').on(t.tenantId, t.id),
    // The `#NNNN` number is per-tenant truth — max+1 races resolve here.
    unique('orders_tenant_number_uq').on(t.tenantId, t.number),
    // Admin pedidos board (paid/ready/delivered/canceled, newest first).
    index('orders_tenant_status_created_at_idx').on(
      t.tenantId,
      t.status,
      t.createdAt,
    ),
    // Meus pedidos — the buyer's own orders.
    index('orders_tenant_buyer_idx').on(t.tenantId, t.buyerUserId),
    pgPolicy('orders_tenant_all', {
      for: 'all',
      to: appRole,
      ...tenantPolicy(t.tenantId),
    }),
  ],
);

/**
 * The order's product snapshot: product, size (must be one of the product's
 * `sizes` when non-empty — service-validated), quantity and the unit price at
 * purchase time (repricing never rewrites history). v1 orders have exactly
 * one item (single-product purchase per the prototype), but the table keeps
 * the designed shape so a cart is additive later.
 */
export const orderItems = pgTable(
  'order_items',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => academies.id),
    orderId: uuid('order_id').notNull(),
    productId: uuid('product_id').notNull(),
    /** NULL for sizeless products; a pill value otherwise. */
    size: text('size'),
    quantity: integer('quantity').notNull(),
    /** Price snapshot at purchase — the order total derives from this. */
    unitPriceCents: integer('unit_price_cents').notNull(),
    ...timestamps,
  },
  (t) => [
    unique('order_items_tenant_id_id_uq').on(t.tenantId, t.id),
    // Board rows and Meus pedidos render "produto · tam/qtd" per order.
    index('order_items_tenant_order_idx').on(t.tenantId, t.orderId),
    // "N vendidos" per product sums quantities across paid+ orders.
    index('order_items_tenant_product_idx').on(t.tenantId, t.productId),
    // A purchase moves at least one unit.
    check('order_items_quantity_ck', sql`${t.quantity} > 0`),
    foreignKey({
      name: 'order_items_order_fk',
      columns: [t.tenantId, t.orderId],
      foreignColumns: [orders.tenantId, orders.id],
    }),
    foreignKey({
      name: 'order_items_product_fk',
      columns: [t.tenantId, t.productId],
      foreignColumns: [products.tenantId, products.id],
    }),
    pgPolicy('order_items_tenant_all', {
      for: 'all',
      to: appRole,
      ...tenantPolicy(t.tenantId),
    }),
  ],
);
