/**
 * Professor perfil (GRD.17, professor-12): own belt chip ("Faixa preta ·
 * 2º dan", display-only membership rank) and the "Graduações válidas" card
 * — the merged régua as belt chips with disabled kids belts dimmed — fed
 * by GET /v1/professor/profile.
 */

import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import * as SecureStore from 'expo-secure-store';
import { queryClient } from '../../src/session/api';
import { sessionTestApi } from '../../src/session/session-store';
import { installFetchMock, json, makeMe, type FetchHandler } from '../helpers/session';
import { BELT_IDS, makeProfessorProfile } from '../helpers/graduation';

jest.useFakeTimers();

const secure = SecureStore as unknown as { __reset: () => void };

function renderPerfil(override?: FetchHandler): void {
  installFetchMock((request) => {
    const overridden = override?.(request);
    if (overridden) return overridden;
    if (request.method === 'GET' && request.path === '/v1/professor/profile') {
      return json(200, makeProfessorProfile());
    }
    if (request.method === 'GET' && request.path === '/v1/professor/dashboard') {
      return json(200, {
        alunosHoje: 0,
        presencaMediaPct: 0,
        nextClass: null,
        todayClasses: [],
      });
    }
    return null;
  });
  sessionTestApi.seed({
    status: 'authed',
    session: makeMe({ role: 'professor', fullName: 'Rafael Nunes' }),
  });
  renderRouter('src/app');
  act(() => {
    jest.advanceTimersByTime(2000);
  });
}

async function openPerfil(): Promise<void> {
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Perfil'));
  });
  await waitFor(() => expect(screen.getByText('Sair')).toBeTruthy());
}

describe('professor perfil (GRD.17)', () => {
  beforeEach(() => {
    secure.__reset();
    sessionTestApi.reset();
    queryClient.clear();
  });

  it('shows the own belt chip with the dan rank', async () => {
    renderPerfil();
    await openPerfil();

    await waitFor(() => expect(screen.getByTestId('perfil-belt-chip')).toBeTruthy());
    expect(screen.getByText('Faixa preta · 2º dan')).toBeTruthy();
  });

  it('renders the Graduações válidas régua with dimmed disabled kids belts', async () => {
    renderPerfil();
    await openPerfil();

    await waitFor(() => expect(screen.getByText('Graduações válidas')).toBeTruthy());
    for (const name of ['Branca', 'Cinza', 'Amarela', 'Laranja', 'Verde', 'Azul', 'Roxa', 'Marrom', 'Preta', 'Vermelha']) {
      expect(screen.getByText(name)).toBeTruthy();
    }
    // Laranja is disabled in the fixture → dimmed chip.
    const laranja = screen.getByTestId(`valid-belt-${BELT_IDS.laranja}`);
    expect(JSON.stringify(laranja.props.style)).toContain('"opacity":0.45');
    const azul = screen.getByTestId(`valid-belt-${BELT_IDS.azul}`);
    expect(JSON.stringify(azul.props.style)).toContain('"opacity":1');
  });

  it('omits the belt chip when the membership has no display rank', async () => {
    renderPerfil(({ method, path }) =>
      method === 'GET' && path === '/v1/professor/profile'
        ? json(200, makeProfessorProfile({ belt: null }))
        : null,
    );
    await openPerfil();

    await waitFor(() => expect(screen.getByText('Graduações válidas')).toBeTruthy());
    expect(screen.queryByTestId('perfil-belt-chip')).toBeNull();
  });
});
