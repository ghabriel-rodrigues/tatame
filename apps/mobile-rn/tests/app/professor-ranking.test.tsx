/**
 * Professor ranking (REP.11, spec 013 — professor-02 section +
 * professor-05/06 screen): the dashboard "Ranking de presença" section with
 * the month's real top 3 and "Ver todos" opening the shared full screen —
 * academy-wide, both segments, no "você" highlight (professors are not
 * ranked; isMe is server-false).
 */

import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import * as SecureStore from 'expo-secure-store';
import { queryClient } from '../../src/session/api';
import { sessionTestApi } from '../../src/session/session-store';
import { installFetchMock, json, makeMe, type FetchHandler } from '../helpers/session';
import { makeDashboard } from '../helpers/attendance';
import { rankingBySearch } from '../helpers/rankings';

jest.useFakeTimers();

const secure = SecureStore as unknown as { __reset: () => void };

function renderProfessor(override?: FetchHandler): void {
  installFetchMock((request) => {
    const overridden = override?.(request);
    if (overridden) return overridden;
    if (request.method === 'GET' && request.path === '/v1/professor/dashboard') {
      return json(200, makeDashboard());
    }
    if (request.method === 'GET' && request.path === '/v1/rankings') {
      return json(200, rankingBySearch(request.search, { isMe: false, me: null }));
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

describe('professor ranking (REP.11)', () => {
  beforeEach(() => {
    secure.__reset();
    sessionTestApi.reset();
    queryClient.clear();
  });

  it('dashboard section shows the real top 3 with the month title', async () => {
    renderProfessor();

    await waitFor(() => expect(screen.getByTestId('ranking-section')).toBeTruthy());
    expect(screen.getByText('Ranking de presença · agosto')).toBeTruthy();

    // Top 3 preview only (professor-02): Marina, Lucas, Júlia.
    expect(screen.getByText('Marina Costa')).toBeTruthy();
    expect(screen.getByText('17 aulas')).toBeTruthy();
    expect(screen.getByText('Lucas Almeida')).toBeTruthy();
    expect(screen.getByText('Júlia Silveira')).toBeTruthy();
    expect(screen.queryByText('Pedro Silveira')).toBeNull();
    expect(screen.getByTestId('dashboard-ranking-1')).toBeTruthy();
    expect(screen.queryByTestId('dashboard-ranking-4')).toBeNull();
  });

  it('Ver todos opens the full screen with both segments and no você chip', async () => {
    renderProfessor();

    await waitFor(() => expect(screen.getByText('Ver todos')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByText('Ver todos'));
    });

    await waitFor(() => expect(screen.getByTestId('ranking-segments')).toBeTruthy());
    expect(screen.getByText('Ranking de presença')).toBeTruthy();
    expect(screen.getByText('Agosto · Alpha Jiu-Jitsu')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Pedro Silveira')).toBeTruthy());
    // Professors are never ranked — no você highlight anywhere.
    expect(screen.queryByTestId('ranking-voce-chip')).toBeNull();

    // Por eventos segment works professor-side too (professor-06).
    await act(async () => {
      fireEvent.press(screen.getByText('Por eventos'));
    });
    await waitFor(() =>
      expect(screen.getByText('Participações em eventos no semestre')).toBeTruthy(),
    );
    expect(screen.getByText('5 eventos')).toBeTruthy();
    expect(screen.getByText('Espírito de equipe')).toBeTruthy();
  });

  it('hides the section when the ranking is empty', async () => {
    renderProfessor(({ method, path }) =>
      method === 'GET' && path === '/v1/rankings'
        ? json(200, {
            by: 'lessons',
            window: { label: '2026-08', start: '2026-08-01', endExclusive: '2026-09-01' },
            top: [],
            me: null,
            totalRanked: 0,
          })
        : null,
    );

    await waitFor(() => expect(screen.getByText('alunos hoje')).toBeTruthy());
    expect(screen.queryByTestId('ranking-section')).toBeNull();
  });
});
