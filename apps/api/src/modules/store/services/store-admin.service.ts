import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import {
  charges,
  orderItems,
  orders,
  payments,
  productCategories,
  products,
  withTenant,
  type DbHandle,
  type DbTransaction,
} from '@tatame/db';
import type { AuthContext } from '../../../common/auth-context.js';
import { ErrorCodes, problem } from '../../../common/problem.js';
import { APP_DB } from '../../../infra/db/db.module.js';
import { localDate, TENANT_TIMEZONE } from '../../attendance/lib/time.js';
import {
  deriveMonogram,
  STORE_GRADIENT_PRESETS,
  type AdminProductView,
  type CategoryView,
} from '../store.types.js';

export interface CreateProductInput {
  name: string;
  description?: string | null;
  priceCents: number;
  stockQty?: number;
  lowStockThreshold?: number;
  categoryId?: string | null;
  tags?: string[];
  sizes?: string[];
  monogram?: string;
  gradientPreset?: string;
}

export type UpdateProductInput = Partial<CreateProductInput>;

export interface StoreOverviewView {
  /** Tenant-local YYYY-MM the aggregates are computed for. */
  month: string;
  /** "R$ N vendas no mês" — succeeded order payments by paid_at, tenant tz. */
  vendasMesCents: number;
  /** "N pedidos no mês" — orders that reached paid inside the month. */
  pedidosMesCount: number;
  /** "N estoque baixo" — active products at/below their own threshold. */
  lowStock: {
    count: number;
    products: Array<{
      id: string;
      name: string;
      monogram: string;
      gradientPreset: string;
      stockQty: number;
      lowStockThreshold: number;
    }>;
  };
}

/**
 * Admin Loja console (spec 009, STO.4): the "Categorias da loja" chip CRUD
 * (delete guarded by references — the restrict FK's friendly 409), the
 * produto form per admin-06 ("Remover da loja" archives, never deletes), and
 * the three stat tiles derived on read in the tenant timezone. Vendas do mês
 * is a standalone store aggregate — the billing Visão financeira keeps its
 * all-payments derivation untouched (store revenue flows into receita by
 * construction, nothing double-counted). Every mutation is audited
 * in-transaction with impersonation attribution.
 */
@Injectable()
export class StoreAdminService {
  constructor(@Inject(APP_DB) private readonly appDb: DbHandle) {}

  // ── categorias ────────────────────────────────────────────────────────────

  /** GET /admin/store/categories — one chip per category with its count. */
  async listCategories(
    ctx: AuthContext & { tenantId: string },
  ): Promise<{ categories: CategoryView[] }> {
    return withTenant(this.appDb.db, this.tenantCtx(ctx), async (tx) => ({
      categories: await this.categoryViews(tx),
    }));
  }

  /** POST /admin/store/categories — "+ Nova categoria" (name unique). */
  async createCategory(
    ctx: AuthContext & { tenantId: string },
    name: string,
  ): Promise<CategoryView> {
    return withTenant(this.appDb.db, this.tenantCtx(ctx), async (tx) => {
      await this.assertCategoryNameFree(tx, name);
      const [row] = await tx
        .insert(productCategories)
        .values({ tenantId: ctx.tenantId, name })
        .returning();
      if (!row)
        throw problem(
          500,
          ErrorCodes.INTERNAL,
          'Category insert returned no row',
        );
      await this.audit(
        tx,
        ctx,
        'store.category.created',
        'product_category',
        row.id,
        { name },
      );
      return { id: row.id, name: row.name, productCount: 0 };
    });
  }

  /** PATCH /admin/store/categories/:id — rename. */
  async renameCategory(
    ctx: AuthContext & { tenantId: string },
    categoryId: string,
    name: string,
  ): Promise<CategoryView> {
    return withTenant(this.appDb.db, this.tenantCtx(ctx), async (tx) => {
      const category = await this.requireCategory(tx, categoryId);
      if (name !== category.name) await this.assertCategoryNameFree(tx, name);
      const [row] = await tx
        .update(productCategories)
        .set({ name, updatedAt: new Date() })
        .where(eq(productCategories.id, category.id))
        .returning();
      if (!row)
        throw problem(
          500,
          ErrorCodes.INTERNAL,
          'Category update returned no row',
        );
      await this.audit(
        tx,
        ctx,
        'store.category.updated',
        'product_category',
        row.id,
        {
          from: category.name,
          to: name,
        },
      );
      const [count] = await this.categoryViews(tx, [row.id]);
      return count ?? { id: row.id, name: row.name, productCount: 0 };
    });
  }

  /**
   * DELETE /admin/store/categories/:id — allowed only while no product
   * (archived included — history keeps its chip) references it: 409
   * `category.in_use`, the stable face of the restrict FK.
   */
  async deleteCategory(
    ctx: AuthContext & { tenantId: string },
    categoryId: string,
  ): Promise<void> {
    await withTenant(this.appDb.db, this.tenantCtx(ctx), async (tx) => {
      const category = await this.requireCategory(tx, categoryId);
      const [ref] = await tx
        .select({ id: products.id })
        .from(products)
        .where(eq(products.categoryId, category.id))
        .limit(1);
      if (ref) {
        throw problem(
          409,
          ErrorCodes.STORE_CATEGORY_IN_USE,
          'Products still reference this category — move or archive them first',
        );
      }
      await tx
        .delete(productCategories)
        .where(eq(productCategories.id, category.id));
      await this.audit(
        tx,
        ctx,
        'store.category.deleted',
        'product_category',
        category.id,
        {
          name: category.name,
        },
      );
    });
  }

  // ── produtos ──────────────────────────────────────────────────────────────

  /** GET /admin/store/products — rows per admin-03, vendidos derived. */
  async listProducts(
    ctx: AuthContext & { tenantId: string },
  ): Promise<{ products: AdminProductView[] }> {
    return withTenant(this.appDb.db, this.tenantCtx(ctx), async (tx) => {
      const rows = await tx.select().from(products).orderBy(asc(products.name));
      return { products: await this.toAdminViews(tx, rows) };
    });
  }

  /** POST /admin/store/products — the admin-06 form. */
  async createProduct(
    ctx: AuthContext & { tenantId: string },
    input: CreateProductInput,
  ): Promise<AdminProductView> {
    return withTenant(this.appDb.db, this.tenantCtx(ctx), async (tx) => {
      if (input.categoryId)
        await this.requireCategory(tx, input.categoryId, 'categoryId');

      // The creation default cycles the design-system catalog (no DB default).
      const [{ count }] = (await tx
        .select({ count: sql<string>`count(*)` })
        .from(products)) as [{ count: string }];
      const gradientPreset =
        input.gradientPreset ??
        STORE_GRADIENT_PRESETS[Number(count) % STORE_GRADIENT_PRESETS.length]!;

      const [row] = await tx
        .insert(products)
        .values({
          tenantId: ctx.tenantId,
          name: input.name,
          description: input.description ?? null,
          priceCents: input.priceCents,
          stockQty: input.stockQty ?? 0,
          ...(input.lowStockThreshold !== undefined
            ? { lowStockThreshold: input.lowStockThreshold }
            : {}),
          categoryId: input.categoryId ?? null,
          tags: input.tags ?? [],
          sizes: input.sizes ?? [],
          monogram: input.monogram ?? deriveMonogram(input.name),
          gradientPreset,
        })
        .returning();
      if (!row)
        throw problem(
          500,
          ErrorCodes.INTERNAL,
          'Product insert returned no row',
        );
      await this.audit(tx, ctx, 'store.product.created', 'product', row.id, {
        name: row.name,
        monogram: row.monogram,
        price_cents: row.priceCents,
        stock_qty: row.stockQty,
      });
      const [view] = await this.toAdminViews(tx, [row]);
      return view!;
    });
  }

  /** PATCH /admin/store/products/:id — archived products are frozen history. */
  async updateProduct(
    ctx: AuthContext & { tenantId: string },
    productId: string,
    input: UpdateProductInput,
  ): Promise<AdminProductView> {
    return withTenant(this.appDb.db, this.tenantCtx(ctx), async (tx) => {
      const product = await this.requireProduct(tx, productId);
      if (product.status === 'archived') {
        throw problem(
          409,
          ErrorCodes.CONFLICT,
          'An archived product cannot be edited',
        );
      }
      if (input.categoryId)
        await this.requireCategory(tx, input.categoryId, 'categoryId');

      const [row] = await tx
        .update(products)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          ...(input.priceCents !== undefined
            ? { priceCents: input.priceCents }
            : {}),
          ...(input.stockQty !== undefined ? { stockQty: input.stockQty } : {}),
          ...(input.lowStockThreshold !== undefined
            ? { lowStockThreshold: input.lowStockThreshold }
            : {}),
          ...(input.categoryId !== undefined
            ? { categoryId: input.categoryId }
            : {}),
          ...(input.tags !== undefined ? { tags: input.tags ?? [] } : {}),
          ...(input.sizes !== undefined ? { sizes: input.sizes ?? [] } : {}),
          ...(input.monogram !== undefined ? { monogram: input.monogram } : {}),
          ...(input.gradientPreset !== undefined
            ? { gradientPreset: input.gradientPreset }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(products.id, product.id))
        .returning();
      if (!row)
        throw problem(
          500,
          ErrorCodes.INTERNAL,
          'Product update returned no row',
        );
      await this.audit(tx, ctx, 'store.product.updated', 'product', row.id, {
        fields: Object.keys(input),
      });
      const [view] = await this.toAdminViews(tx, [row]);
      return view!;
    });
  }

  /**
   * DELETE /admin/store/products/:id — "Remover da loja" archives, never
   * hard-deletes (story 6): order history referencing it stays intact and the
   * vitrine stops showing it.
   */
  async archiveProduct(
    ctx: AuthContext & { tenantId: string },
    productId: string,
  ): Promise<AdminProductView> {
    return withTenant(this.appDb.db, this.tenantCtx(ctx), async (tx) => {
      const product = await this.requireProduct(tx, productId);
      if (product.status === 'archived') {
        throw problem(409, ErrorCodes.CONFLICT, 'Product is already archived');
      }
      const [row] = await tx
        .update(products)
        .set({
          status: 'archived',
          archivedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(products.id, product.id))
        .returning();
      if (!row)
        throw problem(
          500,
          ErrorCodes.INTERNAL,
          'Product archive returned no row',
        );
      await this.audit(tx, ctx, 'store.product.archived', 'product', row.id, {
        name: row.name,
      });
      const [view] = await this.toAdminViews(tx, [row]);
      return view!;
    });
  }

  // ── overview ──────────────────────────────────────────────────────────────

  /** GET /admin/store/overview — the three stat tiles, tenant timezone. */
  async overview(
    ctx: AuthContext & { tenantId: string },
  ): Promise<StoreOverviewView> {
    const month = localDate().slice(0, 7);
    return withTenant(this.appDb.db, this.tenantCtx(ctx), async (tx) => {
      const paidInMonth = sql`to_char(${payments.paidAt} AT TIME ZONE ${TENANT_TIMEZONE}, 'YYYY-MM') = ${month}`;

      // Vendas do mês: settled order money by paid_at (refunds excluded —
      // the tile reconciles with the wallet receipts, story 14).
      const [vendas] = await tx
        .select({
          total: sql<string>`COALESCE(SUM(${payments.amountCents}), 0)`,
        })
        .from(payments)
        .innerJoin(
          charges,
          and(
            eq(charges.tenantId, payments.tenantId),
            eq(charges.id, payments.chargeId),
          ),
        )
        .where(
          and(
            eq(charges.origin, 'order'),
            eq(payments.status, 'succeeded'),
            paidInMonth,
          ),
        );

      // Pedidos no mês: orders that REACHED paid inside the month — a later
      // refund does not unmake the sale count (paid_at survives the refund).
      const [pedidos] = await tx
        .select({ total: sql<string>`COUNT(DISTINCT ${charges.orderId})` })
        .from(payments)
        .innerJoin(
          charges,
          and(
            eq(charges.tenantId, payments.tenantId),
            eq(charges.id, payments.chargeId),
          ),
        )
        .where(
          and(
            eq(charges.origin, 'order'),
            inArray(payments.status, ['succeeded', 'refunded']),
            paidInMonth,
          ),
        );

      // Estoque baixo: derived predicate, per-product threshold (story 7).
      const low = await tx
        .select()
        .from(products)
        .where(
          and(
            eq(products.status, 'active'),
            sql`${products.stockQty} <= ${products.lowStockThreshold}`,
          ),
        )
        .orderBy(asc(products.stockQty), asc(products.name));

      return {
        month,
        vendasMesCents: Number(vendas?.total ?? 0),
        pedidosMesCount: Number(pedidos?.total ?? 0),
        lowStock: {
          count: low.length,
          products: low.map((p) => ({
            id: p.id,
            name: p.name,
            monogram: p.monogram,
            gradientPreset: p.gradientPreset,
            stockQty: p.stockQty,
            lowStockThreshold: p.lowStockThreshold,
          })),
        },
      };
    });
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private tenantCtx(ctx: AuthContext & { tenantId: string }) {
    return { tenantId: ctx.tenantId, userId: ctx.userId };
  }

  private async categoryViews(
    tx: DbTransaction,
    ids?: string[],
  ): Promise<CategoryView[]> {
    const rows = await tx
      .select()
      .from(productCategories)
      .where(ids ? inArray(productCategories.id, ids) : undefined)
      .orderBy(asc(productCategories.name));
    const counts = await tx
      .select({ categoryId: products.categoryId, total: sql<string>`count(*)` })
      .from(products)
      .where(sql`${products.categoryId} IS NOT NULL`)
      .groupBy(products.categoryId);
    const countByCategory = new Map(
      counts.map((c) => [c.categoryId, Number(c.total)]),
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      productCount: countByCategory.get(row.id) ?? 0,
    }));
  }

  private async assertCategoryNameFree(
    tx: DbTransaction,
    name: string,
  ): Promise<void> {
    const [existing] = await tx
      .select({ id: productCategories.id })
      .from(productCategories)
      .where(eq(productCategories.name, name));
    if (existing) {
      throw problem(
        409,
        ErrorCodes.CONFLICT,
        'A category with this name already exists',
      );
    }
  }

  /**
   * Unknown/foreign category = 404 on direct addressing; as a form reference
   * (`field` given) it is the form's fault → 422 validation.failed.
   */
  private async requireCategory(
    tx: DbTransaction,
    categoryId: string,
    field?: string,
  ): Promise<typeof productCategories.$inferSelect> {
    const [row] = await tx
      .select()
      .from(productCategories)
      .where(eq(productCategories.id, categoryId));
    if (!row) {
      if (field) {
        throw problem(
          422,
          ErrorCodes.VALIDATION_FAILED,
          'Request validation failed',
          [{ field, messages: ['Unknown category'] }],
        );
      }
      throw problem(404, ErrorCodes.NOT_FOUND, 'Category not found');
    }
    return row;
  }

  private async requireProduct(
    tx: DbTransaction,
    productId: string,
  ): Promise<typeof products.$inferSelect> {
    const [row] = await tx
      .select()
      .from(products)
      .where(eq(products.id, productId));
    if (!row) throw problem(404, ErrorCodes.NOT_FOUND, 'Product not found');
    return row;
  }

  /** Admin rows with category names + derived vendidos, input order kept. */
  private async toAdminViews(
    tx: DbTransaction,
    rows: Array<typeof products.$inferSelect>,
  ): Promise<AdminProductView[]> {
    if (rows.length === 0) return [];
    const productIds = rows.map((r) => r.id);

    const sold = await tx
      .select({
        productId: orderItems.productId,
        total: sql<string>`COALESCE(SUM(${orderItems.quantity}), 0)`,
      })
      .from(orderItems)
      .innerJoin(
        orders,
        and(
          eq(orders.tenantId, orderItems.tenantId),
          eq(orders.id, orderItems.orderId),
        ),
      )
      .where(
        and(
          inArray(orderItems.productId, productIds),
          inArray(orders.status, ['paid', 'ready', 'delivered']),
        ),
      )
      .groupBy(orderItems.productId);
    const soldByProduct = new Map(
      sold.map((s) => [s.productId, Number(s.total)]),
    );

    const categories = await tx.select().from(productCategories);
    const categoryById = new Map(categories.map((c) => [c.id, c.name]));

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      priceCents: row.priceCents,
      monogram: row.monogram,
      gradientPreset: row.gradientPreset,
      categoryId: row.categoryId,
      categoryName: row.categoryId
        ? (categoryById.get(row.categoryId) ?? null)
        : null,
      tags: row.tags,
      sizes: row.sizes,
      stockQty: row.stockQty,
      lowStockThreshold: row.lowStockThreshold,
      status: row.status,
      lowStock:
        row.status === 'active' && row.stockQty <= row.lowStockThreshold,
      soldCount: soldByProduct.get(row.id) ?? 0,
    }));
  }

  private async audit(
    tx: DbTransaction,
    ctx: AuthContext & { tenantId: string },
    action: string,
    targetType: string,
    targetId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await tx.execute(sql`
      SELECT audit_append(
        ${ctx.tenantId}::uuid,
        ${ctx.userId}::uuid,
        ${ctx.impersonatorUserId}::uuid,
        ${action},
        ${targetType},
        ${targetId}::text,
        ${JSON.stringify(metadata)}::jsonb
      )
    `);
  }
}
