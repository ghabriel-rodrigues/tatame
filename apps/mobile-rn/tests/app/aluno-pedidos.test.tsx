/**
 * Meus pedidos (STO.11, spec 009 stories 27-29): status chips over the full
 * PT-BR registry, the retirada note only while there is something to pick
 * up (paid/ready), "Pagar" resuming the SAME open charge through the Pix
 * sheet with simulate flipping the card to Recebido, the pending-only
 * cancel (409 on paid mapped to PT-BR), the honest empty state, and the
 * aluno Carteira histórico rendering a settled order payment (no
 * competência) as "Pagamento avulso" with the comprovante affordance.
 */

import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import * as SecureStore from 'expo-secure-store';
import { queryClient } from '../../src/session/api';
import { sessionTestApi } from '../../src/session/session-store';
import {
  installFetchMock,
  json,
  makeMe,
  problem,
  type FetchHandler,
} from '../helpers/session';
import { makeAlunoHome, STUDENT_ID } from '../helpers/attendance';
import { makePixPayment, makeWallet } from '../helpers/billing';
import { ORDER_CHARGE_ID, makeOrder, makePaidOrder, makeVitrine } from '../helpers/store';
import type { StoreOrder } from '../../src/features/store/types';

jest.useFakeTimers();

const secure = SecureStore as unknown as { __reset: () => void };

const uuid = (block: string, counter: number) =>
  `018f0000-0000-7000-${block}-${counter.toString(16).padStart(12, '0')}`;

interface OrdersLog {
  cancels: string[];
  paymentPaths: string[];
  simulated: string[];
}

function renderPedidos(
  initialOrders: StoreOrder[],
  options: { cancelResponse?: Response } = {},
  override?: FetchHandler,
): OrdersLog {
  const log: OrdersLog = { cancels: [], paymentPaths: [], simulated: [] };
  let orders = initialOrders;

  installFetchMock((request) => {
    const overridden = override?.(request);
    if (overridden) return overridden;
    if (request.method === 'GET' && request.path === '/v1/aluno/home') {
      return json(200, makeAlunoHome({ storeStrip: [] }));
    }
    if (request.method === 'GET' && request.path === '/v1/store/products') {
      return json(200, makeVitrine());
    }
    if (request.method === 'GET' && request.path === '/v1/store/orders') {
      return json(200, { orders });
    }
    const cancelMatch = /^\/v1\/store\/orders\/([0-9a-f-]+)$/.exec(request.path);
    if (request.method === 'DELETE' && cancelMatch) {
      log.cancels.push(cancelMatch[1] ?? '');
      if (options.cancelResponse) return options.cancelResponse;
      orders = orders.map((order) =>
        order.id === cancelMatch[1]
          ? { ...order, status: 'canceled', chargeId: null }
          : order,
      );
      return new Response(null, { status: 204 });
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
      orders = orders.map((order) =>
        order.status === 'pending' ? { ...order, status: 'paid', chargeId: null } : order,
      );
      return json(200, { payment: makePixPayment({ status: 'succeeded' }), charge: null });
    }
    if (request.method === 'GET' && request.path === '/v1/aluno/wallet') {
      return json(200, makeWallet({ empty: true }));
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

/** Home → perfil Loja row → vitrine header entry → Meus pedidos. */
async function openMeusPedidos(): Promise<void> {
  await waitFor(() => expect(screen.getByText('Olá, Lucas')).toBeTruthy());
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Perfil'));
  });
  await waitFor(() => expect(screen.getByTestId('perfil-loja-row')).toBeTruthy());
  await act(async () => {
    fireEvent.press(screen.getByTestId('perfil-loja-row'));
  });
  await waitFor(() => expect(screen.getByTestId('my-orders-entry')).toBeTruthy());
  await act(async () => {
    fireEvent.press(screen.getByTestId('my-orders-entry'));
  });
  await waitFor(() => expect(screen.getByText('Meus pedidos')).toBeTruthy());
}

describe('aluno Meus pedidos (STO.11)', () => {
  beforeEach(() => {
    secure.__reset();
    sessionTestApi.reset();
    queryClient.clear();
  });

  it('maps every status to its PT-BR chip and gates the retirada note', async () => {
    const orders = [
      makeOrder(), // pending #2431
      makePaidOrder({ id: uuid('5003', 2), number: 2432 }),
      makePaidOrder({ id: uuid('5003', 3), number: 2433, status: 'ready' }),
      makePaidOrder({ id: uuid('5003', 4), number: 2434, status: 'delivered' }),
      makePaidOrder({ id: uuid('5003', 5), number: 2435, status: 'canceled' }),
    ];
    renderPedidos(orders);
    await openMeusPedidos();

    await waitFor(() => expect(screen.getByText('Pedido #2431')).toBeTruthy());
    expect(screen.getByText('Aguardando pagamento')).toBeTruthy();
    expect(screen.getByText('Recebido')).toBeTruthy();
    expect(screen.getByText('Em andamento')).toBeTruthy();
    expect(screen.getByText('Entregue')).toBeTruthy();
    expect(screen.getByText('Cancelado')).toBeTruthy();

    // Item line, date and total on the card (spec 009 story 27).
    expect(
      screen.getAllByText('Kimono oficial Horizonte · Tam M · 1 un').length,
    ).toBe(5);
    expect(screen.getAllByText('Feito em 08/08').length).toBe(5);

    // Retirada note only on paid/ready — something to pick up.
    expect(screen.getByTestId(`order-${orders[1]!.id}-pickup`)).toBeTruthy();
    expect(screen.getByTestId(`order-${orders[2]!.id}-pickup`)).toBeTruthy();
    expect(screen.queryByTestId(`order-${orders[0]!.id}-pickup`)).toBeNull();
    expect(screen.queryByTestId(`order-${orders[3]!.id}-pickup`)).toBeNull();
    expect(screen.queryByTestId(`order-${orders[4]!.id}-pickup`)).toBeNull();
  });

  it('resumes a pending order through the SAME charge and settles to Recebido', async () => {
    const log = renderPedidos([makeOrder()]);
    await openMeusPedidos();

    await waitFor(() => expect(screen.getByText('Aguardando pagamento')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByText('Pagar'));
    });

    // The open order charge drives the sheet — no new order is created.
    await waitFor(() => expect(screen.getByTestId('pix-sheet')).toBeTruthy());
    expect(log.paymentPaths).toEqual([`/v1/store/charges/${ORDER_CHARGE_ID}/payments`]);
    expect(screen.getByText('Pedido #2431 · Kimono oficial Horizonte')).toBeTruthy();

    await waitFor(() => expect(screen.getByText('Simular pagamento')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByText('Simular pagamento'));
    });
    await waitFor(() =>
      expect(
        screen.getByText('Pedido pago — retire na recepção da academia.'),
      ).toBeTruthy(),
    );
    await act(async () => {
      fireEvent.press(screen.getByText('Fechar'));
    });

    // Settlement lands via refetch: Recebido chip + retirada note.
    await waitFor(() => expect(screen.getByText('Recebido')).toBeTruthy());
    expect(screen.queryByText('Aguardando pagamento')).toBeNull();
    expect(screen.queryByText('Pagar')).toBeNull();
    expect(screen.getByText('Retirada na recepção')).toBeTruthy();
  });

  it('cancels a pending order (voids its charge) and refetches the list', async () => {
    const order = makeOrder();
    const log = renderPedidos([order]);
    await openMeusPedidos();

    await waitFor(() => expect(screen.getByText('Cancelar pedido')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByText('Cancelar pedido'));
    });

    await waitFor(() => expect(screen.getByText('Cancelado')).toBeTruthy());
    expect(log.cancels).toEqual([order.id]);
    expect(screen.queryByText('Aguardando pagamento')).toBeNull();
    expect(screen.queryByText('Pagar')).toBeNull();
  });

  it('hides Pagar/cancel on settled orders and maps the paid-cancel 409', async () => {
    // A paid order offers neither Pagar nor Cancelar pedido (story 28)…
    renderPedidos([makePaidOrder()]);
    await openMeusPedidos();
    await waitFor(() => expect(screen.getByText('Recebido')).toBeTruthy());
    expect(screen.queryByText('Pagar')).toBeNull();
    expect(screen.queryByText('Cancelar pedido')).toBeNull();
  });

  it('surfaces the PT-BR message when the cancel races a settlement (409)', async () => {
    renderPedidos([makeOrder()], {
      cancelResponse: problem(409, 'store.order_not_cancelable'),
    });
    await openMeusPedidos();

    await waitFor(() => expect(screen.getByText('Cancelar pedido')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByText('Cancelar pedido'));
    });

    await waitFor(() =>
      expect(
        screen.getByText('Pedido pago só pode ser cancelado pela academia.'),
      ).toBeTruthy(),
    );
  });

  it('renders the honest empty state', async () => {
    renderPedidos([]);
    await openMeusPedidos();

    await waitFor(() => expect(screen.getByTestId('orders-empty')).toBeTruthy());
    expect(screen.getByText('Nenhum pedido ainda')).toBeTruthy();
  });

  it('shows a settled order payment in the Carteira histórico as pagamento avulso', async () => {
    // STO.11 verification of story 29: order charges reach the wallet
    // history via billing (student_id set, no competência) — the histórico
    // renders them with the neutral title + comprovante, never "Mensalidade".
    renderPedidos([], {}, ({ method, path }) => {
      if (method === 'GET' && path === '/v1/aluno/wallet') {
        return json(
          200,
          makeWallet({
            history: [
              {
                studentId: STUDENT_ID,
                chargeId: ORDER_CHARGE_ID,
                periodStart: null,
                amountCents: 38_900,
                currency: 'BRL',
                chargeStatus: 'paid',
                paymentId: uuid('5005', 1),
                method: 'pix',
                paidAt: '2026-08-08T14:00:00.000Z',
                receiptUrl: null,
              },
            ],
          }),
        );
      }
      return null;
    });

    await waitFor(() => expect(screen.getByText('Olá, Lucas')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Carteira'));
    });

    await waitFor(() => expect(screen.getByText('Pagamento avulso')).toBeTruthy());
    expect(screen.getByText('Pago em 08/08 · Pix')).toBeTruthy();
    expect(screen.getByText('R$ 389,00')).toBeTruthy();
    expect(screen.getByText('Ver comprovante')).toBeTruthy();
  });
});
