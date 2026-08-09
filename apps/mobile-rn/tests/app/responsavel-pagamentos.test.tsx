/**
 * Responsável Pagamentos (BIL.18, responsavel-04/05): one charge card per
 * dependent with the plan subtitle and status chip; "Pagar com Pix" opens
 * the Pix sheet addressed to that child (story 18) posting to the guardian
 * endpoint with the same simulate gating; settled cards show the mandate
 * paid line + "Ver comprovante" (story 19); consolidated histórico across
 * dependents (story 20); the home dependent cards carry the real
 * mensalidade alert (story 22).
 */

import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import * as SecureStore from 'expo-secure-store';
import { queryClient } from '../../src/session/api';
import { sessionTestApi } from '../../src/session/session-store';
import { installFetchMock, json, makeMe, type FetchHandler } from '../helpers/session';
import { makeDependents } from '../helpers/enrollment';
import {
  JULIA_PAYMENT_ID,
  PEDRO_CHARGE_ID,
  makeGuardianPayments,
  makeMensalidadeAlert,
  makePixPayment,
  makeReceipt,
} from '../helpers/billing';

jest.useFakeTimers();
jest.setSystemTime(new Date(2026, 7, 1, 12, 0, 0));

const secure = SecureStore as unknown as { __reset: () => void };

interface GuardianLog {
  paymentPaths: string[];
  paymentBodies: unknown[];
  simulated: string[];
  listGets: number;
}

function renderResponsavel(
  options: { provider?: 'simulated' | 'stripe'; withHomeAlert?: boolean } = {},
  override?: FetchHandler,
): GuardianLog {
  const log: GuardianLog = { paymentPaths: [], paymentBodies: [], simulated: [], listGets: 0 };
  let pedroPaid = false;
  installFetchMock((request) => {
    const overridden = override?.(request);
    if (overridden) return overridden;
    if (request.method === 'GET' && request.path === '/v1/responsavel/dependents') {
      const dependents = makeDependents().map((dependent, index) =>
        options.withHomeAlert && index === 0
          ? { ...dependent, mensalidade: makeMensalidadeAlert({ amountCents: 15_000 }) }
          : dependent,
      );
      return json(200, { dependents });
    }
    if (request.method === 'GET' && request.path === '/v1/responsavel/payments') {
      log.listGets += 1;
      const data = makeGuardianPayments();
      if (pedroPaid && data.dependents[0]?.currentCharge) {
        data.dependents[0].currentCharge.status = 'paid';
        data.dependents[0].currentCharge.payments = [
          makePixPayment({
            id: 'settled-pedro',
            chargeId: PEDRO_CHARGE_ID,
            status: 'succeeded',
            amountCents: 15_000,
            paidAt: '2026-08-09T10:00:00.000Z',
          }),
        ];
      }
      return json(200, data);
    }
    const payMatch = /^\/v1\/responsavel\/payments\/charges\/([0-9a-f-]+)\/payments$/.exec(
      request.path,
    );
    if (request.method === 'POST' && payMatch) {
      log.paymentPaths.push(payMatch[1] ?? '');
      log.paymentBodies.push(request.body);
      return json(201, {
        payment: makePixPayment({
          chargeId: payMatch[1] ?? '',
          amountCents: 15_000,
          provider: options.provider ?? 'simulated',
        }),
        charge: makeGuardianPayments().dependents[0]?.currentCharge,
        mandateCreated: false,
      });
    }
    const simulateMatch = /^\/v1\/billing\/payments\/([0-9a-f-]+)\/simulate$/.exec(
      request.path,
    );
    if (request.method === 'POST' && simulateMatch) {
      log.simulated.push(simulateMatch[1] ?? '');
      pedroPaid = true;
      return json(200, {
        payment: makePixPayment({ status: 'succeeded' }),
        charge: makeGuardianPayments().dependents[0]?.currentCharge,
      });
    }
    if (
      request.method === 'GET' &&
      request.path === `/v1/billing/payments/${JULIA_PAYMENT_ID}/receipt`
    ) {
      return json(200, makeReceipt({ studentName: 'Júlia Silveira', planName: 'Kids' }));
    }
    return null;
  });
  sessionTestApi.seed({
    status: 'authed',
    session: makeMe({ role: 'guardian', fullName: 'Fernanda Silveira' }),
  });
  renderRouter('src/app');
  act(() => {
    jest.advanceTimersByTime(2000);
  });
  return log;
}

async function openPagamentosTab(): Promise<void> {
  await waitFor(() => expect(screen.getByLabelText('Pagamentos')).toBeTruthy());
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Pagamentos'));
  });
  await waitFor(() => expect(screen.getByText('Pedro · agosto')).toBeTruthy());
}

describe('responsável Pagamentos (BIL.18)', () => {
  beforeEach(() => {
    secure.__reset();
    sessionTestApi.reset();
    queryClient.clear();
  });

  it('renders one charge card per dependent with plan subtitle and status chips (story 17/19)', async () => {
    renderResponsavel();
    await openPagamentosTab();

    // Pedro: open charge per responsavel-04.
    expect(screen.getByText('Pedro · agosto')).toBeTruthy();
    expect(screen.getAllByText('R$ 150,00').length).toBeGreaterThan(1);
    expect(screen.getByText('Vence em 10 de agosto · plano Kids mensal')).toBeTruthy();
    expect(screen.getByText('Em aberto')).toBeTruthy();
    expect(screen.getByText('Pagar com Pix')).toBeTruthy();

    // Júlia: settled by the card mandate.
    expect(screen.getByText('Júlia · agosto')).toBeTruthy();
    expect(screen.getByText('Paga')).toBeTruthy();
    expect(screen.getByText('Pago em 02/08 via recorrência no cartão')).toBeTruthy();
    expect(screen.getAllByText('Ver comprovante').length).toBeGreaterThan(0);
  });

  it('renders the consolidated histórico across dependents (story 20)', async () => {
    renderResponsavel();
    await openPagamentosTab();

    expect(screen.getByText('Histórico')).toBeTruthy();
    expect(screen.getByText('Pedro · julho')).toBeTruthy();
    expect(screen.getByText('Pago em 08/07 · Pix')).toBeTruthy();
    expect(screen.getByText('Júlia · julho')).toBeTruthy();
    expect(screen.getByText('Pago em 02/07 · Cartão')).toBeTruthy();
  });

  it('pays a dependent via the Pix sheet addressed to the child (story 18) and settles', async () => {
    const log = renderResponsavel();
    await openPagamentosTab();

    await act(async () => {
      fireEvent.press(screen.getByText('Pagar com Pix'));
    });
    await waitFor(() => expect(screen.getByTestId('pix-sheet')).toBeTruthy());

    // Addressed to the right child + posted to the guardian endpoint.
    await waitFor(() =>
      expect(screen.getByText('Mensalidade de agosto · Pedro Silveira')).toBeTruthy(),
    );
    expect(log.paymentPaths).toEqual([PEDRO_CHARGE_ID]);
    expect(log.paymentBodies).toContainEqual({ method: 'pix' });

    await waitFor(() => expect(screen.getByText('Simular pagamento')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByText('Simular pagamento'));
    });
    await waitFor(() => expect(screen.getByTestId('payment-success-pop')).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByText('Fechar'));
    });
    // Server truth via refetch: Pedro's card flips to Paga.
    await waitFor(() => expect(screen.getAllByText('Paga')).toHaveLength(2));
    expect(screen.queryByText('Pagar com Pix')).toBeNull();
  });

  it('hides the simulate button for a non-simulated provider (story 44)', async () => {
    renderResponsavel({ provider: 'stripe' });
    await openPagamentosTab();

    await act(async () => {
      fireEvent.press(screen.getByText('Pagar com Pix'));
    });
    await waitFor(() => expect(screen.getByTestId('pix-qr')).toBeTruthy());
    expect(screen.queryByText('Simular pagamento')).toBeNull();
  });

  it('opens the comprovante of a mandate-settled dependent (story 19)', async () => {
    renderResponsavel();
    await openPagamentosTab();

    await act(async () => {
      // First match = Júlia's card button (histórico rows repeat the copy).
      fireEvent.press(screen.getAllByText('Ver comprovante')[0]!);
    });

    await waitFor(() => expect(screen.getByTestId('receipt-sheet')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('Júlia Silveira')).toBeTruthy());
    expect(screen.getByText('Comprovante')).toBeTruthy();
    expect(screen.getByText('Kids')).toBeTruthy();
  });

  it('home dependent cards carry the real mensalidade alert (story 22)', async () => {
    renderResponsavel({ withHomeAlert: true });
    await waitFor(() => expect(screen.getByText('Pedro Silveira')).toBeTruthy());

    const alert = screen.getByTestId(/dependent-mensalidade-/);
    expect(alert).toBeTruthy();
    expect(
      screen.getByText('Mensalidade em aberto · vence em 10 de agosto · R$ 150,00'),
    ).toBeTruthy();
    // Júlia has nothing open → no alert on her card.
    expect(screen.getAllByTestId(/dependent-mensalidade-/)).toHaveLength(1);
  });
});
