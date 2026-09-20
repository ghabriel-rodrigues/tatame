/**
 * Aluno Carteira (BIL.16, aluno-12): wallet render states — open charge
 * (mensalidade card + Em aberto chip + due date + plan header + the three
 * payment actions), paid (Paga chip + comprovante), lazy-overdue (Em
 * atraso), the recurrence banner with the cancel action (story 6/14), the
 * histórico with "Ver comprovante" opening the receipt sheet (story 4/5)
 * and the no-plan empty state (story 8).
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
import { makeAlunoHome } from '../helpers/attendance';
import {
  HISTORY_PAYMENT_JUL,
  makeReceipt,
  makeWallet,
  type WalletOptions,
} from '../helpers/billing';

jest.useFakeTimers();

const secure = SecureStore as unknown as { __reset: () => void };

interface WalletLog {
  walletGets: number;
  mandateDeletes: number;
}

function renderCarteira(
  walletOptions: WalletOptions = {},
  override?: FetchHandler,
): WalletLog {
  const log: WalletLog = { walletGets: 0, mandateDeletes: 0 };
  let mandateActive = walletOptions.recurrence ?? false;
  installFetchMock((request) => {
    const overridden = override?.(request);
    if (overridden) return overridden;
    if (request.method === 'GET' && request.path === '/v1/aluno/home') {
      return json(200, makeAlunoHome());
    }
    if (request.method === 'GET' && request.path === '/v1/aluno/wallet') {
      log.walletGets += 1;
      return json(
        200,
        makeWallet({ ...walletOptions, recurrence: mandateActive }),
      );
    }
    if (
      request.method === 'DELETE' &&
      request.path === '/v1/aluno/wallet/mandate'
    ) {
      log.mandateDeletes += 1;
      mandateActive = false;
      return new Response(null, { status: 204 });
    }
    if (
      request.method === 'GET' &&
      request.path === `/v1/billing/payments/${HISTORY_PAYMENT_JUL}/receipt`
    ) {
      return json(200, makeReceipt());
    }
    return null;
  });
  sessionTestApi.seed({
    status: 'authed',
    session: makeMe({ role: 'student' }),
  });
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
  await waitFor(() =>
    expect(screen.getAllByText('Carteira').length).toBeGreaterThan(0),
  );
}

describe('aluno Carteira (BIL.16)', () => {
  beforeEach(() => {
    secure.__reset();
    sessionTestApi.reset();
    queryClient.clear();
  });

  it('renders the open mensalidade card with plan header, chip, due date and actions', async () => {
    renderCarteira();
    await openCarteiraTab();

    await waitFor(() =>
      expect(screen.getByTestId('mensalidade-card')).toBeTruthy(),
    );
    // Plan header line (story 2).
    expect(
      screen.getByText('Plano mensal recorrente · R$ 180,00'),
    ).toBeTruthy();
    // Mensalidade card (story 1).
    expect(screen.getByText('Mensalidade · agosto')).toBeTruthy();
    // Card amount (histórico rows repeat the plan value).
    expect(screen.getAllByText('R$ 180,00').length).toBeGreaterThan(0);
    expect(screen.getByText('Em aberto')).toBeTruthy();
    expect(screen.getByText('Vence em 10 de agosto')).toBeTruthy();
    // Every payment method two taps away (story 3).
    expect(screen.getByText('Pagar com Pix')).toBeTruthy();
    expect(screen.getByText('Boleto')).toBeTruthy();
    expect(screen.getByText('Cartão')).toBeTruthy();
    // No recurrence banner without an active mandate.
    expect(screen.queryByTestId('recurrence-banner')).toBeNull();
  });

  it('renders the paid state with the Paga chip and no payment actions', async () => {
    renderCarteira({ paid: true });
    await openCarteiraTab();

    await waitFor(() => expect(screen.getByText('Paga')).toBeTruthy());
    expect(screen.getByText('Pago em 05/08 · Pix')).toBeTruthy();
    expect(screen.queryByText('Pagar com Pix')).toBeNull();
    // Card button + histórico row links.
    expect(screen.getAllByText('Ver comprovante').length).toBeGreaterThan(0);
  });

  it('renders the lazy-overdue charge with the Em atraso chip', async () => {
    renderCarteira({ overdue: true });
    await openCarteiraTab();

    await waitFor(() => expect(screen.getByText('Em atraso')).toBeTruthy());
    expect(screen.getByText('Vence em 10 de julho')).toBeTruthy();
    // Overdue charges stay payable.
    expect(screen.getByText('Pagar com Pix')).toBeTruthy();
  });

  it('shows the clean empty state when no plan is assigned (story 8)', async () => {
    renderCarteira({ empty: true });
    await openCarteiraTab();

    await waitFor(() =>
      expect(screen.getByTestId('wallet-empty')).toBeTruthy(),
    );
    expect(screen.getByText('Sem plano de mensalidade')).toBeTruthy();
    expect(screen.queryByTestId('mensalidade-card')).toBeNull();
    expect(screen.queryByText('Histórico')).toBeNull();
  });

  it('renders the recurrence banner and cancels the mandate (story 6/14)', async () => {
    const log = renderCarteira({ recurrence: true });
    await openCarteiraTab();

    await waitFor(() =>
      expect(screen.getByTestId('recurrence-banner')).toBeTruthy(),
    );
    expect(
      screen.getByText(
        'Cobrança recorrente ativa. A próxima mensalidade chega em 1 de setembro com aviso automático.',
      ),
    ).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText('Cancelar recorrência'));
    });

    await waitFor(() =>
      expect(screen.queryByTestId('recurrence-banner')).toBeNull(),
    );
    expect(log.mandateDeletes).toBe(1);
  });

  it('lists the histórico with month, method, date and amount (story 4)', async () => {
    renderCarteira();
    await openCarteiraTab();

    await waitFor(() => expect(screen.getByText('Histórico')).toBeTruthy());
    expect(screen.getByText('Mensalidade · julho')).toBeTruthy();
    expect(screen.getByText('Pago em 08/07 · Pix')).toBeTruthy();
    expect(screen.getByText('Mensalidade · junho')).toBeTruthy();
    expect(screen.getByText('Pago em 05/06 · Pix')).toBeTruthy();
    expect(screen.getAllByText('Ver comprovante')).toHaveLength(2);
  });

  it('opens the comprovante sheet from a histórico row (story 5)', async () => {
    renderCarteira();
    await openCarteiraTab();

    await waitFor(() =>
      expect(screen.getByText('Mensalidade · julho')).toBeTruthy(),
    );
    await act(async () => {
      fireEvent.press(
        screen.getByLabelText('Ver comprovante · Mensalidade · julho'),
      );
    });

    await waitFor(() =>
      expect(screen.getByTestId('receipt-sheet')).toBeTruthy(),
    );
    expect(screen.getByText('Comprovante')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Lucas Almeida')).toBeTruthy());
    expect(screen.getByText('Mensal')).toBeTruthy();
    expect(screen.getByText('Pix')).toBeTruthy();
    expect(screen.getByText('08/07')).toBeTruthy();
  });
});
