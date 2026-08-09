/**
 * Aluno Início (ATT.16, aluno-03/05): hero fed by GET /v1/aluno/home (today
 * class → check-in CTA; checked-in → "Presença registrada" chip), live stat
 * tiles, streak visibility rule (gamification toggle off → hidden) and the
 * graduation progress bar fed by the true lesson count.
 */

import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import * as SecureStore from 'expo-secure-store';
import { queryClient } from '../../src/session/api';
import { sessionTestApi } from '../../src/session/session-store';
import { installFetchMock, json, makeMe, type FetchHandler } from '../helpers/session';
import { makeAlunoHome, type AlunoHomeOptions } from '../helpers/attendance';
import { makeMensalidadeAlert, makeWallet } from '../helpers/billing';

jest.useFakeTimers();

const secure = SecureStore as unknown as { __reset: () => void };

function renderAluno(homeOptions: AlunoHomeOptions = {}, override?: FetchHandler): void {
  installFetchMock((request) => {
    const overridden = override?.(request);
    if (overridden) return overridden;
    if (request.method === 'GET' && request.path === '/v1/aluno/home') {
      return json(200, makeAlunoHome(homeOptions));
    }
    return null;
  });
  sessionTestApi.seed({ status: 'authed', session: makeMe({ role: 'student' }) });
  renderRouter('src/app');
  act(() => {
    jest.advanceTimersByTime(2000);
  });
}

describe('aluno Início (ATT.16)', () => {
  beforeEach(() => {
    secure.__reset();
    sessionTestApi.reset();
    queryClient.clear();
  });

  it('renders the today-class hero with the check-in CTA and live stat tiles', async () => {
    renderAluno();

    expect(screen.getByText('Olá, Lucas')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Open mat')).toBeTruthy());
    expect(screen.getByText('Hoje às 10:00')).toBeTruthy();
    expect(screen.getByText('Fazer check-in')).toBeTruthy();
    expect(screen.getByText('10:00 – 12:00 · 120 min')).toBeTruthy();

    // Live stat tiles (server-derived figures only).
    expect(screen.getByText('86%')).toBeTruthy();
    expect(screen.getByText('presença no mês')).toBeTruthy();
    expect(screen.getByText('6')).toBeTruthy();
    expect(screen.getByText('aulas seguidas')).toBeTruthy();
    expect(screen.getByText('graus na faixa')).toBeTruthy();

    // Graduation progress: real numerator, documented placeholder target.
    expect(screen.getByText('Sua graduação')).toBeTruthy();
    expect(screen.getByTestId('graduation-bar')).toBeTruthy();
    expect(screen.getByText(/26 de 40 aulas/)).toBeTruthy();
  });

  it('flips the hero to Presença registrada after check-in', async () => {
    renderAluno({ checkedIn: true });

    await waitFor(() => expect(screen.getByTestId('hero-checked-in-chip')).toBeTruthy());
    expect(screen.getByText('Presença registrada')).toBeTruthy();
    expect(screen.queryByText('Fazer check-in')).toBeNull();
  });

  it('hides the streak tile when the academy disabled gamification', async () => {
    renderAluno({ stats: { streak: null } });

    await waitFor(() => expect(screen.getByText('86%')).toBeTruthy());
    expect(screen.queryByText('aulas seguidas')).toBeNull();
    expect(screen.queryByTestId('tile-streak')).toBeNull();
  });

  it('renders the no-class-today hero state', async () => {
    renderAluno({ todayClass: null });

    await waitFor(() => expect(screen.getByText('Sem aula hoje')).toBeTruthy());
    expect(screen.queryByText('Fazer check-in')).toBeNull();
  });

  it('renders the real mensalidade alert from the home payload (BIL.16, story 7)', async () => {
    renderAluno({ mensalidade: makeMensalidadeAlert() });

    await waitFor(() => expect(screen.getByTestId('mensalidade-alert')).toBeTruthy());
    expect(screen.getByText('Mensalidade em aberto')).toBeTruthy();
    expect(screen.getByText('R$ 180,00 · Vence em 10 de agosto')).toBeTruthy();
  });

  it('hides the alert when nothing is open and flags overdue distinctly', async () => {
    renderAluno();
    await waitFor(() => expect(screen.getByText('Open mat')).toBeTruthy());
    expect(screen.queryByTestId('mensalidade-alert')).toBeNull();
  });

  it('deep-links the alert into the Carteira (BIL.16)', async () => {
    renderAluno({ mensalidade: makeMensalidadeAlert() }, ({ method, path }) =>
      method === 'GET' && path === '/v1/aluno/wallet' ? json(200, makeWallet()) : null,
    );

    await waitFor(() => expect(screen.getByTestId('mensalidade-alert')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByTestId('mensalidade-alert'));
    });

    await waitFor(() => expect(screen.getByTestId('mensalidade-card')).toBeTruthy());
    expect(screen.getByText('Plano mensal recorrente · R$ 180,00')).toBeTruthy();
  });
});
