/**
 * Professor dashboard (ATT.18, professor-02): live tiles from
 * GET /v1/professor/dashboard, next-class hero with the checked-in count
 * and "Iniciar chamada" jumping straight into the ATT.17 live screen.
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
    // Eventos stays an honest placeholder (its slice has not shipped).
    expect(screen.getByText('eventos futuros')).toBeTruthy();

    expect(screen.getByText('Próxima aula · hoje 10:00')).toBeTruthy();
    expect(screen.getByText('Open mat')).toBeTruthy();
    expect(screen.getByText('18 confirmados')).toBeTruthy();
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
