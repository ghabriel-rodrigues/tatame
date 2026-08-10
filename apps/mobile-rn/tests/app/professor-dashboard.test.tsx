/**
 * Professor dashboard (ATT.18, professor-02): live tiles from
 * GET /v1/professor/dashboard, next-class hero with the checked-in count
 * and "Iniciar chamada" jumping straight into the ATT.17 live screen.
 * EVT.11 (spec 008 story 22): the real "eventos futuros" tile and the
 * read-only "Eventos futuros" list.
 */

import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import * as SecureStore from 'expo-secure-store';
import { queryClient } from '../../src/session/api';
import { sessionTestApi } from '../../src/session/session-store';
import { installFetchMock, json, makeMe, type FetchHandler } from '../helpers/session';
import {
  OPEN_MAT_CLASS_ID,
  makeDashboard,
  makeLiveCode,
  makeSnapshot,
  LIVE_CODE_ID,
} from '../helpers/attendance';
import {
  FESTIVAL_EVENT_ID,
  OPEN_MAT_EVENT_ID,
  makeProfessorUpcomingEvent,
} from '../helpers/events';

jest.mock('../../src/features/attendance/sse', () => ({
  connectLiveStream: jest.fn(() => ({ close: jest.fn() })),
}));

jest.useFakeTimers();

const secure = SecureStore as unknown as { __reset: () => void };

function renderProfessor(override?: FetchHandler): void {
  installFetchMock((request) => {
    const overridden = override?.(request);
    if (overridden) return overridden;
    const { method, path } = request;
    if (method === 'GET' && path === '/v1/professor/dashboard') {
      return json(200, makeDashboard());
    }
    if (method === 'POST' && path === `/v1/professor/classes/${OPEN_MAT_CLASS_ID}/live-codes`) {
      return json(200, makeLiveCode());
    }
    if (method === 'GET' && path === `/v1/professor/live-codes/${LIVE_CODE_ID}/attendances`) {
      return json(200, makeSnapshot([]));
    }
    if (method === 'POST' && path === `/v1/professor/live-codes/${LIVE_CODE_ID}/stream-ticket`) {
      return json(200, { ticket: 'ticket-1', expiresInSeconds: 60 });
    }
    return null;
  });
  sessionTestApi.seed({
    status: 'authed',
    session: makeMe({ role: 'professor', fullName: 'Rafa Mendes' }),
  });
  renderRouter('src/app');
  act(() => {
    jest.advanceTimersByTime(2000);
  });
}

describe('professor dashboard (ATT.18)', () => {
  beforeEach(() => {
    secure.__reset();
    sessionTestApi.reset();
    queryClient.clear();
  });

  it('renders the live tiles and the next-class hero with the check-in count', async () => {
    renderProfessor();

    await waitFor(() => expect(screen.getByText('23')).toBeTruthy());
    expect(screen.getByText('alunos hoje')).toBeTruthy();
    expect(screen.getByText('81%')).toBeTruthy();
    expect(screen.getByText('presença média')).toBeTruthy();
    // Real eventos-futuros count (EVT.11); zero without upcoming events.
    expect(screen.getByText('eventos futuros')).toBeTruthy();
    expect(screen.getByTestId('tile-eventos')).toBeTruthy();

    expect(screen.getByText('Próxima aula · hoje 10:00')).toBeTruthy();
    expect(screen.getByText('Open mat')).toBeTruthy();
    expect(screen.getByText('18 confirmados')).toBeTruthy();
    // No list section when the academy has no upcoming events.
    expect(screen.queryByText('Eventos futuros')).toBeNull();
  });

  it('renders the real eventos-futuros tile and read-only list (EVT.11, story 22)', async () => {
    renderProfessor(({ method, path }) =>
      method === 'GET' && path === '/v1/professor/dashboard'
        ? json(
            200,
            makeDashboard({
              upcomingEventsCount: 2,
              upcomingEvents: [
                makeProfessorUpcomingEvent(),
                makeProfessorUpcomingEvent({
                  id: FESTIVAL_EVENT_ID,
                  name: 'Festival Kids',
                  date: '2026-09-13',
                  time: '09:30',
                  priceCents: 6_000,
                  confirmedCount: 4,
                }),
              ],
            }),
          )
        : null,
    );

    await waitFor(() => expect(screen.getByText('2')).toBeTruthy());
    expect(screen.getByText('eventos futuros')).toBeTruthy();

    // The list: date square, name, "N confirmados · gratuito/R$ X".
    await waitFor(() => expect(screen.getByText('Eventos futuros')).toBeTruthy());
    expect(screen.getByTestId(`professor-event-${OPEN_MAT_EVENT_ID}`)).toBeTruthy();
    expect(screen.getByText('Open mat de verão')).toBeTruthy();
    expect(screen.getByText('Sábado, 15 de agosto · 10:00')).toBeTruthy();
    expect(screen.getByText('32 confirmados · gratuito')).toBeTruthy();
    expect(screen.getByText('Festival Kids')).toBeTruthy();
    expect(screen.getByText('4 confirmados · R$ 60,00')).toBeTruthy();
    expect(screen.getByText('AGO')).toBeTruthy();
    expect(screen.getByText('SET')).toBeTruthy();
  });

  it('renders the empty hero when there is no next class today', async () => {
    renderProfessor(({ method, path }) =>
      method === 'GET' && path === '/v1/professor/dashboard'
        ? json(200, makeDashboard({ nextClass: null }))
        : null,
    );

    await waitFor(() => expect(screen.getByText('Sem próxima aula hoje')).toBeTruthy());
    expect(screen.queryByText('Iniciar chamada')).toBeNull();
  });

  it('Iniciar chamada opens the live chamada for the next class', async () => {
    renderProfessor();

    await waitFor(() => expect(screen.getByText('Iniciar chamada')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByText('Iniciar chamada'));
    });

    await waitFor(() =>
      expect(screen.getByText('Chamada aberta · Open mat')).toBeTruthy(),
    );
    expect(screen.getByTestId('live-code-digits')).toBeTruthy();
  });
});
