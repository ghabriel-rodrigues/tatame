/**
 * Responsável Eventos tab (EVT.11, responsavel-06 + spec 008 stories
 * 18-21): gradient cards with the valor pill and one chip per dependent;
 * the free toggle (tap confirms → check, tap again cancels); the paid
 * per-dependent Pix sheet addressed to the child and billed to the
 * guardian; the pending resume/long-press-cancel affordances; and sibling
 * state independence.
 */

import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import * as SecureStore from 'expo-secure-store';
import { queryClient } from '../../src/session/api';
import { sessionTestApi } from '../../src/session/session-store';
import { installFetchMock, json, makeMe, type FetchHandler } from '../helpers/session';
import { makeDependents } from '../helpers/enrollment';
import { JULIA_ID, PEDRO_ID, makePixPayment } from '../helpers/billing';
import {
  EVENT_CHARGE_ID,
  FESTIVAL_EVENT_ID,
  OPEN_MAT_EVENT_ID,
  makeDependent,
  makePendingRegistration,
  makeRegistration,
  makeResponsavelEvent,
  makeResponsavelEvents,
} from '../helpers/events';
import type { ResponsavelEvent } from '../../src/features/events/types';

jest.useFakeTimers();

const secure = SecureStore as unknown as { __reset: () => void };

interface GuardianEventsLog {
  registers: string[];
  cancels: string[];
  paymentPaths: string[];
  simulated: string[];
  listGets: number;
}

/**
 * Stateful mock: per-dependent registration state mutates the served list
 * the way the API would — settlement/cancel land via refetch.
 */
function renderEventos(
  initialEvents?: ResponsavelEvent[],
  override?: FetchHandler,
): GuardianEventsLog {
  const log: GuardianEventsLog = {
    registers: [],
    cancels: [],
    paymentPaths: [],
    simulated: [],
    listGets: 0,
  };
  let events = makeResponsavelEvents(initialEvents).events;

  const setRegistration = (
    eventId: string,
    studentId: string,
    registration: ReturnType<typeof makeRegistration> | null,
  ) => {
    events = events.map((event) =>
      event.id === eventId
        ? {
            ...event,
            dependents: event.dependents.map((dependent) =>
              dependent.studentId === studentId ? { ...dependent, registration } : dependent,
            ),
          }
        : event,
    );
  };

  installFetchMock((request) => {
    const overridden = override?.(request);
    if (overridden) return overridden;
    if (request.method === 'GET' && request.path === '/v1/responsavel/dependents') {
      return json(200, { dependents: makeDependents() });
    }
    if (request.method === 'GET' && request.path === '/v1/responsavel/events') {
      log.listGets += 1;
      return json(200, { events });
    }
    const registrationMatch = /^\/v1\/responsavel\/events\/([0-9a-f-]+)\/registrations\/([0-9a-f-]+)$/.exec(
      request.path,
    );
    if (registrationMatch) {
      const [, eventId = '', studentId = ''] = registrationMatch;
      const event = events.find((candidate) => candidate.id === eventId);
      if (request.method === 'POST') {
        log.registers.push(`${eventId}:${studentId}`);
        if (event?.priceCents == null) {
          const registration = makeRegistration();
          setRegistration(eventId, studentId, registration);
          return json(201, { registration, chargeId: null });
        }
        const registration = makePendingRegistration();
        setRegistration(eventId, studentId, registration);
        return json(201, { registration, chargeId: EVENT_CHARGE_ID });
      }
      if (request.method === 'DELETE') {
        log.cancels.push(`${eventId}:${studentId}`);
        setRegistration(eventId, studentId, makeRegistration({ status: 'canceled' }));
        return new Response(null, { status: 204 });
      }
    }
    if (
      request.method === 'POST' &&
      request.path === `/v1/responsavel/payments/charges/${EVENT_CHARGE_ID}/payments`
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
      // Whichever dependent is pending on the paid event settles.
      for (const event of events) {
        for (const dependent of event.dependents) {
          if (dependent.registration?.status === 'pending_payment') {
            setRegistration(event.id, dependent.studentId, makeRegistration());
          }
        }
      }
      return json(200, { payment: makePixPayment({ status: 'succeeded' }), charge: null });
    }
    if (request.method === 'GET' && request.path === '/v1/responsavel/payments') {
      return json(200, { dependents: [], history: [] });
    }
    return null;
  });
  sessionTestApi.seed({ status: 'authed', session: makeMe({ role: 'guardian' }) });
  renderRouter('src/app');
  act(() => {
    jest.advanceTimersByTime(2000);
  });
  return log;
}

async function openEventosTab(): Promise<void> {
  await waitFor(() => expect(screen.getByLabelText('Eventos')).toBeTruthy());
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Eventos'));
  });
  await waitFor(() =>
    expect(screen.getByText('Confirme a participação por dependente')).toBeTruthy(),
  );
}

describe('responsável Eventos (EVT.11)', () => {
  beforeEach(() => {
    secure.__reset();
    sessionTestApi.reset();
    queryClient.clear();
  });

  it('renders the responsavel-06 cards: valor pill, date·local line, one chip per dependent', async () => {
    renderEventos();
    await openEventosTab();

    await waitFor(() =>
      expect(screen.getByTestId(`responsavel-event-${FESTIVAL_EVENT_ID}`)).toBeTruthy(),
    );
    expect(screen.getByText('Festival Kids')).toBeTruthy();
    expect(screen.getByText('R$ 60,00')).toBeTruthy();
    expect(screen.getByText('Dom, 13 de setembro · 09:30 · Ginásio Municipal')).toBeTruthy();
    expect(screen.getByText('Open mat de verão')).toBeTruthy();
    expect(screen.getByText('Gratuito')).toBeTruthy();
    expect(screen.getByText('Sáb, 15 de agosto · 10:00 · Tatame principal')).toBeTruthy();
    // One chip per dependent on each card (story 18).
    expect(screen.getByTestId(`dependent-chip-${FESTIVAL_EVENT_ID}-${PEDRO_ID}`)).toBeTruthy();
    expect(screen.getByTestId(`dependent-chip-${FESTIVAL_EVENT_ID}-${JULIA_ID}`)).toBeTruthy();
    expect(screen.getByTestId(`dependent-chip-${OPEN_MAT_EVENT_ID}-${PEDRO_ID}`)).toBeTruthy();
    expect(screen.getByTestId(`dependent-chip-${OPEN_MAT_EVENT_ID}-${JULIA_ID}`)).toBeTruthy();
  });

  it('free toggle: tap confirms the child (check), tap again cancels (story 19)', async () => {
    const log = renderEventos();
    await openEventosTab();

    const chipId = `dependent-chip-${OPEN_MAT_EVENT_ID}-${PEDRO_ID}`;
    await waitFor(() => expect(screen.getByTestId(chipId)).toBeTruthy());
    expect(screen.queryByTestId(`${chipId}-check`)).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByTestId(chipId));
    });

    await waitFor(() => expect(log.registers).toEqual([`${OPEN_MAT_EVENT_ID}:${PEDRO_ID}`]));
    await waitFor(() => expect(log.listGets).toBeGreaterThan(1));
    await waitFor(() => expect(screen.getByTestId(`${chipId}-check`)).toBeTruthy());
    // Sibling untouched (story 21): Pedro confirmed never implies Júlia.
    expect(
      screen.queryByTestId(`dependent-chip-${OPEN_MAT_EVENT_ID}-${JULIA_ID}-check`),
    ).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByTestId(chipId));
    });

    await waitFor(() => expect(screen.queryByTestId(`${chipId}-check`)).toBeNull());
    expect(log.cancels).toEqual([`${OPEN_MAT_EVENT_ID}:${PEDRO_ID}`]);
  });

  it('paid chip opens the Pix sheet addressed to the child; simulate confirms (story 20)', async () => {
    const log = renderEventos();
    await openEventosTab();

    const chipId = `dependent-chip-${FESTIVAL_EVENT_ID}-${PEDRO_ID}`;
    await waitFor(() => expect(screen.getByTestId(chipId)).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByTestId(chipId));
    });

    // Registration + guardian-billed charge → the guardian Pix rails.
    await waitFor(() => expect(screen.getByTestId('pix-sheet')).toBeTruthy());
    expect(log.registers).toEqual([`${FESTIVAL_EVENT_ID}:${PEDRO_ID}`]);
    expect(log.paymentPaths).toHaveLength(1);
    // Addressed to the child (story 18/20 subtitle pattern).
    expect(screen.getByText('Inscrição · Festival Kids · Pedro')).toBeTruthy();

    await waitFor(() => expect(screen.getByText('Simular pagamento')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByText('Simular pagamento'));
    });

    await waitFor(() => expect(screen.getByText('A inscrição foi confirmada.')).toBeTruthy());
    expect(log.simulated).toHaveLength(1);
    await act(async () => {
      fireEvent.press(screen.getByText('Fechar'));
    });

    // Settlement lands via refetch: the chip gains the check.
    await waitFor(() => expect(screen.getByTestId(`${chipId}-check`)).toBeTruthy());
  });

  it('pending chip: tap resumes the SAME charge, long-press cancels (documented UX)', async () => {
    const log = renderEventos([
      makeResponsavelEvent({
        id: FESTIVAL_EVENT_ID,
        name: 'Festival Kids',
        priceCents: 6_000,
        dependents: [
          makeDependent({ registration: makePendingRegistration() }),
          makeDependent({ studentId: JULIA_ID, fullName: 'Júlia Silveira' }),
        ],
      }),
    ]);
    await openEventosTab();

    const chipId = `dependent-chip-${FESTIVAL_EVENT_ID}-${PEDRO_ID}`;
    await waitFor(() => expect(screen.getByTestId(chipId)).toBeTruthy());

    // Tap: reopen the Pix sheet on the open charge — no new registration.
    await act(async () => {
      fireEvent.press(screen.getByTestId(chipId));
    });
    await waitFor(() => expect(screen.getByTestId('pix-sheet')).toBeTruthy());
    expect(log.registers).toHaveLength(0);
    expect(log.paymentPaths).toHaveLength(1);

    // Close the sheet, then long-press cancels the pending registration.
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Fechar'));
    });
    await act(async () => {
      fireEvent(screen.getByTestId(chipId), 'longPress');
    });

    await waitFor(() => expect(log.cancels).toEqual([`${FESTIVAL_EVENT_ID}:${PEDRO_ID}`]));
  });

  it('renders the empty state when no events are published', async () => {
    renderEventos([]);
    await openEventosTab();

    await waitFor(() => expect(screen.getByTestId('responsavel-events-empty')).toBeTruthy());
    expect(screen.getByText('Nenhum evento por enquanto')).toBeTruthy();
  });
});
