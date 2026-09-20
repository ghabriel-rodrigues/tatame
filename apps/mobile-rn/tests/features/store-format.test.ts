/**
 * Store pure logic (STO.10-11, spec 009 testing decisions): the detail
 * purchase state machine (sizeless/sized × stock levels → pill/stepper/CTA
 * state), the PT-BR status-chip label mapping, the fixed-copy formatters,
 * the deterministic gallery derivation and the histórico title split
 * (mensalidade vs avulso — order/event-origin charges have no competência).
 */

import { storeGalleryPresets } from '@tatame/design-system/native';
import { historyTitle } from '../../src/features/billing/format';
import {
  buyLabel,
  canCancelOrder,
  canResumePayment,
  galleryLabel,
  orderDateLine,
  orderItemLine,
  orderStatusChip,
  orderTitle,
  purchaseState,
  showsPickupNote,
  stockLine,
} from '../../src/features/store/format';
import { makeOrder, makeOrderItem, makeProductDetail } from '../helpers/store';

describe('purchase state machine (spec 009 stories 23-25)', () => {
  const sized = makeProductDetail(); // P/M/G/GG, 12 em estoque, R$ 389

  it('requires a size pill when the product defines sizes', () => {
    const without = purchaseState(sized, null, 1);
    expect(without.needsSize).toBe(true);
    expect(without.canBuy).toBe(false);

    const withSize = purchaseState(sized, 'M', 1);
    expect(withSize.canBuy).toBe(true);
  });

  it('buys immediately on sizeless products (tamanho is a choice, not a guess)', () => {
    const sizeless = makeProductDetail({ sizes: [], stockQty: 5 });
    const state = purchaseState(sizeless, null, 1);
    expect(state.needsSize).toBe(false);
    expect(state.canBuy).toBe(true);
  });

  it('caps the stepper at the available stock and floors it at 1', () => {
    const twoLeft = makeProductDetail({ sizes: [], stockQty: 2 });
    expect(purchaseState(twoLeft, null, 1).canDecrement).toBe(false);
    expect(purchaseState(twoLeft, null, 1).canIncrement).toBe(true);
    expect(purchaseState(twoLeft, null, 2).canIncrement).toBe(false);
    expect(purchaseState(twoLeft, null, 2).canBuy).toBe(true);
    // Beyond-stock quantity is never purchasable (story 24).
    expect(purchaseState(twoLeft, null, 3).canBuy).toBe(false);
  });

  it('flags esgotado at zero stock and disables everything', () => {
    const soldOut = purchaseState(makeProductDetail({ stockQty: 0 }), 'M', 1);
    expect(soldOut.soldOut).toBe(true);
    expect(soldOut.canBuy).toBe(false);
    expect(soldOut.canIncrement).toBe(false);
  });

  it('multiplies the CTA total by the quantity (price snapshot × qty)', () => {
    expect(purchaseState(sized, 'M', 1).ctaLabel).toBe(
      'Comprar com Pix · R$ 389,00',
    );
    expect(purchaseState(sized, 'M', 3).ctaLabel).toBe(
      'Comprar com Pix · R$ 1.167,00',
    );
    expect(buyLabel(38_900, 2)).toBe('Comprar com Pix · R$ 778,00');
  });
});

describe('order status chips (spec 009 PT-BR label registry)', () => {
  it.each([
    ['pending', 'Aguardando pagamento', 'warning'],
    ['paid', 'Recebido', 'success'],
    ['ready', 'Em andamento', 'brand'],
    ['delivered', 'Entregue', 'neutral'],
    ['canceled', 'Cancelado', 'danger'],
  ] as const)('%s → "%s" (%s)', (status, label, tone) => {
    expect(orderStatusChip(status)).toEqual({ label, tone });
  });

  it('shows the retirada note only while there is something to pick up', () => {
    expect(showsPickupNote('paid')).toBe(true);
    expect(showsPickupNote('ready')).toBe(true);
    expect(showsPickupNote('pending')).toBe(false);
    expect(showsPickupNote('delivered')).toBe(false);
    expect(showsPickupNote('canceled')).toBe(false);
  });

  it('cancels and resumes payment on pending orders only (story 28)', () => {
    expect(canCancelOrder(makeOrder())).toBe(true);
    expect(canResumePayment(makeOrder())).toBe(true);
    expect(canCancelOrder(makeOrder({ status: 'paid' }))).toBe(false);
    expect(
      canResumePayment(makeOrder({ status: 'paid', chargeId: null })),
    ).toBe(false);
    expect(canResumePayment(makeOrder({ chargeId: null }))).toBe(false);
  });
});

describe('fixed-copy formatters', () => {
  it('renders the order lines per the prototype', () => {
    expect(orderTitle(makeOrder())).toBe('Pedido #2431');
    expect(orderItemLine(makeOrderItem())).toBe(
      'Kimono oficial Horizonte · Tam M · 1 un',
    );
    expect(orderItemLine(makeOrderItem({ size: null, quantity: 2 }))).toBe(
      'Kimono oficial Horizonte · 2 un',
    );
    expect(orderDateLine('2026-08-08T14:00:00.000Z')).toBe('Feito em 08/08');
    expect(stockLine(12)).toBe(
      '12 em estoque · retirada na recepção da academia',
    );
    expect(galleryLabel(1)).toBe('Foto 2 de 3');
  });
});

describe('gallery derivation (spec 009 — derivation, not schema)', () => {
  it('yields the own preset plus the 2 catalog neighbors, wrap-around', () => {
    expect(storeGalleryPresets('store-blue-purple')).toEqual([
      'store-blue-purple',
      'store-teal-green',
      'store-orange-red',
    ]);
    expect(storeGalleryPresets('store-pink-purple')).toEqual([
      'store-pink-purple',
      'store-blue-purple',
      'store-teal-green',
    ]);
  });

  it('falls back to the catalog head on unknown slugs (catalog may lag the server)', () => {
    expect(storeGalleryPresets('store-future-preset')[0]).toBe(
      'store-blue-purple',
    );
    expect(storeGalleryPresets(null)[0]).toBe('store-blue-purple');
  });
});

describe('carteira histórico title (spec 009 story 29)', () => {
  it('keeps the mensalidade label for plan charges (competência present)', () => {
    expect(
      historyTitle({ periodStart: '2026-07-01', paidAt: '2026-07-08' }),
    ).toBe('Mensalidade · julho');
  });

  it('labels order/event payments (no competência) as pagamento avulso', () => {
    expect(
      historyTitle({ periodStart: null, paidAt: '2026-08-08T14:00:00.000Z' }),
    ).toBe('Pagamento avulso');
  });
});
