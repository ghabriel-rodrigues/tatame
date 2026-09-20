import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import {
  charges,
  orderItems,
  orders,
  payments,
  products,
  students,
  users,
  withTenant,
  type DbHandle,
  type DbTransaction,
} from '@tatame/db';
import type { AuthContext } from '../../../common/auth-context.js';
import { ErrorCodes, problem } from '../../../common/problem.js';
import { APP_DB } from '../../../infra/db/db.module.js';
import { localDate } from '../../attendance/lib/time.js';
import { OrderChargesService } from '../../billing/services/order-charges.service.js';
import { PaymentFlowService } from '../../billing/services/payment-flow.service.js';
import type { BillingActor } from '../../billing/services/provider-events.service.js';
import {
  STORE_ORDER_CANCELED,
  STORE_ORDER_DELIVERED,
  STORE_ORDER_READY,
  type OrderCanceledEvent,
  type OrderDeliveredEvent,
  type OrderReadyEvent,
} from '../store.events.js';
import type { AdminOrderView, OrderView } from '../store.types.js';

export interface CreateOrderInput {
  productId: string;
  size?: string | null;
  quantity: number;
}

export interface CreateOrderResult {
  order: OrderView;
  /**
   * The open order-origin charge — the client drives the persona-neutral
   * POST /store/charges/:id/payments (Pix) + the existing simulate button.
   */
  chargeId: string;
}

const asActor = (ctx: AuthContext): BillingActor => ({
  userId: ctx.userId,
  impersonatorUserId: ctx.impersonatorUserId,
});

/**
 * Order write/read flows (spec 009, STO.5/STO.6). Creation validates against
 * current stock but reserves nothing (story 34 — unpaid orders never lock
 * inventory); the per-tenant `#2431` number is assigned max+1 inside the
 * creation transaction, guarded by the `(tenant_id, number)` unique. Money
 * rides the OrderChargesService seam; `paid` and the post-payment `canceled`
 * flip come only from the normalized provider-event handler. Admin board
 * transitions walk paid → ready → delivered (no skips, no backward moves);
 * Cancelado runs the audited full refund and the order flip + stock restore
 * ride the resulting `payment.refunded` event.
 */
@Injectable()
export class StoreOrdersService {
  constructor(
    @Inject(APP_DB) private readonly appDb: DbHandle,
    private readonly orderCharges: OrderChargesService,
    private readonly paymentFlow: PaymentFlowService,
    private readonly emitter: EventEmitter2,
  ) {}

  // ── storefront ────────────────────────────────────────────────────────────

  /** POST /store/orders — pending order + item snapshot + order charge. */
  async create(
    ctx: AuthContext & { tenantId: string },
    input: CreateOrderInput,
  ): Promise<CreateOrderResult> {
    return withTenant(this.appDb.db, this.tenantCtx(ctx), async (tx) => {
      const product = await this.purchasableProduct(tx, input.productId);
      const size = this.validatedSize(product, input.size ?? null);
      if (input.quantity > product.stockQty) {
        throw problem(
          422,
          ErrorCodes.STORE_INSUFFICIENT_STOCK,
          `Only ${product.stockQty} in stock — no partial fulfillment`,
        );
      }

      // Per-tenant sequential `#NNNN` — max+1 inside the transaction; the
      // (tenant_id, number) unique settles any race.
      const [{ max }] = (await tx
        .select({ max: sql<string | null>`MAX(${orders.number})` })
        .from(orders)) as [{ max: string | null }];
      const number = Number(max ?? 0) + 1;

      const totalCents = product.priceCents * input.quantity;
      const [order] = await tx
        .insert(orders)
        .values({
          tenantId: ctx.tenantId,
          number,
          buyerUserId: ctx.userId,
          status: 'pending',
          totalCents,
        })
        .returning();
      if (!order)
        throw problem(500, ErrorCodes.INTERNAL, 'Order insert returned no row');

      // The snapshot: repricing never rewrites history (story on unit_price).
      const [item] = await tx
        .insert(orderItems)
        .values({
          tenantId: ctx.tenantId,
          orderId: order.id,
          productId: product.id,
          size,
          quantity: input.quantity,
          unitPriceCents: product.priceCents,
        })
        .returning();
      if (!item)
        throw problem(
          500,
          ErrorCodes.INTERNAL,
          'Order item insert returned no row',
        );

      // The buyer's student row (Carteira addressing) when one exists —
      // professor buyers have no student row and leave student_id NULL.
      const studentId =
        ctx.role === 'student'
          ? ((await this.studentOf(tx, ctx.userId))?.id ?? null)
          : null;
      const charge = await this.orderCharges.issueOrderCharge(
        tx,
        asActor(ctx),
        {
          tenantId: ctx.tenantId,
          orderId: order.id,
          studentId,
          amountCents: totalCents,
          dueDate: localDate(),
        },
      );

      await this.audit(tx, ctx, 'store.order.created', order.id, {
        number,
        product_id: product.id,
        size,
        quantity: input.quantity,
        unit_price_cents: product.priceCents,
        total_cents: totalCents,
        charge_id: charge.id,
      });

      return {
        order: this.view(
          order,
          {
            productId: product.id,
            productName: product.name,
            monogram: product.monogram,
            gradientPreset: product.gradientPreset,
            size,
            quantity: input.quantity,
            unitPriceCents: product.priceCents,
          },
          charge.id,
        ),
        chargeId: charge.id,
      };
    });
  }

  /** GET /store/orders — Meus pedidos (own orders only), newest first. */
  async myOrders(
    ctx: AuthContext & { tenantId: string },
  ): Promise<{ orders: OrderView[] }> {
    return withTenant(this.appDb.db, this.tenantCtx(ctx), async (tx) => {
      const rows = await tx
        .select()
        .from(orders)
        .where(eq(orders.buyerUserId, ctx.userId))
        .orderBy(desc(orders.createdAt), desc(orders.number));
      const enriched = await this.enrich(tx, rows);
      return { orders: enriched };
    });
  }

  /**
   * DELETE /store/orders/:id — buyer cancel of a still-pending order (story
   * 28): flips the order, voids the open charge. A paid order is undone only
   * by the admin refund path (409 `store.order_not_cancelable`).
   */
  async cancelPending(
    ctx: AuthContext & { tenantId: string },
    orderId: string,
  ): Promise<void> {
    let canceled: OrderCanceledEvent | null = null;
    await withTenant(this.appDb.db, this.tenantCtx(ctx), async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, orderId));
      // Foreign/unknown (incl. another buyer's) order = 404, never 403.
      if (!order || order.buyerUserId !== ctx.userId) {
        throw problem(404, ErrorCodes.NOT_FOUND, 'Order not found');
      }
      if (order.status !== 'pending') {
        throw problem(
          409,
          ErrorCodes.STORE_ORDER_NOT_CANCELABLE,
          'Only orders still awaiting payment can be canceled by the buyer',
        );
      }
      await tx
        .update(orders)
        .set({
          status: 'canceled',
          canceledAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id));
      await this.orderCharges.cancelOpenOrderCharges(
        tx,
        asActor(ctx),
        ctx.tenantId,
        order.id,
      );
      await this.audit(tx, ctx, 'store.order.canceled', order.id, {
        from: 'pending',
        via: 'buyer',
      });
      canceled = {
        tenantId: ctx.tenantId,
        orderId: order.id,
        number: order.number,
        buyerUserId: order.buyerUserId,
        totalCents: order.totalCents,
        refunded: false,
      };
    });
    if (canceled) this.emitter.emit(STORE_ORDER_CANCELED, canceled);
  }

  // ── admin board ───────────────────────────────────────────────────────────

  /**
   * GET /admin/store/orders — the pedidos board (admin-04): pending excluded
   * (story 13 — only sales that actually happened), newest first.
   */
  async adminBoard(
    ctx: AuthContext & { tenantId: string },
  ): Promise<{ orders: AdminOrderView[] }> {
    return withTenant(this.appDb.db, this.tenantCtx(ctx), async (tx) => {
      const rows = await tx
        .select({ order: orders, buyerName: users.fullName })
        .from(orders)
        .innerJoin(users, eq(users.id, orders.buyerUserId))
        .where(ne(orders.status, 'pending'))
        .orderBy(desc(orders.createdAt), desc(orders.number));
      const views = await this.enrich(
        tx,
        rows.map((r) => r.order),
      );
      const nameByOrder = new Map(rows.map((r) => [r.order.id, r.buyerName]));
      return {
        orders: views.map((view, i) => ({
          ...view,
          buyer: {
            userId: rows[i]!.order.buyerUserId,
            fullName: nameByOrder.get(view.id) ?? '',
          },
        })),
      };
    });
  }

  /**
   * POST /admin/store/orders/:id/status — the admin-05 sheet: paid → ready →
   * delivered (audited, no skips, no backward moves, delivered terminal);
   * `canceled` from paid/ready runs the audited full refund — the order flip
   * + stock restore ride the resulting `payment.refunded` event ("Estorno do
   * Pix em até 1 dia útil"). Admin never sets `paid` by hand.
   */
  async adminTransition(
    ctx: AuthContext & { tenantId: string },
    orderId: string,
    status: 'ready' | 'delivered' | 'canceled',
  ): Promise<AdminOrderView> {
    if (status === 'canceled') {
      await this.adminCancel(ctx, orderId);
    } else {
      let emitted: {
        name: string;
        event: OrderReadyEvent | OrderDeliveredEvent;
      } | null = null;
      await withTenant(this.appDb.db, this.tenantCtx(ctx), async (tx) => {
        const order = await this.requireOrder(tx, orderId);
        const allowedFrom: Record<'ready' | 'delivered', string> = {
          ready: 'paid',
          delivered: 'ready',
        };
        if (order.status !== allowedFrom[status]) {
          throw problem(
            409,
            ErrorCodes.STORE_ORDER_INVALID_TRANSITION,
            `Cannot move a ${order.status} order to ${status}`,
          );
        }
        await tx
          .update(orders)
          .set({ status, updatedAt: new Date() })
          .where(eq(orders.id, order.id));
        await this.audit(tx, ctx, 'store.order.status_changed', order.id, {
          from: order.status,
          to: status,
        });
        emitted = {
          name: status === 'ready' ? STORE_ORDER_READY : STORE_ORDER_DELIVERED,
          event: {
            tenantId: ctx.tenantId,
            orderId: order.id,
            number: order.number,
            buyerUserId: order.buyerUserId,
            totalCents: order.totalCents,
          },
        };
      });
      if (emitted) {
        const pending = emitted as { name: string; event: OrderReadyEvent };
        this.emitter.emit(pending.name, pending.event);
      }
    }
    return this.adminOrder(ctx, orderId);
  }

  // ── internals ─────────────────────────────────────────────────────────────

  /**
   * The Cancelado path: validate the transition, then push the settled
   * payment through the EXISTING audited refund rails — the handler (not this
   * method) flips the order and restores stock, instant under the simulated
   * driver so the sheet feels synchronous.
   */
  private async adminCancel(
    ctx: AuthContext & { tenantId: string },
    orderId: string,
  ): Promise<void> {
    const paymentId = await withTenant(
      this.appDb.db,
      this.tenantCtx(ctx),
      async (tx) => {
        const order = await this.requireOrder(tx, orderId);
        if (order.status !== 'paid' && order.status !== 'ready') {
          throw problem(
            409,
            ErrorCodes.STORE_ORDER_INVALID_TRANSITION,
            `Cannot cancel a ${order.status} order — only paid or em-andamento orders refund`,
          );
        }
        const [settled] = await tx
          .select({ id: payments.id })
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
              eq(charges.orderId, order.id),
              eq(payments.status, 'succeeded'),
            ),
          );
        if (!settled) {
          throw problem(
            409,
            ErrorCodes.BILLING_REFUND_UNSETTLED,
            'No settled payment to refund',
          );
        }
        return settled.id;
      },
    );
    await this.paymentFlow.refund(
      ctx,
      paymentId,
      'Pedido cancelado pelo admin — estorno do Pix em até 1 dia útil',
    );
  }

  private async adminOrder(
    ctx: AuthContext & { tenantId: string },
    orderId: string,
  ): Promise<AdminOrderView> {
    return withTenant(this.appDb.db, this.tenantCtx(ctx), async (tx) => {
      const order = await this.requireOrder(tx, orderId);
      const [buyer] = await tx
        .select({ fullName: users.fullName })
        .from(users)
        .where(eq(users.id, order.buyerUserId));
      const [view] = await this.enrich(tx, [order]);
      return {
        ...view!,
        buyer: { userId: order.buyerUserId, fullName: buyer?.fullName ?? '' },
      };
    });
  }

  private tenantCtx(ctx: AuthContext & { tenantId: string }) {
    return { tenantId: ctx.tenantId, userId: ctx.userId };
  }

  private async requireOrder(
    tx: DbTransaction,
    orderId: string,
  ): Promise<typeof orders.$inferSelect> {
    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, orderId));
    if (!order) throw problem(404, ErrorCodes.NOT_FOUND, 'Order not found');
    return order;
  }

  /** Active product or a stable refusal: unknown = 404, archived = 422. */
  private async purchasableProduct(
    tx: DbTransaction,
    productId: string,
  ): Promise<typeof products.$inferSelect> {
    const [product] = await tx
      .select()
      .from(products)
      .where(eq(products.id, productId));
    if (!product) throw problem(404, ErrorCodes.NOT_FOUND, 'Product not found');
    if (product.status !== 'active') {
      throw problem(
        422,
        ErrorCodes.STORE_PRODUCT_NOT_PURCHASABLE,
        'This product was removed from the store',
      );
    }
    return product;
  }

  /** Size ∈ sizes, required iff the product defines sizes (stories 23/24). */
  private validatedSize(
    product: typeof products.$inferSelect,
    size: string | null,
  ): string | null {
    if (product.sizes.length === 0) {
      if (size) {
        throw problem(
          422,
          ErrorCodes.STORE_SIZE_INVALID,
          'This product has no sizes',
        );
      }
      return null;
    }
    if (!size) {
      throw problem(
        422,
        ErrorCodes.STORE_SIZE_REQUIRED,
        'Choose a size for this product',
      );
    }
    if (!product.sizes.includes(size)) {
      throw problem(
        422,
        ErrorCodes.STORE_SIZE_INVALID,
        `Size must be one of: ${product.sizes.join(', ')}`,
      );
    }
    return size;
  }

  private async studentOf(
    tx: DbTransaction,
    userId: string,
  ): Promise<{ id: string } | null> {
    const [row] = await tx
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.userId, userId), eq(students.status, 'active')));
    return row ?? null;
  }

  /** Order views with the item snapshot + open charge id attached. */
  private async enrich(
    tx: DbTransaction,
    rows: Array<typeof orders.$inferSelect>,
  ): Promise<OrderView[]> {
    if (rows.length === 0) return [];
    const orderIds = rows.map((r) => r.id);

    const items = await tx
      .select({
        item: orderItems,
        productName: products.name,
        monogram: products.monogram,
        gradientPreset: products.gradientPreset,
      })
      .from(orderItems)
      .innerJoin(
        products,
        and(
          eq(products.tenantId, orderItems.tenantId),
          eq(products.id, orderItems.productId),
        ),
      )
      .where(inArray(orderItems.orderId, orderIds));
    const itemByOrder = new Map(
      items.map((row) => [
        row.item.orderId,
        {
          productId: row.item.productId,
          productName: row.productName,
          monogram: row.monogram,
          gradientPreset: row.gradientPreset,
          size: row.item.size,
          quantity: row.item.quantity,
          unitPriceCents: row.item.unitPriceCents,
        },
      ]),
    );

    const openCharges = await tx
      .select({ id: charges.id, orderId: charges.orderId })
      .from(charges)
      .where(
        and(
          eq(charges.origin, 'order'),
          inArray(charges.orderId, orderIds),
          inArray(charges.status, ['open', 'overdue']),
        ),
      );
    const chargeByOrder = new Map<string, string>();
    for (const charge of openCharges) {
      if (charge.orderId) chargeByOrder.set(charge.orderId, charge.id);
    }

    return rows.map((row) =>
      this.view(
        row,
        itemByOrder.get(row.id) ?? null,
        chargeByOrder.get(row.id) ?? null,
      ),
    );
  }

  private view(
    row: typeof orders.$inferSelect,
    item: OrderView['item'],
    chargeId: string | null,
  ): OrderView {
    return {
      id: row.id,
      number: row.number,
      status: row.status,
      totalCents: row.totalCents,
      pickupNote: row.pickupNote,
      createdAt: row.createdAt.toISOString(),
      item,
      chargeId: row.status === 'pending' ? chargeId : null,
    };
  }

  private async audit(
    tx: DbTransaction,
    ctx: AuthContext & { tenantId: string },
    action: string,
    orderId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await tx.execute(sql`
      SELECT audit_append(
        ${ctx.tenantId}::uuid,
        ${ctx.userId}::uuid,
        ${ctx.impersonatorUserId}::uuid,
        ${action},
        'order',
        ${orderId}::text,
        ${JSON.stringify(metadata)}::jsonb
      )
    `);
  }
}
