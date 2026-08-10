/**
 * Aluno store (STO.10, aluno-16/17 + spec 009): the home "Loja da academia"
 * strip (3 products + Ver tudo), the perfil row with the "Novo" pill, the
 * vitrine (header copy, working category chip carousel, server-side busca,
 * unclipped 2-column grid, honest empty state), the detail anatomy (gallery
 * variants with "Foto N de 3", #tags, size pills, capped stepper, stock
 * line, esgotado) and the full purchase: "Comprar com Pix · R$ X" → order +
 * order-origin charge → the EXISTING Pix sheet on the store payment route →
 * simulate → "Pedido pago — retire na recepção da academia." → Meus pedidos
 * "Recebido" (settlement via refetch, never optimistic). Stacked screens
 * stay mounted, so assertions use testIDs / getAllByText where copy repeats.
 */

import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import * as SecureStore from 'expo-secure-store';
import { queryClient } from '../../src/session/api';
import { sessionTestApi } from '../../src/session/session-store';
import { installFetchMock, json, makeMe, type FetchHandler } from '../helpers/session';
import { makeAlunoHome } from '../helpers/attendance';
import { makePixPayment } from '../helpers/billing';
import {
  KIMONO_ID,
  KIMONOS_CATEGORY_ID,
  NO_GI_CATEGORY_ID,
  ORDER_CHARGE_ID,
  RASH_GUARD_ID,
  makeFaixaCard,
  makeOrder,
  makeProductCard,
  makeProductDetail,
  makeRashGuardCard,
  makeVitrine,
} from '../helpers/store';
import type { ProductDetail, StoreOrder } from '../../src/features/store/types';

jest.useFakeTimers();

const secure = SecureStore as unknown as { __reset: () => void };

interface StoreLog {
  vitrineSearches: string[];
  orderBodies: unknown[];
  paymentPaths: string[];
  simulated: string[];
}

/**
 * Stateful mock: creating the order and simulating settlement mutate the
 * served orders/detail the way the API would (order → paid, stock
 * decremented), so everything lands via refetch like production.
 */
function renderAlunoStore(
  options: { detail?: ProductDetail; orders?: StoreOrder[] } = {},
  override?: FetchHandler,
): StoreLog {
  const log: StoreLog = {
    vitrineSearches: [],
    orderBodies: [],
    paymentPaths: [],
    simulated: [],
  };
  let detail = options.detail ?? makeProductDetail();
  let orders: StoreOrder[] = options.orders ?? [];

  installFetchMock((request) => {
    const overridden = override?.(request);
    if (overridden) return overridden;
    if (request.method === 'GET' && request.path === '/v1/aluno/home') {
      return json(
        200,
        makeAlunoHome({
          storeStrip: [makeProductCard(), makeRashGuardCard(), makeFaixaCard()],
        }),
      );
    }
    if (request.method === 'GET' && request.path === '/v1/store/products') {
      log.vitrineSearches.push(request.search);
      const params = new URLSearchParams(request.search);
      const search = params.get('search')?.toLowerCase() ?? '';
      const categoryId = params.get('categoryId');
      const all = [makeProductCard(), makeRashGuardCard(), makeFaixaCard()];
      const products = all.filter((product) => {
        if (categoryId && product.categoryId !== categoryId) return false;
        if (search && !product.name.toLowerCase().includes(search)) return false;
        return true;
      });
      return json(200, makeVitrine(products));
    }
    if (request.method === 'GET' && request.path === `/v1/store/products/${detail.id}`) {
      return json(200, detail);
    }
    if (request.method === 'POST' && request.path === '/v1/store/orders') {
      log.orderBodies.push(request.body);
      const body = request.body as { size?: string | null; quantity: number };
      const order = makeOrder({
        totalCents: detail.priceCents * body.quantity,
        item: {
          productId: detail.id,
          productName: detail.name,
          monogram: detail.monogram,
          gradientPreset: detail.gradientPreset,
          size: body.size ?? null,
          quantity: body.quantity,
          unitPriceCents: detail.priceCents,
        },
      });
      orders = [order, ...orders];
      return json(201, { order, chargeId: ORDER_CHARGE_ID });
    }
    if (request.method === 'GET' && request.path === '/v1/store/orders') {
      return json(200, { orders });
    }
    if (
      request.method === 'POST' &&
      request.path === `/v1/store/charges/${ORDER_CHARGE_ID}/payments`
    ) {
      log.paymentPaths.push(request.path);
      return json(201, {
        payment: makePixPayment({ chargeId: ORDER_CHARGE_ID }),
        charge: null,
        mandateCreated: false,
      });
    }
    const simulateMatch = /^\/v1\/billing\/payments\/([0-9a-f-]+)\/simulate$/.exec(
      request.path,
    );
    if (request.method === 'POST' && simulateMatch) {
      log.simulated.push(simulateMatch[1] ?? '');
      // The normalized-event handler: order → paid, stock decremented.
      const quantity = orders[0]?.item?.quantity ?? 1;
      orders = orders.map((order) =>
        order.status === 'pending' ? { ...order, status: 'paid', chargeId: null } : order,
      );
      detail = { ...detail, stockQty: detail.stockQty - quantity };
      return json(200, { payment: makePixPayment({ status: 'succeeded' }), charge: null });
    }
    if (request.method === 'GET' && request.path === '/v1/aluno/wallet') {
      return json(200, {
        student: { id: 'x', fullName: 'Lucas Almeida' },
        plan: null,
        currentCharge: null,
        recurrence: { active: false, nextChargeDueDate: null },
        history: [],
      });
    }
    return null;
  });
  sessionTestApi.seed({ status: 'authed', session: makeMe({ role: 'student' }) });
  renderRouter('src/app');
  act(() => {
    jest.advanceTimersByTime(2000);
  });
  return log;
}

async function openVitrineFromHome(): Promise<void> {
  await waitFor(() => expect(screen.getByTestId('store-strip')).toBeTruthy());
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Ver tudo'));
  });
  await waitFor(() => expect(screen.getByText('Loja Alpha Jiu-Jitsu')).toBeTruthy());
  await waitFor(() => expect(screen.getByTestId('product-grid')).toBeTruthy());
}

async function openDetail(productId: string): Promise<void> {
  await act(async () => {
    fireEvent.press(screen.getByTestId(`product-${productId}`));
  });
  // The banner renders immediately; the thumbnails need the loaded product.
  await waitFor(() => expect(screen.getByTestId('gallery-thumb-0')).toBeTruthy());
}

describe('aluno store (STO.10)', () => {
  beforeEach(() => {
    secure.__reset();
    sessionTestApi.reset();
    queryClient.clear();
  });

  it('renders the home Loja strip (3 products + Ver tudo) opening the vitrine', async () => {
    renderAlunoStore();

    await waitFor(() => expect(screen.getByTestId('store-strip')).toBeTruthy());
    expect(screen.getByText('Loja da academia')).toBeTruthy();
    expect(screen.getByTestId(`home-store-${KIMONO_ID}`)).toBeTruthy();
    expect(screen.getByText('Kimono oficial Horizonte')).toBeTruthy();
    expect(screen.getByText('R$ 389,00')).toBeTruthy();
    expect(screen.getByText('Rash guard manga longa')).toBeTruthy();
    expect(screen.getByText('Faixa oficial bordada')).toBeTruthy();

    await openVitrineFromHome();
    // aluno-16 header + the two prototype-bug fixes are on screen: a truly
    // horizontal chip carousel and the full (unclipped) grid content.
    expect(
      screen.getAllByText('Produtos oficiais · retirada na recepção').length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByPlaceholderText('Buscar por nome ou tag (ex: kimono, treino)'),
    ).toBeTruthy();
    expect(screen.getByTestId('category-chips').props.horizontal).toBe(true);
    expect(screen.getByTestId(`product-${KIMONO_ID}`)).toBeTruthy();
    expect(screen.getByTestId(`product-${RASH_GUARD_ID}`)).toBeTruthy();
    expect(screen.getByTestId(`product-${KIMONO_ID}-tile`)).toBeTruthy();
  });

  it('pushes the detail straight from a home strip card', async () => {
    renderAlunoStore();

    await waitFor(() => expect(screen.getByTestId('store-strip')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByTestId(`home-store-${KIMONO_ID}`));
    });

    await waitFor(() => expect(screen.getByTestId('gallery-indicator')).toBeTruthy());
    expect(screen.getByText('Foto 1 de 3')).toBeTruthy();
  });

  it('searches by name/tag server-side and shows the honest empty state', async () => {
    const log = renderAlunoStore();
    await openVitrineFromHome();

    const input = screen.getByPlaceholderText('Buscar por nome ou tag (ex: kimono, treino)');
    await act(async () => {
      fireEvent.changeText(input, 'rash');
    });

    await waitFor(() => expect(screen.queryByTestId(`product-${KIMONO_ID}`)).toBeNull());
    expect(screen.getByTestId(`product-${RASH_GUARD_ID}`)).toBeTruthy();
    expect(log.vitrineSearches.some((s) => s.includes('search=rash'))).toBe(true);

    await act(async () => {
      fireEvent.changeText(input, 'inexistente');
    });
    await waitFor(() => expect(screen.getByTestId('vitrine-empty')).toBeTruthy());
    expect(screen.getByText('Nenhum produto encontrado')).toBeTruthy();
  });

  it('filters through the working category chip carousel and resets on Tudo', async () => {
    const log = renderAlunoStore();
    await openVitrineFromHome();

    // "Tudo" + one chip per category, in a horizontally scrollable carousel.
    expect(screen.getByTestId('category-chip-all')).toBeTruthy();
    expect(screen.getByTestId(`category-chip-${KIMONOS_CATEGORY_ID}`)).toBeTruthy();
    expect(screen.getByTestId(`category-chip-${NO_GI_CATEGORY_ID}`)).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId(`category-chip-${NO_GI_CATEGORY_ID}`));
    });
    await waitFor(() => expect(screen.queryByTestId(`product-${KIMONO_ID}`)).toBeNull());
    expect(screen.getByTestId(`product-${RASH_GUARD_ID}`)).toBeTruthy();
    expect(
      log.vitrineSearches.some((s) => s.includes(`categoryId=${NO_GI_CATEGORY_ID}`)),
    ).toBe(true);

    await act(async () => {
      fireEvent.press(screen.getByTestId('category-chip-all'));
    });
    await waitFor(() => expect(screen.getByTestId(`product-${KIMONO_ID}`)).toBeTruthy());
  });

  it('renders the aluno-17 detail anatomy with switching gallery variants', async () => {
    renderAlunoStore();
    await openVitrineFromHome();
    await openDetail(KIMONO_ID);

    expect(screen.getByTestId('product-banner')).toBeTruthy();
    expect(screen.getByTestId('product-category-pill')).toBeTruthy();
    expect(screen.getByText('Foto 1 de 3')).toBeTruthy();
    expect(screen.getByText(/Trançado leve com bordados oficiais/)).toBeTruthy();
    expect(screen.getByTestId('tag-kimono')).toBeTruthy();
    expect(screen.getByTestId('tag-competição')).toBeTruthy();
    expect(screen.getByText('Tamanho')).toBeTruthy();
    for (const size of ['P', 'M', 'G', 'GG']) {
      expect(screen.getByTestId(`size-${size}`)).toBeTruthy();
    }
    expect(screen.getByText('Quantidade')).toBeTruthy();
    expect(
      screen.getByText('12 em estoque · retirada na recepção da academia'),
    ).toBeTruthy();

    // Thumbnails switch the banner variant ("Foto 2 de 3").
    await act(async () => {
      fireEvent.press(screen.getByTestId('gallery-thumb-1'));
    });
    expect(screen.getByText('Foto 2 de 3')).toBeTruthy();
  });

  it('full purchase: size + qty → order → Pix sheet → simulate → Recebido', async () => {
    const log = renderAlunoStore();
    await openVitrineFromHome();
    await openDetail(KIMONO_ID);

    // CTA blocked until the required size is picked (story 23).
    const cta = () => screen.getByText('Comprar com Pix · R$ 389,00');
    await act(async () => {
      fireEvent.press(cta());
    });
    expect(log.orderBodies).toHaveLength(0);

    await act(async () => {
      fireEvent.press(screen.getByTestId('size-M'));
    });
    await act(async () => {
      fireEvent.press(cta());
    });

    // Pending order + order-origin charge → the EXISTING Pix rails on the
    // persona-neutral store route, addressed "Pedido #NNNN · <produto>".
    await waitFor(() => expect(screen.getByTestId('pix-sheet')).toBeTruthy());
    expect(log.orderBodies).toEqual([{ productId: KIMONO_ID, size: 'M', quantity: 1 }]);
    expect(log.paymentPaths).toEqual([`/v1/store/charges/${ORDER_CHARGE_ID}/payments`]);
    expect(screen.getByText('Pedido #2431 · Kimono oficial Horizonte')).toBeTruthy();

    // Simulated provider → the simulate affordance (same gating as billing).
    await waitFor(() => expect(screen.getByText('Simular pagamento')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByText('Simular pagamento'));
    });

    await waitFor(() =>
      expect(
        screen.getByText('Pedido pago — retire na recepção da academia.'),
      ).toBeTruthy(),
    );
    expect(log.simulated).toHaveLength(1);
    await act(async () => {
      fireEvent.press(screen.getByText('Fechar'));
    });

    // Round trip: back to the vitrine, then Meus pedidos shows Recebido.
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Voltar'));
    });
    await waitFor(() => expect(screen.getByTestId('my-orders-entry')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByTestId('my-orders-entry'));
    });
    await waitFor(() => expect(screen.getByText('Pedido #2431')).toBeTruthy());
    expect(screen.getByText('Recebido')).toBeTruthy();
    expect(screen.getByText('Retirada na recepção')).toBeTruthy();
  });

  it('caps the quantity stepper at stock and multiplies the CTA total', async () => {
    renderAlunoStore({ detail: makeProductDetail({ sizes: [], stockQty: 2 }) });
    await openVitrineFromHome();
    await openDetail(KIMONO_ID);

    expect(screen.getByText('Comprar com Pix · R$ 389,00')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('qty-stepper-plus'));
    });
    expect(screen.getByText('Comprar com Pix · R$ 778,00')).toBeTruthy();
    // Capped at the 2 in stock — the plus is disabled now.
    await act(async () => {
      fireEvent.press(screen.getByTestId('qty-stepper-plus'));
    });
    expect(screen.getByText('Comprar com Pix · R$ 778,00')).toBeTruthy();
    expect(screen.queryByText('Comprar com Pix · R$ 1.167,00')).toBeNull();
  });

  it('renders esgotado with a disabled CTA and no stepper at zero stock', async () => {
    renderAlunoStore({ detail: makeProductDetail({ stockQty: 0 }) });
    await openVitrineFromHome();
    await openDetail(KIMONO_ID);

    expect(screen.getByTestId('sold-out-badge')).toBeTruthy();
    expect(screen.getByText('Esgotado')).toBeTruthy();
    expect(screen.queryByTestId('qty-stepper')).toBeNull();
    expect(
      screen.queryByText('0 em estoque · retirada na recepção da academia'),
    ).toBeNull();
  });

  it('opens the vitrine from the perfil Loja row with its Novo pill', async () => {
    renderAlunoStore();

    await waitFor(() => expect(screen.getByTestId('store-strip')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Perfil'));
    });
    await waitFor(() => expect(screen.getByTestId('perfil-loja-row')).toBeTruthy());
    expect(screen.getByTestId('loja-novo-pill')).toBeTruthy();
    expect(screen.getByText('Novo')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('perfil-loja-row'));
    });
    await waitFor(() => expect(screen.getByText('Loja Alpha Jiu-Jitsu')).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId('product-grid')).toBeTruthy());
  });
});
