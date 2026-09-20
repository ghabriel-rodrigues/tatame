/**
 * Store pure logic (STO.10-11, spec 009). Everything here is client-side
 * *presentation* of server truth — prices are integer-cent snapshots, stock
 * caps and order statuses live on the API; these helpers only map the
 * payloads to the handoff's PT-BR labels and the detail-screen purchase
 * state machine (sizeless/sized × stock levels → pill/stepper/CTA state).
 */

import type { ChipTone } from '@tatame/design-system/native';
import { formatBRL, shortDayMonth } from '../billing/format';
import type {
  ProductDetail,
  StoreOrder,
  StoreOrderItem,
  StoreOrderStatus,
} from './types';

/** PT-BR status chips (spec 009 label registry — buyer side). */
export function orderStatusChip(status: StoreOrderStatus): {
  label: string;
  tone: ChipTone;
} {
  switch (status) {
    case 'pending':
      return { label: 'Aguardando pagamento', tone: 'warning' };
    case 'paid':
      return { label: 'Recebido', tone: 'success' };
    case 'ready':
      return { label: 'Em andamento', tone: 'brand' };
    case 'delivered':
      return { label: 'Entregue', tone: 'neutral' };
    case 'canceled':
      return { label: 'Cancelado', tone: 'danger' };
  }
}

/** "Comprar com Pix · R$ 389,00" — price × quantity from the live selection. */
export function buyLabel(priceCents: number, quantity: number): string {
  return `Comprar com Pix · ${formatBRL(priceCents * quantity)}`;
}

/** "12 em estoque · retirada na recepção da academia" (aluno-17 line). */
export function stockLine(stockQty: number): string {
  return `${stockQty} em estoque · retirada na recepção da academia`;
}

/** "Foto 2 de 3" — the gallery indicator (aluno-17). */
export function galleryLabel(index: number, total = 3): string {
  return `Foto ${index + 1} de ${total}`;
}

/**
 * The detail-screen purchase state machine (spec 009 testing decisions):
 * sizeless/sized × stock levels → size-pill requirement, stepper cap and
 * CTA enablement. Quantity is always clamped to [1, stockQty].
 */
export interface PurchaseState {
  soldOut: boolean;
  needsSize: boolean;
  /** CTA enabled: in stock, size satisfied, quantity within the cap. */
  canBuy: boolean;
  canDecrement: boolean;
  canIncrement: boolean;
  ctaLabel: string;
}

export function purchaseState(
  product: Pick<ProductDetail, 'priceCents' | 'sizes' | 'stockQty'>,
  size: string | null,
  quantity: number,
): PurchaseState {
  const soldOut = product.stockQty <= 0;
  const needsSize = product.sizes.length > 0;
  const quantityValid = quantity >= 1 && quantity <= product.stockQty;
  return {
    soldOut,
    needsSize,
    canBuy: !soldOut && quantityValid && (!needsSize || size !== null),
    canDecrement: quantity > 1,
    canIncrement: !soldOut && quantity < product.stockQty,
    ctaLabel: buyLabel(product.priceCents, quantity),
  };
}

/** "Pedido #2431" — per-tenant number rendered per the prototype. */
export function orderTitle(order: Pick<StoreOrder, 'number'>): string {
  return `Pedido #${order.number}`;
}

/** "Kimono oficial Horizonte · Tam M · 1 un" (Meus pedidos item line). */
export function orderItemLine(item: StoreOrderItem): string {
  const parts = [item.productName];
  if (item.size) parts.push(`Tam ${item.size}`);
  parts.push(`${item.quantity} un`);
  return parts.join(' · ');
}

/** "Feito em 08/08" — order card date line. */
export function orderDateLine(createdAt: string): string {
  return `Feito em ${shortDayMonth(createdAt)}`;
}

/** Buyer cancel is pending-only (spec 009 story 28) — server-enforced twin. */
export function canCancelOrder(order: Pick<StoreOrder, 'status'>): boolean {
  return order.status === 'pending';
}

/** Pending order with an open charge → "Pagar" resumes the SAME charge. */
export function canResumePayment(
  order: Pick<StoreOrder, 'status' | 'chargeId'>,
): boolean {
  return order.status === 'pending' && Boolean(order.chargeId);
}

/** The retirada note shows while there is something to pick up (paid/ready). */
export function showsPickupNote(status: StoreOrderStatus): boolean {
  return status === 'paid' || status === 'ready';
}
