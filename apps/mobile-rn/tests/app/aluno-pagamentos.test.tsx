/**
 * Payment sheets (BIL.17, aluno-13/14/15): Pix — QR from the provider
 * payload, copia-e-cola copy to clipboard, "Simular pagamento" gated on the
 * simulated provider (story 44) settling the charge through the simulate
 * endpoint; boleto — linha digitável + barcode + "Simular compensação";
 * cartão — display-metadata-only body (the number never leaves the device),
 * recurrence toggle creating the mandate in the same gesture, inline
 * settlement with the success pop.
 */

import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import * as Clipboard from 'expo-clipboard';
import * as SecureStore from 'expo-secure-store';
import { queryClient } from '../../src/session/api';
import { sessionTestApi } from '../../src/session/session-store';
import { installFetchMock, json, makeMe, type FetchHandler } from '../helpers/session';
import { makeAlunoHome } from '../helpers/attendance';
import {
  CHARGE_ID,
  LINHA_DIGITAVEL,
  PIX_PAYMENT_ID,
  makeBoletoPayment,
  makeOpenCharge,
  makePixPayment,
  makeWallet,
} from '../helpers/billing';

jest.useFakeTimers();

const secure = SecureStore as unknown as { __reset: () => void };
const clipboard = Clipboard as unknown as { __reset: () => void; __copied: () => string[] };

interface PaymentLog {
  paymentBodies: unknown[];
  simulated: string[];
}

function renderWallet(
  options: { provider?: 'simulated' | 'stripe'; method?: 'pix' | 'boleto' } = {},
  override?: FetchHandler,
): PaymentLog {
  const log: PaymentLog = { paymentBodies: [], simulated: [] };
  let paid = false;
  installFetchMock((request) => {
    const overridden = override?.(request);
    if (overridden) return overridden;
    if (request.method === 'GET' && request.path === '/v1/aluno/home') {
      return json(200, makeAlunoHome());
    }
    if (request.method === 'GET' && request.path === '/v1/aluno/wallet') {
      return json(200, makeWallet({ paid }));
    }
    if (
      request.method === 'POST' &&
      request.path === `/v1/aluno/wallet/charges/${CHARGE_ID}/payments`
    ) {
      log.paymentBodies.push(request.body);
      const body = request.body as { method: string; recurrence?: boolean };
      if (body.method === 'card') {
        paid = true;
        return json(201, {
          payment: makePixPayment({
            method: 'card',
            status: 'succeeded',
            paidAt: '2026-08-09T10:00:00.000Z',
            providerData: null,
          }),
          charge: makeOpenCharge({ status: 'paid' }),
          mandateCreated: body.recurrence === true,
        });
      }
      const payment =
        body.method === 'boleto'
          ? makeBoletoPayment({ provider: options.provider ?? 'simulated' })
          : makePixPayment({ provider: options.provider ?? 'simulated' });
      return json(201, { payment, charge: makeOpenCharge(), mandateCreated: false });
    }
    const simulateMatch = /^\/v1\/billing\/payments\/([0-9a-f-]+)\/simulate$/.exec(
      request.path,
    );
    if (request.method === 'POST' && simulateMatch) {
      log.simulated.push(simulateMatch[1] ?? '');
      paid = true;
      return json(200, {
        payment: makePixPayment({ status: 'succeeded', paidAt: '2026-08-09T10:00:00.000Z' }),
        charge: makeOpenCharge({ status: 'paid' }),
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

async function openCarteiraTab(): Promise<void> {
  await waitFor(() => expect(screen.getByLabelText('Carteira')).toBeTruthy());
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Carteira'));
  });
  await waitFor(() => expect(screen.getByTestId('mensalidade-card')).toBeTruthy());
}

async function openSheet(buttonText: string, sheetTestId: string): Promise<void> {
  await act(async () => {
    fireEvent.press(screen.getByText(buttonText));
  });
  await waitFor(() => expect(screen.getByTestId(sheetTestId)).toBeTruthy());
}

describe('aluno payment sheets (BIL.17)', () => {
  beforeEach(() => {
    secure.__reset();
    clipboard.__reset();
    sessionTestApi.reset();
    queryClient.clear();
  });

  it('Pix sheet creates the attempt, renders the QR and copies the copia-e-cola', async () => {
    const log = renderWallet();
    await openCarteiraTab();
    await openSheet('Pagar com Pix', 'pix-sheet');

    await waitFor(() => expect(screen.getByTestId('pix-qr')).toBeTruthy());
    expect(log.paymentBodies).toContainEqual({ method: 'pix' });
    // Card button + sheet title both render the copy.
    expect(screen.getAllByText('Pagar com Pix').length).toBeGreaterThan(1);
    expect(screen.getByText('Mensalidade de agosto · Alpha Jiu-Jitsu')).toBeTruthy();
    expect(screen.getAllByText('R$ 180,00').length).toBeGreaterThan(0);

    await act(async () => {
      fireEvent.press(screen.getByText('Copiar código Pix'));
    });
    expect(clipboard.__copied()).toContainEqual(`TATAME-SIM-PIX-${CHARGE_ID}`);
    await waitFor(() => expect(screen.getByText('Código Pix copiado.')).toBeTruthy());
  });

  it('Simular pagamento settles the charge and flips the card to Paga (story 10/15)', async () => {
    const log = renderWallet();
    await openCarteiraTab();
    await openSheet('Pagar com Pix', 'pix-sheet');

    await waitFor(() => expect(screen.getByText('Simular pagamento')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByText('Simular pagamento'));
    });

    await waitFor(() => expect(screen.getByTestId('payment-success-pop')).toBeTruthy());
    expect(log.simulated).toEqual([PIX_PAYMENT_ID]);
    expect(screen.getByText('Pagamento confirmado')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText('Fechar'));
    });
    // Settlement lands via refetch, never optimistically.
    await waitFor(() => expect(screen.getByText('Paga')).toBeTruthy());
  });

  it('hides the simulate button when the provider is not simulated (story 44)', async () => {
    renderWallet({ provider: 'stripe' });
    await openCarteiraTab();
    await openSheet('Pagar com Pix', 'pix-sheet');

    await waitFor(() => expect(screen.getByTestId('pix-qr')).toBeTruthy());
    expect(screen.queryByText('Simular pagamento')).toBeNull();
    // The copy affordance stays — only the simulate affordance is gated.
    expect(screen.getByText('Copiar código Pix')).toBeTruthy();
  });

  it('boleto sheet renders barcode + linha digitável with copy and compensação (story 11)', async () => {
    const log = renderWallet();
    await openCarteiraTab();
    await openSheet('Boleto', 'boleto-sheet');

    await waitFor(() => expect(screen.getByTestId('boleto-barcode')).toBeTruthy());
    expect(log.paymentBodies).toContainEqual({ method: 'boleto' });
    expect(screen.getByText('Boleto bancário')).toBeTruthy();
    expect(screen.getByText(LINHA_DIGITAVEL)).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText('Copiar linha digitável'));
    });
    expect(clipboard.__copied()).toContainEqual(LINHA_DIGITAVEL);
    await waitFor(() => expect(screen.getByText('Linha digitável copiada.')).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByText('Simular compensação'));
    });
    await waitFor(() => expect(screen.getByTestId('payment-success-pop')).toBeTruthy());
    expect(screen.getByText('O boleto foi compensado.')).toBeTruthy();
  });

  it('cartão posts display metadata only and settles inline (story 12)', async () => {
    const log = renderWallet();
    await openCarteiraTab();
    await openSheet('Cartão', 'card-sheet');

    fireEvent.changeText(screen.getByLabelText('Número do cartão'), '4242424242424242');
    fireEvent.changeText(screen.getByLabelText('Nome impresso no cartão'), 'LUCAS ALMEIDA');
    fireEvent.changeText(screen.getByLabelText('Validade (MM/AA)'), '1228');
    fireEvent.changeText(screen.getByLabelText('CVV'), '123');

    await act(async () => {
      fireEvent.press(screen.getByText('Pagar R$ 180,00'));
    });

    await waitFor(() => expect(screen.getByTestId('payment-success-pop')).toBeTruthy());
    expect(log.paymentBodies).toEqual([
      {
        method: 'card',
        recurrence: false,
        card: { holderName: 'LUCAS ALMEIDA', last4: '4242' },
      },
    ]);
    // The full number NEVER rides the request (backend display-metadata rule).
    expect(JSON.stringify(log.paymentBodies)).not.toContain('4242424242424242');
  });

  it('recurrence toggle creates the mandate in the same gesture (story 12/13)', async () => {
    const log = renderWallet();
    await openCarteiraTab();
    await openSheet('Cartão', 'card-sheet');

    fireEvent.changeText(screen.getByLabelText('Número do cartão'), '4242424242424242');
    fireEvent.changeText(screen.getByLabelText('Nome impresso no cartão'), 'LUCAS ALMEIDA');
    fireEvent.changeText(screen.getByLabelText('Validade (MM/AA)'), '1228');
    fireEvent.changeText(screen.getByLabelText('CVV'), '123');
    fireEvent(screen.getByTestId('recurrence-toggle'), 'valueChange', true);

    await act(async () => {
      fireEvent.press(screen.getByText('Pagar R$ 180,00'));
    });

    await waitFor(() => expect(screen.getByTestId('payment-success-pop')).toBeTruthy());
    expect(log.paymentBodies).toContainEqual({
      method: 'card',
      recurrence: true,
      card: { holderName: 'LUCAS ALMEIDA', last4: '4242' },
    });
    expect(screen.getByText(/Recorrência mensal ativada/)).toBeTruthy();
  });
});
