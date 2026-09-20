/**
 * Store fixtures for the RN suites (STO.10-11, spec 009). Local mirror of
 * the shared contract types (the shared testing entry pulls msw, which the
 * RN jest env does not run), shaped to the handoff screenshots aluno-16/17
 * and the STO.3 seed catalog: Kimono oficial Horizonte (GI, R$ 389,
 * P/M/G/GG), Rash guard manga longa (RG, R$ 149), Faixa oficial bordada
 * (FX, R$ 79, sizeless) and Protetor bucal (PB, R$ 39, low stock).
 */

import type {
  ProductCard,
  ProductDetail,
  StoreOrder,
  StoreOrderItem,
  VitrineCategory,
  VitrineResponse,
} from '../../src/features/store/types';

const uuid = (block: string, counter: number) =>
  `018f0000-0000-7000-${block}-${counter.toString(16).padStart(12, '0')}`;

export const KIMONO_ID = uuid('5001', 1);
export const RASH_GUARD_ID = uuid('5001', 2);
export const FAIXA_ID = uuid('5001', 3);
export const PROTETOR_ID = uuid('5001', 4);
export const KIMONOS_CATEGORY_ID = uuid('5002', 1);
export const NO_GI_CATEGORY_ID = uuid('5002', 2);
export const ORDER_ID = uuid('5003', 1);
export const ORDER_CHARGE_ID = uuid('5004', 1);

export function makeCategories(): VitrineCategory[] {
  return [
    { id: KIMONOS_CATEGORY_ID, name: 'Kimonos' },
    { id: NO_GI_CATEGORY_ID, name: 'No-gi' },
  ];
}

/** aluno-16 grid card: Kimono oficial Horizonte (GI, R$ 389, Kimonos). */
export function makeProductCard(
  overrides: Partial<ProductCard> = {},
): ProductCard {
  return {
    id: KIMONO_ID,
    name: 'Kimono oficial Horizonte',
    priceCents: 38_900,
    monogram: 'GI',
    gradientPreset: 'store-blue-purple',
    categoryId: KIMONOS_CATEGORY_ID,
    categoryName: 'Kimonos',
    ...overrides,
  };
}

export function makeRashGuardCard(
  overrides: Partial<ProductCard> = {},
): ProductCard {
  return makeProductCard({
    id: RASH_GUARD_ID,
    name: 'Rash guard manga longa',
    priceCents: 14_900,
    monogram: 'RG',
    gradientPreset: 'store-pink-purple',
    categoryId: NO_GI_CATEGORY_ID,
    categoryName: 'No-gi',
    ...overrides,
  });
}

export function makeFaixaCard(
  overrides: Partial<ProductCard> = {},
): ProductCard {
  return makeProductCard({
    id: FAIXA_ID,
    name: 'Faixa oficial bordada',
    priceCents: 7_900,
    monogram: 'FX',
    gradientPreset: 'store-teal-green',
    categoryId: null,
    categoryName: null,
    ...overrides,
  });
}

export function makeVitrine(
  products?: ProductCard[],
  categories?: VitrineCategory[],
): VitrineResponse {
  return {
    products: products ?? [
      makeProductCard(),
      makeRashGuardCard(),
      makeFaixaCard(),
    ],
    categories: categories ?? makeCategories(),
  };
}

/** aluno-17 detail: GI banner, #tags, P/M/G/GG pills, 12 em estoque. */
export function makeProductDetail(
  overrides: Partial<ProductDetail> = {},
): ProductDetail {
  return {
    id: KIMONO_ID,
    name: 'Kimono oficial Horizonte',
    priceCents: 38_900,
    monogram: 'GI',
    gradientPreset: 'store-blue-purple',
    categoryId: KIMONOS_CATEGORY_ID,
    categoryName: 'Kimonos',
    description:
      'Trançado leve com bordados oficiais da equipe no peito e na calça. Corte de competição, pré-encolhido.',
    tags: ['kimono', 'gi', 'competição'],
    sizes: ['P', 'M', 'G', 'GG'],
    stockQty: 12,
    ...overrides,
  };
}

/** Sizeless product (Faixa) — no Tamanho section (spec 009 story 23). */
export function makeSizelessDetail(
  overrides: Partial<ProductDetail> = {},
): ProductDetail {
  return makeProductDetail({
    id: FAIXA_ID,
    name: 'Faixa oficial bordada',
    priceCents: 7_900,
    monogram: 'FX',
    gradientPreset: 'store-teal-green',
    categoryId: null,
    categoryName: null,
    description: null,
    tags: ['acessórios'],
    sizes: [],
    stockQty: 5,
    ...overrides,
  });
}

export function makeOrderItem(
  overrides: Partial<StoreOrderItem> = {},
): StoreOrderItem {
  return {
    productId: KIMONO_ID,
    productName: 'Kimono oficial Horizonte',
    monogram: 'GI',
    gradientPreset: 'store-blue-purple',
    size: 'M',
    quantity: 1,
    unitPriceCents: 38_900,
    ...overrides,
  };
}

/** Pedido #2431 — the prototype's order number. */
export function makeOrder(overrides: Partial<StoreOrder> = {}): StoreOrder {
  return {
    id: ORDER_ID,
    number: 2431,
    status: 'pending',
    totalCents: 38_900,
    pickupNote: 'Retirada na recepção',
    createdAt: '2026-08-08T14:00:00.000Z',
    item: makeOrderItem(),
    chargeId: ORDER_CHARGE_ID,
    ...overrides,
  };
}

export function makePaidOrder(overrides: Partial<StoreOrder> = {}): StoreOrder {
  return makeOrder({ status: 'paid', chargeId: null, ...overrides });
}
