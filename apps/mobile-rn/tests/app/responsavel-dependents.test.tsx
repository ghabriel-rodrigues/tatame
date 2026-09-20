/**
 * Responsável dependents (ENR.19): panel per responsavel-02 — one card per
 * child with age, class, next slot and honest placeholders (frequência =
 * Fase 4, faixa = graduation slice) — plus the child detail with the full
 * class schedule and the toggle-off hidden state (story 36).
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
  problem,
  type FetchHandler,
} from '../helpers/session';
import { makeDependents } from '../helpers/enrollment';

jest.useFakeTimers();
jest.setSystemTime(new Date(2026, 7, 1, 12, 0, 0)); // sábado, 1 de agosto de 2026

const secure = SecureStore as unknown as { __reset: () => void };

function dependentsHandlers(override?: FetchHandler): FetchHandler {
  const dependents = makeDependents();
  return (request) => {
    const overridden = override?.(request);
    if (overridden) return overridden;
    const { method, path } = request;
    if (method === 'GET' && path === '/v1/responsavel/dependents') {
      return json(200, { dependents });
    }
    const match = /^\/v1\/responsavel\/dependents\/([0-9a-f-]+)$/.exec(path);
    if (method === 'GET' && match) {
      const dependent = dependents.find((item) => item.id === match[1]);
      return dependent
        ? json(200, { dependent })
        : problem(404, 'resource.not_found');
    }
    return null;
  };
}

function renderResponsavel(
  options: { permissions?: Record<string, boolean> } = {},
): void {
  installFetchMock(dependentsHandlers());
  sessionTestApi.seed({
    status: 'authed',
    session: makeMe({
      role: 'guardian',
      fullName: 'Fernanda Silveira',
      permissions: options.permissions,
    }),
  });
  renderRouter('src/app');
  act(() => {
    jest.advanceTimersByTime(2000);
  });
}

describe('responsável dependents (ENR.19)', () => {
  beforeEach(() => {
    secure.__reset();
    sessionTestApi.reset();
    queryClient.clear();
  });

  it('renders the panel with one card per dependent', async () => {
    renderResponsavel();
    await waitFor(() =>
      expect(screen.getByText('Pedro Silveira')).toBeTruthy(),
    );

    expect(screen.getByText('Olá, Fernanda')).toBeTruthy();
    expect(screen.getByText('sábado, 1 de agosto')).toBeTruthy();
    expect(screen.getByText('Responsável')).toBeTruthy();

    // Age + class, server-derived next slot, honest placeholders.
    expect(screen.getByText('9 anos · Kids')).toBeTruthy();
    expect(screen.getByText('Júlia Silveira')).toBeTruthy();
    expect(screen.getByText('12 anos · Kids')).toBeTruthy();
    expect(screen.getAllByText('Ter 18:00')).toHaveLength(2);
    expect(screen.getAllByText('Fase 4')).toHaveLength(2);
    expect(screen.getAllByText('faixa')).toHaveLength(2);

    expect(screen.getByLabelText('Cadastrar aluno')).toBeTruthy();
  });

  it('opens the dependent detail with the class schedule and belt placeholder', async () => {
    renderResponsavel();
    await waitFor(() =>
      expect(screen.getByText('Pedro Silveira')).toBeTruthy(),
    );

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Pedro Silveira'));
    });
    await waitFor(() => expect(screen.getByText('Turma')).toBeTruthy());

    expect(screen.getByText('9 anos')).toBeTruthy();
    expect(screen.getByText('Kids')).toBeTruthy();
    expect(screen.getByText('Ter')).toBeTruthy();
    expect(screen.getByText('Qui')).toBeTruthy();
    expect(screen.getAllByText('18:00 – 18:45')).toHaveLength(2);
    expect(screen.getByText('Próxima aula · Ter 18:00')).toBeTruthy();

    // Graduation stays an explicit placeholder this phase.
    expect(screen.getByText('Graduação')).toBeTruthy();
    expect(
      screen.getByText(
        'A evolução de faixa e graus chega na fase de graduação.',
      ),
    ).toBeTruthy();
  });

  it('hides the cadastrar entry when dependents.register is off', async () => {
    renderResponsavel({ permissions: { 'dependents.register': false } });
    await waitFor(() =>
      expect(screen.getByText('Pedro Silveira')).toBeTruthy(),
    );

    expect(screen.queryByLabelText('Cadastrar aluno')).toBeNull();
    expect(screen.queryByTestId('register-dependent-sheet')).toBeNull();

    // The shell FAB explains the denial instead of opening the sheet.
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Cadastrar filho'));
    });
    expect(
      screen.getByText('Cadastro de alunos desabilitado pela academia.'),
    ).toBeTruthy();
    expect(screen.queryByTestId('register-dependent-sheet')).toBeNull();
  });
});
