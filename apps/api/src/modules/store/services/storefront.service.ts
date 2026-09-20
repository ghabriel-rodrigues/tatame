import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import {
  productCategories,
  products,
  withTenant,
  type DbHandle,
  type DbTransaction,
} from '@tatame/db';
import type { AuthContext } from '../../../common/auth-context.js';
import { ErrorCodes, problem } from '../../../common/problem.js';
import { APP_DB } from '../../../infra/db/db.module.js';
import type { ProductCardView, ProductDetailView } from '../store.types.js';

export interface VitrineFilter {
  /** "Buscar por nome ou tag" — matched against name AND tags. */
  search?: string;
  /** One chip of the "Tudo + categories" carousel. */
  categoryId?: string;
}

/**
 * The shared aluno + professor storefront read model (spec 009, STO.5 —
 * aluno-16/17, professor-13/14): one feature, two shells. Active products
 * only — archived rows exist only in order history (story 31); cross-tenant
 * ids are RLS-hidden and behave as 404.
 */
@Injectable()
export class StorefrontService {
  constructor(@Inject(APP_DB) private readonly appDb: DbHandle) {}

  /** GET /store/products — vitrine grid + the category chip carousel data. */
  async list(
    ctx: AuthContext & { tenantId: string },
    filter: VitrineFilter,
  ): Promise<{
    products: ProductCardView[];
    categories: Array<{ id: string; name: string }>;
  }> {
    return withTenant(this.appDb.db, this.tenantCtx(ctx), async (tx) => {
      const term = filter.search?.trim();
      const rows = await tx
        .select()
        .from(products)
        .where(
          and(
            eq(products.status, 'active'),
            filter.categoryId
              ? eq(products.categoryId, filter.categoryId)
              : undefined,
            term
              ? sql`(${products.name} ILIKE ${`%${term}%`} OR array_to_string(${products.tags}, ' ') ILIKE ${`%${term}%`})`
              : undefined,
          ),
        )
        .orderBy(asc(products.name));

      const categories = await tx
        .select({ id: productCategories.id, name: productCategories.name })
        .from(productCategories)
        .orderBy(asc(productCategories.name));

      const categoryById = new Map(categories.map((c) => [c.id, c.name]));
      return {
        products: rows.map((row) => this.card(row, categoryById)),
        categories,
      };
    });
  }

  /** GET /store/products/:id — detail; archived/unknown = 404 (backstage). */
  async detail(
    ctx: AuthContext & { tenantId: string },
    productId: string,
  ): Promise<ProductDetailView> {
    return withTenant(this.appDb.db, this.tenantCtx(ctx), async (tx) =>
      this.requireActiveDetail(tx, productId),
    );
  }

  /**
   * The aluno home "Loja da academia" strip — the first `limit` active
   * products (the prototype shows 3 + "Ver tudo").
   */
  async storeStrip(
    ctx: AuthContext & { tenantId: string },
    limit = 3,
  ): Promise<ProductCardView[]> {
    return withTenant(this.appDb.db, this.tenantCtx(ctx), async (tx) => {
      const rows = await tx
        .select()
        .from(products)
        .where(eq(products.status, 'active'))
        // UUIDv7 ids are time-ordered — insertion order, stable under the
        // same-timestamp ties a seeding transaction produces.
        .orderBy(asc(products.id))
        .limit(limit);
      const categories = await tx.select().from(productCategories);
      const categoryById = new Map(categories.map((c) => [c.id, c.name]));
      return rows.map((row) => this.card(row, categoryById));
    });
  }

  /** Tx-scoped detail lookup, shared with the order-creation validation. */
  async requireActiveDetail(
    tx: DbTransaction,
    productId: string,
  ): Promise<ProductDetailView> {
    const [row] = await tx
      .select()
      .from(products)
      .where(eq(products.id, productId));
    if (!row || row.status !== 'active') {
      throw problem(404, ErrorCodes.NOT_FOUND, 'Product not found');
    }
    const [category] = row.categoryId
      ? await tx
          .select({ name: productCategories.name })
          .from(productCategories)
          .where(eq(productCategories.id, row.categoryId))
      : [];
    return {
      id: row.id,
      name: row.name,
      priceCents: row.priceCents,
      monogram: row.monogram,
      gradientPreset: row.gradientPreset,
      categoryId: row.categoryId,
      categoryName: category?.name ?? null,
      description: row.description,
      tags: row.tags,
      sizes: row.sizes,
      stockQty: row.stockQty,
    };
  }

  private tenantCtx(ctx: AuthContext & { tenantId: string }) {
    return { tenantId: ctx.tenantId, userId: ctx.userId };
  }

  private card(
    row: typeof products.$inferSelect,
    categoryById: Map<string, string>,
  ): ProductCardView {
    return {
      id: row.id,
      name: row.name,
      priceCents: row.priceCents,
      monogram: row.monogram,
      gradientPreset: row.gradientPreset,
      categoryId: row.categoryId,
      categoryName: row.categoryId
        ? (categoryById.get(row.categoryId) ?? null)
        : null,
    };
  }
}
