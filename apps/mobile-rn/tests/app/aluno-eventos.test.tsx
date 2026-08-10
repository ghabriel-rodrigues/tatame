/**
 * Aluno events (EVT.10, aluno-10 + spec 008): home "Próximos eventos" cards
 * pushing the detail; the detail anatomy (banner pill, info rows,
 * description); the free flow (Confirmar presença → confirmed banner +
 * Cancelar participação → back to confirm); the paid flow ("Pagar
 * inscrição · R$ X" → registration + charge → Pix sheet with simulate
 * gating → confirmed on settle); the pending retry riding the same charge;
 * and the settled-cancel 409 mapped to PT-BR.
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
import { makeAlunoHome } from '../helpers/attendance';
import { makePixPayment } from '../helpers/billing';
import {
  EVENT_CHARGE_ID,
  FESTIVAL_EVENT_ID,
  OPEN_MAT_EVENT_ID,
  makeAlunoEventDetail,
  makeAlunoEventItem,
  makePaidEventItem,
  makePendingRegistration,
  makeRegistration,
} from '../helpers/events';
import type { AlunoEventDetail } from '../../src/features/events/types';

jest.useFakeTimers();

const secure = SecureStore as unknown as { __reset: () => void };

interface EventsLog {
  registers: string[];
  cancels: string[];
  paymentPaths: string[];
  simulated: string[];
}

/**
 * Stateful mock: registering/canceling mutates the served detail the way
 * the API would, so settlement/cancel land via refetch like production.
 */
function renderAlunoEvents(
  initialDetail: AlunoEventDetail,
  options: { cancelResponse?: Response } = {},
  override?: FetchHandler,
): EventsLog {
  const log: EventsLog = { registers: [], cancels: [], paymentPaths: [], simulated: [] };
  let detail = initialDetail;
  installFetchMock((request) => {
    const overridden = override?.(request);
    if (overridden) return overridden;
    if (request.method === 'GET' && request.path === '/v1/aluno/home') {
      const cards = [
        {
          ...makeAlunoEventItem(),
          id: detail.id,
          name: detail.name,
          priceCents: detail.priceCents,
          registration: detail.registration,
        },
      ];
      // Second card only when it does not collide with the detail under test.
      if (detail.id !== FESTIVAL_EVENT_ID && detail.name !== 'Festival Kids') {
        cards.push(makePaidEventItem());
      }
      return json(200, makeAlunoHome({ upcomingEvents: cards }));
    }
    if (request.method === 'GET' && request.path === `/v1/aluno/events/${detail.id}`) {
      return json(200, detail);
    }
    if (
      request.method === 'POST' &&
      request.path === `/v1/aluno/events/${detail.id}/registration`
    ) {
      log.registers.push(request.path);
      if (detail.priceCents == null) {
        detail = { ...detail, registration: makeRegistration() };
        return json(201, { registration: detail.registration, chargeId: null });
      }
      detail = { ...detail, registration: makePendingRegistration() };
      return json(201, { registration: detail.registration, chargeId: EVENT_CHARGE_ID });
    }
    if (
      request.method === 'DELETE' &&
      request.path === `/v1/aluno/events/${detail.id}/registration`
    ) {
      log.cancels.push(request.path);
      if (options.cancelResponse) return options.cancelResponse;
      detail = { ...detail, registration: makeRegistration({ status: 'canceled' }) };
      return new Response(null, { status: 204 });
    }
    if (
      request.method === 'POST' &&
      request.path === `/v1/aluno/wallet/charges/${EVENT_CHARGE_ID}/payments`
    ) {
      log.paymentPaths.push(request.path);
      return json(201, {
        payment: makePixPayment({ chargeId: EVENT_CHARGE_ID, amountCents: 6_000 }),
        charge: null,
        mandateCreated: false,
      });
    }
    const simulateMatch = /^\/v1\/billing\/payments\/([0-9a-f-]+)\/simulate$/.exec(
      request.path,
    );
    if (request.method === 'POST' && simulateMatch) {
      log.simulated.push(simulateMatch[1] ?? '');
      detail = { ...detail, registration: makeRegistration() };
      return json(200, { payment: makePixPayment({ status: 'succeeded' }), charge: null });
    }
    if (request.method === 'GET' && request.path === '/v1/aluno/agenda') {
      return json(200, { weekday: 1, isToday: true, classes: [], events: [] });
    }
    if (request.method === 'GET' && request.path === '/v1/aluno/calendar') {
      return json(200, { month: '2026-08', classesByWeekday: { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] }, events: [] });
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

async function openDetailFromHome(eventName: string): Promise<void> {
  await waitFor(() => expect(screen.getByText('Próximos eventos')).toBeTruthy());
  await act(async () => {
    fireEvent.press(screen.getByLabelText(eventName));
  });
  await waitFor(() => expect(screen.getByTestId('event-info-card')).toBeTruthy());
}

describe('aluno events (EVT.10)', () => {
  beforeEach(() => {
    secure.__reset();
    sessionTestApi.reset();
    queryClient.clear();
  });

  it('home lists Próximos eventos with state/valor chips and pushes the detail', async () => {
    renderAlunoEvents(makeAlunoEventDetail());

    await waitFor(() => expect(screen.getByText('Próximos eventos')).toBeTruthy());
    expect(screen.getByTestId(`home-event-${OPEN_MAT_EVENT_ID}`)).toBeTruthy();
    expect(screen.getByText('Gratuito')).toBeTruthy();
    expect(screen.getByText('Festival Kids')).toBeTruthy();
    expect(screen.getByText('R$ 60,00')).toBeTruthy();
    // Date squares (aluno-11 "15 / AGO").
    expect(screen.getByText('AGO')).toBeTruthy();
    expect(screen.getByText('SET')).toBeTruthy();

    await openDetailFromHome('Open mat de verão');
    // Home card + detail info row both render the PT-BR date line.
    expect(screen.getAllByText('Sábado, 15 de agosto · 10:00').length).toBeGreaterThan(0);
  });

  it('renders the aluno-10 detail anatomy for a free event', async () => {
    renderAlunoEvents(makeAlunoEventDetail());
    await openDetailFromHome('Open mat de verão');

    expect(screen.getByTestId('event-banner')).toBeTruthy();
    // Gratuito pill on the banner + info rows + description.
    expect(screen.getAllByText('Gratuito').length).toBeGreaterThan(0);
    expect(screen.getByText('Tatame principal · Horizonte BJJ Centro')).toBeTruthy();
    expect(screen.getByText('Responsável: Prof. Rafael Nunes')).toBeTruthy();
    expect(
      screen.getByText(
        'Treino aberto para todas as faixas, com academias convidadas da região.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Confirmar presença')).toBeTruthy();
    expect(screen.queryByTestId('confirmed-banner')).toBeNull();
  });

  it('free flow: Confirmar presença → confirmed banner, then Cancelar participação undoes it', async () => {
    const log = renderAlunoEvents(makeAlunoEventDetail());
    await openDetailFromHome('Open mat de verão');

    await act(async () => {
      fireEvent.press(screen.getByText('Confirmar presença'));
    });

    await waitFor(() => expect(screen.getByTestId('confirmed-banner')).toBeTruthy());
    expect(screen.getByText('Presença confirmada — até lá!')).toBeTruthy();
    expect(screen.queryByText('Confirmar presença')).toBeNull();
    expect(log.registers).toHaveLength(1);

    // Free cancel (story 15).
    await act(async () => {
      fireEvent.press(screen.getByText('Cancelar participação'));
    });

    await waitFor(() => expect(screen.getByText('Confirmar presença')).toBeTruthy());
    expect(screen.queryByTestId('confirmed-banner')).toBeNull();
    expect(log.cancels).toHaveLength(1);
  });

  it('paid flow: Pagar inscrição opens the Pix sheet; simulate settles and confirms', async () => {
    const log = renderAlunoEvents(
      makeAlunoEventDetail({ name: 'Festival Kids', priceCents: 6_000 }),
    );
    await openDetailFromHome('Festival Kids');

    // Spec 008 fixed copy with the amount.
    await waitFor(() =>
      expect(screen.getByText('Pagar inscrição · R$ 60,00')).toBeTruthy(),
    );
    await act(async () => {
      fireEvent.press(screen.getByText('Pagar inscrição · R$ 60,00'));
    });

    // Registration + event-origin charge → the existing Pix rails.
    await waitFor(() => expect(screen.getByTestId('pix-sheet')).toBeTruthy());
    expect(log.registers).toHaveLength(1);
    expect(log.paymentPaths).toHaveLength(1);
    expect(screen.getByText('Inscrição · Festival Kids')).toBeTruthy();

    // Simulated provider → the simulate affordance (story 44 gating).
    await waitFor(() => expect(screen.getByText('Simular pagamento')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByText('Simular pagamento'));
    });

    await waitFor(() => expect(screen.getByText('Sua inscrição foi confirmada.')).toBeTruthy());
    expect(log.simulated).toHaveLength(1);
    await act(async () => {
      fireEvent.press(screen.getByText('Fechar'));
    });

    // Settlement lands via refetch, never optimistically.
    await waitFor(() => expect(screen.getByTestId('confirmed-banner')).toBeTruthy());
    expect(screen.getByText('Presença confirmada — até lá!')).toBeTruthy();
  });

  it('pending registration shows the retry riding the SAME charge, plus cancel', async () => {
    const log = renderAlunoEvents(
      makeAlunoEventDetail({
        name: 'Festival Kids',
        priceCents: 6_000,
        registration: makePendingRegistration(),
      }),
    );
    await openDetailFromHome('Festival Kids');

    await waitFor(() => expect(screen.getByTestId('pending-notice')).toBeTruthy());
    // Home card chip + detail notice both carry the pending copy.
    expect(screen.getAllByText('Pagamento pendente').length).toBeGreaterThan(0);

    await act(async () => {
      fireEvent.press(screen.getByText('Pagar inscrição · R$ 60,00'));
    });

    // Retry pays the open charge — no second registration POST.
    await waitFor(() => expect(screen.getByTestId('pix-sheet')).toBeTruthy());
    expect(log.registers).toHaveLength(0);
    expect(log.paymentPaths).toHaveLength(1);

    // Not-yet-paid registrations stay cancelable (story 15).
    expect(screen.getByText('Cancelar participação')).toBeTruthy();
  });

  it('hides self-cancel on a settled paid inscription (admin refund only)', async () => {
    renderAlunoEvents(
      makeAlunoEventDetail({
        name: 'Festival Kids',
        priceCents: 6_000,
        registration: makeRegistration(),
      }),
    );
    await openDetailFromHome('Festival Kids');

    await waitFor(() => expect(screen.getByTestId('confirmed-banner')).toBeTruthy());
    // A settled inscription is undone only by the admin refund.
    expect(screen.queryByText('Cancelar participação')).toBeNull();
    expect(screen.queryByText(/Pagar inscrição/)).toBeNull();
  });

  it('maps the settled-cancel 409 problem to the PT-BR message', async () => {
    renderAlunoEvents(makeAlunoEventDetail({ registration: makeRegistration() }), {
      cancelResponse: problem(409, 'event.registration_settled'),
    });
    await openDetailFromHome('Open mat de verão');

    await waitFor(() => expect(screen.getByText('Cancelar participação')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByText('Cancelar participação'));
    });

    await waitFor(() =>
      expect(
        screen.getByText('Inscrição paga só pode ser cancelada pela academia.'),
      ).toBeTruthy(),
    );
  });
});
