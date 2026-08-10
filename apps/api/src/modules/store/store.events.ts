/**
 * Domain events for the store slice (spec 009). Emitted on the
 * `@nestjs/event-emitter` bus AFTER the tenant transaction commits;
 * notifications stay a listener-only concern (delivery is its own phase), so
 * push/e-mail plugs in later without touching this module.
 *
 * `store.order.paid` and the refund variant of `store.order.canceled` are
 * emitted by the normalized provider-event handler — payment truth has exactly
 * one source, so the simulate button and the future Stripe webhook emit
 * identically. `ready`/`delivered` come from the admin board transitions and
 * the buyer-cancel variant from the storefront.
 */

export const STORE_ORDER_PAID = 'store.order.paid';
export const STORE_ORDER_READY = 'store.order.ready';
export const STORE_ORDER_DELIVERED = 'store.order.delivered';
export const STORE_ORDER_CANCELED = 'store.order.canceled';
export const STORE_PRODUCT_LOW_STOCK = 'store.product.low_stock';

export interface OrderEventBase {
  tenantId: string;
  orderId: string;
  /** Rendered `#2431`. */
  number: number;
  /** Student or professor buyer — the notification addressee. */
  buyerUserId: string;
  totalCents: number;
}

/** The buyer's "Pedido pago — retire na recepção da academia." receipt payload. */
export interface OrderPaidEvent extends OrderEventBase {
  chargeId: string;
  paymentId: string;
  /** Single-item v1 summary: "Pedido #NNNN · <produto>". */
  productName: string;
  paidAt: string;
}

export type OrderReadyEvent = OrderEventBase;

export type OrderDeliveredEvent = OrderEventBase;

export interface OrderCanceledEvent extends OrderEventBase {
  /**
   * true = the admin Cancelado path ("Estorno do Pix em até 1 dia útil") —
   * money went back through the audited refund; false = buyer cancel of a
   * still-pending order (open charge voided, no money moved).
   */
  refunded: boolean;
}

/** Emitted when a paid decrement crosses the product's threshold (admin alert). */
export interface ProductLowStockEvent {
  tenantId: string;
  productId: string;
  name: string;
  /** Stock after the decrement (may be negative — recorded oversell behavior). */
  stockQty: number;
  lowStockThreshold: number;
}
