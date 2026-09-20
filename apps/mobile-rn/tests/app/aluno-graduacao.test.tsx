/**
 * Aluno Graduação (GRD.16, aluno-09): screen fed by GET /v1/aluno/graduation
 * — belt hero with the drawn BeltBar and the academy-rule progress, the
 * Histórico de evolução timeline (belt/degree, date, professor, observação)
 * with "Ver certificado" on belt promotions (real since REP.12, spec 013 —
 * covered by aluno-certificado.test) — plus the home graduation card now
 * linking here with the real target.
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
import { makeAlunoGraduation } from '../helpers/graduation';

jest.useFakeTimers();

const secure = SecureStore as unknown as { __reset: () => void };

function renderAluno(override?: FetchHandler): void {
  installFetchMock((request) => {
    const overridden = override?.(request);
    if (overridden) return overridden;
    if (request.method === 'GET' && request.path === '/v1/aluno/home') {
      return json(200, makeAlunoHome());
    }
    if (request.method === 'GET' && request.path === '/v1/aluno/graduation') {
      return json(200, makeAlunoGraduation());
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

async function openGraduacao(): Promise<void> {
  await waitFor(() =>
    expect(screen.getByLabelText('Sua graduação')).toBeTruthy(),
  );
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Sua graduação'));
  });
  await waitFor(() => expect(screen.getByText('Faixa atual')).toBeTruthy());
}

describe('aluno Graduação (GRD.16)', () => {
  beforeEach(() => {
    secure.__reset();
    sessionTestApi.reset();
    queryClient.clear();
  });

  it('home graduation card shows the real target and links to the screen', async () => {
    renderAluno();

    await waitFor(() =>
      expect(screen.getByTestId('graduation-card')).toBeTruthy(),
    );
    expect(screen.getByText('26 de 40 aulas · Próximo 3º grau')).toBeTruthy();
    expect(screen.getByTestId('home-belt')).toBeTruthy();
    // graus na faixa tile fed by the derived belt.
    expect(screen.getByTestId('tile-graus')).toBeTruthy();
    expect(screen.getByText('graus na faixa')).toBeTruthy();

    await openGraduacao();
    expect(screen.getByText('Graduação')).toBeTruthy();
  });

  it('renders the belt hero: FAIXA ATUAL, drawn belt and progress bar', async () => {
    renderAluno();
    await openGraduacao();

    expect(screen.getByText('Azul · 2 graus')).toBeTruthy();
    expect(screen.getByTestId('hero-belt')).toBeTruthy();
    expect(
      screen.getAllByTestId('beltbar-stripe').length,
    ).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Próximo 3º grau')).toBeTruthy();
    expect(screen.getByText('26 de 40 aulas')).toBeTruthy();
    expect(screen.getByTestId('hero-progress-bar')).toBeTruthy();
  });

  it('renders the evolution timeline with professor, observação and dates', async () => {
    renderAluno();
    await openGraduacao();

    expect(screen.getByText('Histórico de evolução')).toBeTruthy();
    expect(screen.getByText('Azul · 2º grau')).toBeTruthy();
    expect(screen.getByText('Maio de 2026')).toBeTruthy();
    expect(screen.getByText('Azul · 1º grau')).toBeTruthy();
    expect(screen.getByText('Faixa azul')).toBeTruthy();
    expect(screen.getByText('Faixa branca')).toBeTruthy();
    expect(screen.getAllByText('Prof. Rafael Nunes')).toHaveLength(4);
    expect(
      screen.getByText('“Exame de faixa — aprovado com distinção.”'),
    ).toBeTruthy();
    expect(screen.getByText('“Início da jornada.”')).toBeTruthy();
  });

  it('belt promotions carry the unlocked Ver certificado action (REP.12)', async () => {
    renderAluno();
    await openGraduacao();

    const certificado = screen.getByText('Ver certificado');
    expect(certificado).toBeTruthy();
    // Exactly the certificateAvailable belt entry — degree and initial
    // entries keep no button (certificate view covered by REP.12's suite).
    expect(screen.getAllByText('Ver certificado')).toHaveLength(1);
  });

  it('perfil tab shows the derived belt chip (rank consistent everywhere)', async () => {
    renderAluno();
    await waitFor(() =>
      expect(screen.getByTestId('graduation-card')).toBeTruthy(),
    );

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Perfil'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('perfil-belt-chip')).toBeTruthy(),
    );
    expect(screen.getByText('Faixa azul · 2 graus')).toBeTruthy();

    // Second entry point into the Graduação screen (GRD.16).
    await act(async () => {
      fireEvent.press(screen.getByText('Ver graduação'));
    });
    await waitFor(() => expect(screen.getByText('Faixa atual')).toBeTruthy());
  });
});
