/**
 * Store display helpers (STO.8-9, admin-03/04/05/06). Monogram tiles resolve
 * from the store slice of the design-system gradient catalog (same slug
 * mechanism as events banners — no image upload in v1, recorded debt); the
 * order-status vocabulary maps the API enum to the prototype's PT-BR chips,
 * sheet descriptions and the client-side transition matrix (`paid` is never
 * set by hand — payment truth comes only from the provider-event handler).
 */
import { ApiErrorCodes, parseProblem, type StoreOrderStatus } from '@tatame/shared';

export interface StoreGradientPreset {
  slug: string;
  /** Lumira-token gradient — the GI/RG/FX monogram tile fill. */
  css: string;
}

/**
 * Store gradient catalog (slugs owned by the backend; visuals are the
 * prototype's tile gradients on Lumira tokens — the white-label palette has
 * no literal teal/orange, the slug is a catalog id, not a color promise).
 */
export const STORE_GRADIENT_PRESETS: StoreGradientPreset[] = [
  {
    slug: 'store-blue-purple',
    css: 'linear-gradient(135deg, var(--purple-700), var(--purple-500))',
  },
  {
    slug: 'store-teal-green',
    css: 'linear-gradient(135deg, var(--purple-800), var(--purple-600))',
  },
  {
    slug: 'store-orange-red',
    css: 'linear-gradient(135deg, var(--purple-500), var(--pink-500))',
  },
  {
    slug: 'store-pink-purple',
    css: 'linear-gradient(135deg, var(--pink-600), var(--pink-500))',
  },
];

/** Gradient CSS for a preset slug (unknown slugs fall back to the first). */
export function storeGradientCss(slug: string): string {
  const preset = STORE_GRADIENT_PRESETS.find((entry) => entry.slug === slug);
  return (preset ?? STORE_GRADIENT_PRESETS[0]!).css;
}

/**
 * Client-side preview of the API's monogram derivation (create mode only —
 * the server stores the truth): word initials, single words take two letters.
 */
export function previewMonogram(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => /\p{L}/u.test(word));
  const initials = words
    .slice(0, 3)
    .map((word) => word[0]!)
    .join('');
  const monogram = (initials.length >= 2 ? initials : name.trim().slice(0, 2))
    .toUpperCase()
    .slice(0, 3);
  return monogram || 'P';
}

/** PT-BR status labels fixed by spec 009 (pending is buyer-side copy only). */
export const ORDER_STATUS_LABELS: Record<StoreOrderStatus, string> = {
  pending: 'Aguardando pagamento',
  paid: 'Recebido',
  ready: 'Em andamento',
  delivered: 'Entregue',
  canceled: 'Cancelado',
};

/** The admin-05 sheet descriptions, verbatim from the prototype. */
export const ORDER_STATUS_DESCRIPTIONS: Record<
  Exclude<StoreOrderStatus, 'pending'>,
  string
> = {
  paid: 'Pago — aguardando separação',
  ready: 'Separando o item para retirada',
  delivered: 'Resolvido — retirado pelo comprador',
  canceled: 'Estorno do Pix em até 1 dia útil',
};

/** Board chip tone per status (Chip tones are Lumira token pairs). */
export const ORDER_STATUS_CHIP_TONES: Record<
  Exclude<StoreOrderStatus, 'pending'>,
  'brand' | 'warning' | 'success' | 'danger'
> = {
  paid: 'brand',
  ready: 'warning',
  delivered: 'success',
  canceled: 'danger',
};

/** The admin-05 option dot color (Lumira tokens, matching the chip tones). */
export const ORDER_STATUS_DOTS: Record<Exclude<StoreOrderStatus, 'pending'>, string> = {
  paid: 'var(--purple-500)',
  ready: 'var(--warning-500)',
  delivered: 'var(--success-500)',
  canceled: 'var(--danger-500)',
};

/**
 * Valid admin transitions (spec 009): paid → ready → delivered, no skips, no
 * backward moves, delivered/canceled terminal; canceled from paid/ready runs
 * the audited refund. `paid` is never a target.
 */
const VALID_TRANSITIONS: Record<StoreOrderStatus, ReadonlyArray<StoreOrderStatus>> = {
  pending: [],
  paid: ['ready', 'canceled'],
  ready: ['delivered', 'canceled'],
  delivered: [],
  canceled: [],
};

export function canTransition(from: StoreOrderStatus, to: StoreOrderStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

/** "12 em estoque" / warning "Estoque baixo: 8", always "· N vendidos". */
export function stockLine(product: {
  stockQty: number;
  lowStock: boolean;
  soldCount: number;
}): string {
  const stock = product.lowStock
    ? `Estoque baixo: ${product.stockQty}`
    : `${product.stockQty} em estoque`;
  return `${stock} · ${product.soldCount} vendidos`;
}

/** "Kimono oficial · A2" — item summary; sizeless products skip the tam. */
export function orderItemLabel(item: {
  productName: string;
  size?: string | null;
}): string {
  return item.size ? `${item.productName} · ${item.size}` : item.productName;
}

/** Comma-separated tags input → trimmed unique array (the API's tags[]). */
export function parseTagsInput(text: string): string[] {
  const tags = text
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
  return [...new Set(tags)];
}

/** PT-BR copy for the store problem codes (spec 009 stable codes). */
export function storeErrorMessage(error: unknown): string {
  const problem = parseProblem(error);
  switch (problem?.code) {
    case ApiErrorCodes.STORE_CATEGORY_IN_USE:
      return 'Só dá para remover categoria sem produtos.';
    case ApiErrorCodes.STORE_ORDER_INVALID_TRANSITION:
      return 'Este pedido não aceita essa mudança de status.';
    case ApiErrorCodes.CONFLICT:
      return 'Já existe um registro com esse nome — ou o produto está arquivado.';
    case ApiErrorCodes.VALIDATION_FAILED:
      return 'Verifique os dados informados e tente novamente.';
    case ApiErrorCodes.TENANT_READ_ONLY:
      return 'Academia em modo somente leitura — alterações bloqueadas.';
    default:
      return 'Algo deu errado. Tente novamente.';
  }
}
