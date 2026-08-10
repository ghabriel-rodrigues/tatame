/**
 * Store fixtures (STO.8-9 web slice, spec 009). Contract-typed factories for
 * the admin Loja console — overview tiles, category chips, product rows and
 * the pedidos board. Defaults mirror the admin-03/admin-04 screenshots:
 * R$ 3.240 vendas no mês, 23 pedidos, 1 estoque baixo (Mochila de treino),
 * the GI/RG/FX/TS/MC/PB product tiles and the #2431..#2425 order cards.
 */
import type { ApiSchemas } from '../types.js';

export type StoreOverview = ApiSchemas['StoreOverviewResponseDto'];
export type StoreLowStockProduct = ApiSchemas['LowStockProductDto'];
export type StoreCategoryFixture = ApiSchemas['StoreCategoryDto'];
export type AdminStoreProductFixture = ApiSchemas['AdminProductDto'];
export type StoreOrderItemFixture = ApiSchemas['OrderItemDto'];
export type AdminStoreOrderFixture = ApiSchemas['AdminOrderDto'];

const uuid = (block: string, counter: number) =>
  `018f0000-0000-7000-${block}-${counter.toString(16).padStart(12, '0')}`;

/** Stable category ids so products and chips can cross-reference. */
export const FIXTURE_CATEGORY_IDS = {
  kimonos: uuid('8050', 1),
  nogi: uuid('8050', 2),
  acessorios: uuid('8050', 3),
  casual: uuid('8050', 4),
} as const;

let categoryCounter = 0;
export function makeStoreCategory(
  overrides: Partial<StoreCategoryFixture> = {},
): StoreCategoryFixture {
  categoryCounter += 1;
  return {
    id: uuid('8051', categoryCounter),
    name: `Categoria ${categoryCounter}`,
    productCount: 0,
    ...overrides,
  };
}

/** admin-03 chip row: Kimonos 1 · No-gi 1 · Acessórios 3 · Casual 1. */
export function makeStoreCategoryList(): StoreCategoryFixture[] {
  return [
    makeStoreCategory({ id: FIXTURE_CATEGORY_IDS.kimonos, name: 'Kimonos', productCount: 1 }),
    makeStoreCategory({ id: FIXTURE_CATEGORY_IDS.nogi, name: 'No-gi', productCount: 1 }),
    makeStoreCategory({
      id: FIXTURE_CATEGORY_IDS.acessorios,
      name: 'Acessórios',
      productCount: 3,
    }),
    makeStoreCategory({ id: FIXTURE_CATEGORY_IDS.casual, name: 'Casual', productCount: 1 }),
  ];
}

let productCounter = 0;
export function makeAdminStoreProduct(
  overrides: Partial<AdminStoreProductFixture> = {},
): AdminStoreProductFixture {
  productCounter += 1;
  return {
    id: uuid('8052', productCounter),
    name: `Produto ${productCounter}`,
    priceCents: 10_000,
    monogram: 'PR',
    gradientPreset: 'store-blue-purple',
    categoryId: null,
    categoryName: null,
    description: null,
    tags: [],
    sizes: [],
    stockQty: 10,
    lowStockThreshold: 5,
    status: 'active',
    lowStock: false,
    soldCount: 0,
    ...overrides,
  };
}

/**
 * admin-03-faithful catalog: Kimono oficial Horizonte (GI, R$ 389),
 * Rash guard manga longa (RG, R$ 149), Faixa oficial bordada (FX, R$ 79),
 * Camiseta da equipe (TS, R$ 69), Mochila de treino (MC, R$ 189 — the one
 * "estoque baixo" row) and Protetor bucal (PB, R$ 39).
 */
export function makeAdminStoreProductList(): AdminStoreProductFixture[] {
  return [
    makeAdminStoreProduct({
      name: 'Kimono oficial Horizonte',
      monogram: 'GI',
      gradientPreset: 'store-blue-purple',
      priceCents: 38_900,
      stockQty: 12,
      soldCount: 7,
      categoryId: FIXTURE_CATEGORY_IDS.kimonos,
      categoryName: 'Kimonos',
      tags: ['kimono', 'gi', 'competição'],
      sizes: ['A1', 'A2', 'A3', 'A4'],
    }),
    makeAdminStoreProduct({
      name: 'Rash guard manga longa',
      monogram: 'RG',
      gradientPreset: 'store-teal-green',
      priceCents: 14_900,
      stockQty: 23,
      soldCount: 11,
      categoryId: FIXTURE_CATEGORY_IDS.nogi,
      categoryName: 'No-gi',
      tags: ['rashguard', 'nogi'],
      sizes: ['P', 'M', 'G', 'GG'],
    }),
    makeAdminStoreProduct({
      name: 'Faixa oficial bordada',
      monogram: 'FX',
      gradientPreset: 'store-orange-red',
      priceCents: 7_900,
      stockQty: 31,
      soldCount: 9,
      categoryId: FIXTURE_CATEGORY_IDS.acessorios,
      categoryName: 'Acessórios',
      tags: ['faixa', 'graduação'],
      sizes: ['A1', 'A2', 'A3', 'A4'],
    }),
    makeAdminStoreProduct({
      name: 'Camiseta da equipe',
      monogram: 'TS',
      gradientPreset: 'store-pink-purple',
      priceCents: 6_900,
      stockQty: 44,
      soldCount: 16,
      categoryId: FIXTURE_CATEGORY_IDS.casual,
      categoryName: 'Casual',
      tags: ['camiseta', 'casual'],
      sizes: ['P', 'M', 'G', 'GG'],
    }),
    makeAdminStoreProduct({
      name: 'Mochila de treino',
      monogram: 'MC',
      gradientPreset: 'store-blue-purple',
      priceCents: 18_900,
      stockQty: 8,
      lowStockThreshold: 10,
      lowStock: true,
      soldCount: 5,
      categoryId: FIXTURE_CATEGORY_IDS.acessorios,
      categoryName: 'Acessórios',
      tags: ['mochila', 'treino'],
    }),
    makeAdminStoreProduct({
      name: 'Protetor bucal',
      monogram: 'PB',
      gradientPreset: 'store-teal-green',
      priceCents: 3_900,
      stockQty: 26,
      soldCount: 12,
      categoryId: FIXTURE_CATEGORY_IDS.acessorios,
      categoryName: 'Acessórios',
      tags: ['protetor', 'competição'],
    }),
  ];
}

/** admin-03 tiles: R$ 3.240 vendas · 23 pedidos · 1 estoque baixo. */
export function makeStoreOverview(overrides: Partial<StoreOverview> = {}): StoreOverview {
  return {
    month: '2026-08',
    vendasMesCents: 324_000,
    pedidosMesCount: 23,
    lowStock: {
      count: 1,
      products: [
        {
          id: uuid('8052', 900),
          name: 'Mochila de treino',
          monogram: 'MC',
          gradientPreset: 'store-blue-purple',
          stockQty: 8,
          lowStockThreshold: 10,
        },
      ],
    },
    ...overrides,
  };
}

let orderCounter = 0;
export function makeStoreOrderItem(
  overrides: Partial<StoreOrderItemFixture> = {},
): StoreOrderItemFixture {
  return {
    productId: uuid('8052', 1),
    productName: 'Kimono oficial',
    monogram: 'GI',
    gradientPreset: 'store-blue-purple',
    size: 'A2',
    quantity: 1,
    unitPriceCents: 38_900,
    ...overrides,
  };
}

export function makeAdminStoreOrder(
  overrides: Partial<AdminStoreOrderFixture> = {},
): AdminStoreOrderFixture {
  orderCounter += 1;
  return {
    id: uuid('8053', orderCounter),
    number: 2400 + orderCounter,
    status: 'paid',
    totalCents: 38_900,
    pickupNote: 'Retirada na recepção',
    createdAt: '2026-08-08T14:00:00.000Z',
    item: makeStoreOrderItem(),
    chargeId: null,
    buyer: { userId: uuid('8054', orderCounter), fullName: `Comprador ${orderCounter}` },
    ...overrides,
  };
}

/**
 * admin-04-faithful board (newest first): #2431 Lucas Almeida Recebido,
 * #2430 Fernanda Silveira Em andamento, #2428 Marina Costa Entregue,
 * #2425 João Ferraz Entregue.
 */
export function makeAdminStoreOrderBoard(): AdminStoreOrderFixture[] {
  return [
    makeAdminStoreOrder({
      number: 2431,
      status: 'paid',
      totalCents: 38_900,
      buyer: { userId: uuid('8054', 901), fullName: 'Lucas Almeida' },
      item: makeStoreOrderItem({ productName: 'Kimono oficial', size: 'A2' }),
    }),
    makeAdminStoreOrder({
      number: 2430,
      status: 'ready',
      totalCents: 6_900,
      buyer: { userId: uuid('8054', 902), fullName: 'Fernanda Silveira' },
      item: makeStoreOrderItem({
        productName: 'Camiseta da equipe',
        monogram: 'TS',
        gradientPreset: 'store-pink-purple',
        size: 'P',
        unitPriceCents: 6_900,
      }),
    }),
    makeAdminStoreOrder({
      number: 2428,
      status: 'delivered',
      totalCents: 14_900,
      buyer: { userId: uuid('8054', 903), fullName: 'Marina Costa' },
      item: makeStoreOrderItem({
        productName: 'Rash guard',
        monogram: 'RG',
        gradientPreset: 'store-teal-green',
        size: 'M',
        unitPriceCents: 14_900,
      }),
    }),
    makeAdminStoreOrder({
      number: 2425,
      status: 'delivered',
      totalCents: 3_900,
      buyer: { userId: uuid('8054', 904), fullName: 'João Ferraz' },
      item: makeStoreOrderItem({
        productName: 'Protetor bucal',
        monogram: 'PB',
        gradientPreset: 'store-teal-green',
        size: null,
        unitPriceCents: 3_900,
      }),
    }),
  ];
}
