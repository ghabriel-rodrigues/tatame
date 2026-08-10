/**
 * Shared read shapes + v1 visual-identity helpers of the store module (spec
 * 009). Amounts are integer cents; the product tile is a letter monogram on a
 * design-system gradient preset (no image upload in v1 — recorded debt), the
 * same mechanism as `events.banner_preset`.
 */

export type OrderStatus = 'pending' | 'paid' | 'ready' | 'delivered' | 'canceled';

/**
 * The store slice of the design-system gradient catalog — the prototypes'
 * GI/RG/FX tile presets. Creation cycles this catalog app-side (schema keeps
 * no default), so consecutive products vary like the handoff screens.
 */
export const STORE_GRADIENT_PRESETS = [
  'store-blue-purple',
  'store-teal-green',
  'store-orange-red',
  'store-pink-purple',
] as const;

/**
 * 1–3 letter monogram auto-derived from the product name at creation (spec
 * 009): initials of the first words ("Kimono Oficial" → "KO"), single-word
 * names take their first two letters. Stored on the row so seeds can pin the
 * prototype letters (GI/RG/FX/TS/MC/PB) regardless of this rule.
 */
export function deriveMonogram(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => /\p{L}/u.test(w));
  const initials = words
    .slice(0, 3)
    .map((w) => w[0]!)
    .join('');
  const monogram = (initials.length >= 2 ? initials : name.trim().slice(0, 2))
    .toUpperCase()
    .slice(0, 3);
  return monogram || 'P';
}

/** The vitrine/product-row card base every surface renders. */
export interface ProductCardView {
  id: string;
  name: string;
  priceCents: number;
  /** 1–3 letters on the gradient tile. */
  monogram: string;
  /** Design-system gradient catalog slug. */
  gradientPreset: string;
  categoryId: string | null;
  categoryName: string | null;
}

/** The buyer's product detail (aluno-17 / professor-14). */
export interface ProductDetailView extends ProductCardView {
  description: string | null;
  /** #chips + the vitrine search surface. */
  tags: string[];
  /** Size pills; empty = the product has no sizes. */
  sizes: string[];
  /** Caps the quantity stepper ("N em estoque · retirada na recepção"). */
  stockQty: number;
}

/** One admin product row (admin-03): card + stock + derived vendidos. */
export interface AdminProductView extends ProductDetailView {
  lowStockThreshold: number;
  status: 'active' | 'archived';
  /** Derived: active AND stock_qty <= low_stock_threshold. */
  lowStock: boolean;
  /** "N vendidos" — Σ item quantities across paid/ready/delivered orders. */
  soldCount: number;
}

export interface CategoryView {
  id: string;
  name: string;
  /** The chip's product count, derived on read. */
  productCount: number;
}

/** The single v1 item snapshot rendered as "produto · tam/qtd". */
export interface OrderItemView {
  productId: string;
  productName: string;
  monogram: string;
  gradientPreset: string;
  size: string | null;
  quantity: number;
  unitPriceCents: number;
}

/** One order — Meus pedidos row and admin board row share the shape. */
export interface OrderView {
  id: string;
  /** Rendered `#2431`. */
  number: number;
  status: OrderStatus;
  totalCents: number;
  pickupNote: string;
  createdAt: string;
  item: OrderItemView | null;
  /**
   * The open order-origin charge to pay (pending only) — drives the Pix
   * sheet, addressed "Pedido #NNNN · <produto>". Null once settled/canceled.
   */
  chargeId: string | null;
}

/** Admin board row: the buyer column ("Nome · #2431" + monogram). */
export interface AdminOrderView extends OrderView {
  buyer: { userId: string; fullName: string };
}
