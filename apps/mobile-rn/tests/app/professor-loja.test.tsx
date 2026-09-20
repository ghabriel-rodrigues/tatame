/**
 * Professor store (STO.10-11, professor-13/14 + spec 009 story 17): the
 * perfil "Loja da academia" row opens the SAME shared vitrine (consumer
 * side only — no tab-bar change, no admin surface), the professor buys
 * through the persona-neutral store routes (order + /store/charges payment
 * + simulate honoring the professor role), and Meus pedidos is the
 * professor's purchase record (no Carteira). professor-14's "desconto de
 * equipe" line is dropped per spec — never rendered.
 */

import {
  act,
  fireEvent,
  renderRouter,
  screen,
  waitFor,
} from 'expo-router/testing-library';
import * as SecureStore from 'expo-secure-store';
import { queryClient } from '../../src/session/api';
import { sessionTestApi } from '../../src/session/session-store';
import {
  installFetchMock,
  json,
  makeMe,
  type FetchHandler,
} from '../helpers/session';
import { makeProfessorProfile } from '../helpers/graduation';
import { makePixPayment } from '../helpers/billing';
import {
  FAIXA_ID,
  ORDER_CHARGE_ID,
  makeOrder,
  makeSizelessDetail,
  makeVitrine,
} from '../helpers/store';
import type { StoreOrder } from '../../src/features/store/types';

jest.useFakeTimers();

const secure = SecureStore as unknown as { __reset: () => void };

interface StoreLog {
  orderBodies: unknown[];
  paymentPaths: string[];
  simulated: string[];
}

function renderProfessorStore(override?: FetchHandler): StoreLog {
  const log: StoreLog = { orderBodies: [], paymentPaths: [], simulated: [] };
  const detail = makeSizelessDetail(); // Faixa oficial bordada, R$ 79, sizeless
  let orders: StoreOrder[] = [];

  installFetchMock((request) => {
    const overridden = override?.(request);
    if (overridden) return overridden;
    if (
      request.method === 'GET' &&
      request.path === '/v1/professor/dashboard'
    ) {
      return json(200, {
        alunosHoje: 0,
        presencaMediaPct: 0,
        nextClass: null,
        todayClasses: [],
        upcomingEventsCount: 0,
        upcomingEvents: [],
      });
    }
    if (request.method === 'GET' && request.path === '/v1/professor/profile') {
      return json(200, makeProfessorProfile());
    }
    if (request.method === 'GET' && request.path === '/v1/store/products') {
      return json(200, makeVitrine());
    }
    if (
      request.method === 'GET' &&
      request.path === `/v1/store/products/${FAIXA_ID}`
    ) {
      return json(200, detail);
    }
    if (request.method === 'POST' && request.path === '/v1/store/orders') {
      log.orderBodies.push(request.body);
      const body = request.body as { quantity: number };
      const order = makeOrder({
        number: 2440,
        totalCents: detail.priceCents * body.quantity,
        item: {
          productId: detail.id,
          productName: detail.name,
          monogram: detail.monogram,
          gradientPreset: detail.gradientPreset,
          size: null,
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
        payment: makePixPayment({
          chargeId: ORDER_CHARGE_ID,
          amountCents: 7_900,
        }),
        charge: null,
        mandateCreated: false,
      });
    }
    const simulateMatch =
      /^\/v1\/billing\/payments\/([0-9a-f-]+)\/simulate$/.exec(request.path);
    if (request.method === 'POST' && simulateMatch) {
      log.simulated.push(simulateMatch[1] ?? '');
      orders = orders.map((order) =>
        order.status === 'pending'
          ? { ...order, status: 'paid', chargeId: null }
          : order,
      );
      return json(200, {
        payment: makePixPayment({ status: 'succeeded' }),
        charge: null,
      });
    }
    return null;
  });
  sessionTestApi.seed({
    status: 'authed',
    session: makeMe({ role: 'professor', fullName: 'Rafael Nunes' }),
  });
  renderRouter('src/app');
  act(() => {
    jest.advanceTimersByTime(2000);
  });
  return log;
}

async function openVitrineFromPerfil(): Promise<void> {
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Perfil'));
  });
  await waitFor(() =>
    expect(screen.getByTestId('perfil-loja-row')).toBeTruthy(),
  );
  await act(async () => {
    fireEvent.press(screen.getByTestId('perfil-loja-row'));
  });
  await waitFor(() =>
    expect(screen.getByText('Loja Alpha Jiu-Jitsu')).toBeTruthy(),
  );
  await waitFor(() => expect(screen.getByTestId('product-grid')).toBeTruthy());
}

describe('professor store (STO.10-11)', () => {
  beforeEach(() => {
    secure.__reset();
    sessionTestApi.reset();
    queryClient.clear();
  });

  it('opens the shared vitrine from the perfil Loja row (professor-13)', async () => {
    renderProfessorStore();
    await openVitrineFromPerfil();

    // Same storefront the aluno sees — one feature, two shells.
    expect(
      screen.getAllByText('Produtos oficiais · retirada na recepção').length,
    ).toBeGreaterThan(0);
    expect(screen.getByTestId('category-chips').props.horizontal).toBe(true);
    expect(screen.getByTestId(`product-${FAIXA_ID}`)).toBeTruthy();
    // No "Novo" pill on the professor row (aluno-only per the prototype).
    expect(screen.queryByTestId('loja-novo-pill')).toBeNull();
  });

  it('buys through the persona-neutral store routes with simulate (professor-14)', async () => {
    const log = renderProfessorStore();
    await openVitrineFromPerfil();

    await act(async () => {
      fireEvent.press(screen.getByTestId(`product-${FAIXA_ID}`));
    });
    // The banner renders immediately; the thumbnails need the loaded product.
    await waitFor(() =>
      expect(screen.getByTestId('gallery-thumb-0')).toBeTruthy(),
    );
    // Sizeless product: no Tamanho section, CTA live immediately; and the
    // dropped "desconto de equipe" promise is nowhere on screen.
    expect(screen.queryByText('Tamanho')).toBeNull();
    expect(screen.queryByText(/desconto de equipe/i)).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByText('Comprar com Pix · R$ 79,00'));
    });

    await waitFor(() => expect(screen.getByTestId('pix-sheet')).toBeTruthy());
    expect(log.orderBodies).toEqual([{ productId: FAIXA_ID, quantity: 1 }]);
    // The professor pays on the store route — never the aluno wallet.
    expect(log.paymentPaths).toEqual([
      `/v1/store/charges/${ORDER_CHARGE_ID}/payments`,
    ]);
    expect(
      screen.getByText('Pedido #2440 · Faixa oficial bordada'),
    ).toBeTruthy();

    await waitFor(() =>
      expect(screen.getByText('Simular pagamento')).toBeTruthy(),
    );
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

    // Meus pedidos is the professor's record (no Carteira — story 29).
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Voltar'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('my-orders-entry')).toBeTruthy(),
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId('my-orders-entry'));
    });
    await waitFor(() => expect(screen.getByText('Pedido #2440')).toBeTruthy());
    expect(screen.getByText('Recebido')).toBeTruthy();
    expect(screen.getByText('Retirada na recepção')).toBeTruthy();
  });
});
