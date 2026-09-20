/**
 * Aluno ranking (REP.11, spec 013 — aluno-06/07 + home card): the home
 * "Ranking do mês" entry card with the live position from `me`, the full
 * screen with Por aulas / Por eventos segments, position circles, gradient
 * bars, the "você" highlight and the per-segment selos footnote (the
 * professor-06 copy bug fixed — each segment reads its own selo).
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
import { rankingBySearch } from '../helpers/rankings';

jest.useFakeTimers();

const secure = SecureStore as unknown as { __reset: () => void };

function renderAluno(override?: FetchHandler): void {
  installFetchMock((request) => {
    const overridden = override?.(request);
    if (overridden) return overridden;
    if (request.method === 'GET' && request.path === '/v1/aluno/home') {
      return json(200, makeAlunoHome());
    }
    if (request.method === 'GET' && request.path === '/v1/rankings') {
      return json(200, rankingBySearch(request.search));
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
}

async function openRanking(): Promise<void> {
  await waitFor(() => expect(screen.getByTestId('ranking-card')).toBeTruthy());
  await act(async () => {
    fireEvent.press(screen.getByTestId('ranking-card'));
  });
  await waitFor(() =>
    expect(screen.getByTestId('ranking-segments')).toBeTruthy(),
  );
}

describe('aluno ranking (REP.11)', () => {
  beforeEach(() => {
    secure.__reset();
    sessionTestApi.reset();
    queryClient.clear();
  });

  it('home card shows the live position from `me` and opens the full screen', async () => {
    renderAluno();

    await waitFor(() =>
      expect(screen.getByTestId('ranking-card')).toBeTruthy(),
    );
    expect(screen.getByText('Ranking do mês')).toBeTruthy();
    expect(
      screen.getByText('Você está em 2º em presença — continue assim'),
    ).toBeTruthy();

    await openRanking();
    // Full screen header + lessons subtitle "<Mês> · <academia>".
    expect(screen.getAllByText('Ranking do mês').length).toBeGreaterThanOrEqual(
      1,
    );
    expect(screen.getByText('Agosto · Alpha Jiu-Jitsu')).toBeTruthy();
  });

  it('Por aulas renders positions, counts, gradient bars and the você row', async () => {
    renderAluno();
    await openRanking();

    await waitFor(() => expect(screen.getByText('Marina Costa')).toBeTruthy());
    expect(screen.getByText('17 aulas')).toBeTruthy();
    expect(screen.getByText('14 aulas')).toBeTruthy();
    expect(screen.getByText('8 aulas')).toBeTruthy();
    expect(screen.getAllByTestId(/^ranking-row-/)).toHaveLength(7);

    // "você" chip on Lucas's outlined row only.
    expect(screen.getByTestId('ranking-voce-chip')).toBeTruthy();
    expect(screen.getByText('você')).toBeTruthy();

    // Por aulas footnote: Constância, not Espírito de equipe.
    expect(screen.getByText(/12\+ aulas no mês valem o selo/)).toBeTruthy();
    expect(screen.getByText('Constância')).toBeTruthy();
    expect(screen.queryByText('Espírito de equipe')).toBeNull();
  });

  it('Por eventos switches window, counts and the adapted footnote', async () => {
    renderAluno();
    await openRanking();
    await waitFor(() => expect(screen.getByText('Marina Costa')).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByText('Por eventos'));
    });

    await waitFor(() => expect(screen.getByText('João Ferraz')).toBeTruthy());
    expect(
      screen.getByText('Participações em eventos no semestre'),
    ).toBeTruthy();
    expect(screen.getByText('5 eventos')).toBeTruthy();
    // Singular unit on a 1-count row (professor-06 fixture parity).
    expect(screen.getByText('1 evento')).toBeTruthy();
    expect(screen.getByTestId('ranking-voce-chip')).toBeTruthy();

    // Adapted footnote: Espírito de equipe, no Constância line.
    expect(screen.getByText(/Presença em eventos vale o selo/)).toBeTruthy();
    expect(screen.getByText('Espírito de equipe')).toBeTruthy();
    expect(screen.queryByText('Constância')).toBeNull();
  });

  it('hides the home card while the aluno is not ranked (me null)', async () => {
    renderAluno(({ method, path }) =>
      method === 'GET' && path === '/v1/rankings'
        ? json(200, rankingBySearch('', { isMe: false, me: null }))
        : null,
    );

    await waitFor(() => expect(screen.getByText('Open mat')).toBeTruthy());
    expect(screen.queryByTestId('ranking-card')).toBeNull();
  });
});
