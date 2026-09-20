/**
 * Cadastrar aluno sheet (ENR.20, responsavel-08): the age suggestion is
 * fetched ONLY after a complete birth date (fixing the prototype's
 * pre-filled static chip), registration posts the accepted class and
 * surfaces the auto-enrollment result, and story 34 (no age match) still
 * registers without a class.
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
import {
  KIDS_ID,
  makeDependents,
  makeKidsSuggestion,
} from '../helpers/enrollment';

jest.useFakeTimers();
jest.setSystemTime(new Date(2026, 7, 1, 12, 0, 0));

const secure = SecureStore as unknown as { __reset: () => void };

interface HandlerLog {
  suggestionSearches: string[];
  registerBodies: unknown[];
}

function cadastrarHandlers(
  log: HandlerLog,
  options: { suggestion?: unknown; enrolled?: boolean } = {},
): FetchHandler {
  const dependents = makeDependents();
  return ({ method, path, search, body }) => {
    if (method === 'GET' && path === '/v1/responsavel/dependents') {
      return json(200, { dependents });
    }
    if (method === 'GET' && path === '/v1/responsavel/class-suggestion') {
      log.suggestionSearches.push(search);
      return json(200, {
        suggestion:
          'suggestion' in options ? options.suggestion : makeKidsSuggestion(),
      });
    }
    if (method === 'POST' && path === '/v1/responsavel/dependents') {
      log.registerBodies.push(body);
      const dto = body as {
        fullName: string;
        birthDate: string;
        classId?: string;
      };
      return json(201, {
        dependent: {
          id: '018f0000-0000-7000-8006-00000000000f',
          fullName: dto.fullName,
          birthDate: dto.birthDate,
          status: 'active',
          class: null,
        },
        enrolled: options.enrolled ?? true,
      });
    }
    return null;
  };
}

function renderCadastrar(
  options: { suggestion?: unknown; enrolled?: boolean } = {},
): HandlerLog {
  const log: HandlerLog = { suggestionSearches: [], registerBodies: [] };
  installFetchMock(cadastrarHandlers(log, options));
  sessionTestApi.seed({
    status: 'authed',
    session: makeMe({ role: 'guardian', fullName: 'Fernanda Silveira' }),
  });
  renderRouter('src/app');
  act(() => {
    jest.advanceTimersByTime(2000);
  });
  return log;
}

async function openSheet(): Promise<void> {
  await waitFor(() =>
    expect(screen.getByLabelText('Cadastrar aluno')).toBeTruthy(),
  );
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Cadastrar aluno'));
  });
  await waitFor(() =>
    expect(screen.getByTestId('register-dependent-sheet')).toBeTruthy(),
  );
}

describe('responsável cadastrar aluno (ENR.20)', () => {
  beforeEach(() => {
    secure.__reset();
    sessionTestApi.reset();
    queryClient.clear();
  });

  it('fetches the suggestion only after a complete birth date', async () => {
    const log = renderCadastrar();
    await openSheet();

    expect(
      screen.getByText('O cadastro nasce vinculado a você e à academia.'),
    ).toBeTruthy();
    expect(screen.getByText('Turma sugerida pela idade')).toBeTruthy();
    // No pre-filled chip while the form is empty (prototype mock artifact).
    expect(
      screen.getByText(
        'Informe a data de nascimento para ver a turma sugerida.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('Kids · Ter e Qui 18:00')).toBeNull();
    expect(log.suggestionSearches).toHaveLength(0);

    await act(async () => {
      fireEvent.changeText(
        screen.getByPlaceholderText('DD/MM/AAAA'),
        '02/08/2016',
      );
    });

    await waitFor(() =>
      expect(screen.getByText('Kids · Ter e Qui 18:00')).toBeTruthy(),
    );
    expect(log.suggestionSearches).toContain('?birthDate=2016-08-02');
  });

  it('registers with the accepted suggestion and surfaces the enrollment', async () => {
    const log = renderCadastrar({ enrolled: true });
    await openSheet();

    fireEvent.changeText(
      screen.getByPlaceholderText('Nome completo'),
      'Caio Silveira',
    );
    await act(async () => {
      fireEvent.changeText(
        screen.getByPlaceholderText('DD/MM/AAAA'),
        '02/08/2016',
      );
    });
    await waitFor(() =>
      expect(screen.getByText('Kids · Ter e Qui 18:00')).toBeTruthy(),
    );

    await act(async () => {
      fireEvent.press(screen.getByText('Cadastrar'));
    });

    await waitFor(() =>
      expect(log.registerBodies).toContainEqual({
        fullName: 'Caio Silveira',
        birthDate: '2016-08-02',
        classId: KIDS_ID,
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByText(
          'Caio Silveira cadastrado e matriculado na turma Kids.',
        ),
      ).toBeTruthy(),
    );
    // Sheet closes after a successful registration.
    expect(screen.queryByTestId('register-dependent-sheet')).toBeNull();
  });

  it('registers without a class when no age-matching turma exists (story 34)', async () => {
    const log = renderCadastrar({ suggestion: null, enrolled: false });
    await openSheet();

    fireEvent.changeText(
      screen.getByPlaceholderText('Nome completo'),
      'Marcos Silveira',
    );
    await act(async () => {
      fireEvent.changeText(
        screen.getByPlaceholderText('DD/MM/AAAA'),
        '10/05/1990',
      );
    });
    await waitFor(() =>
      expect(
        screen.getByText(
          'Nenhuma turma com vaga para essa idade — o cadastro segue sem matrícula.',
        ),
      ).toBeTruthy(),
    );

    await act(async () => {
      fireEvent.press(screen.getByText('Cadastrar'));
    });

    await waitFor(() =>
      expect(log.registerBodies).toContainEqual({
        fullName: 'Marcos Silveira',
        birthDate: '1990-05-10',
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByText(
          'Marcos Silveira cadastrado — matrícula fica para quando houver vaga.',
        ),
      ).toBeTruthy(),
    );
  });

  it('opens the sheet from the shell FAB when the toggle is on', async () => {
    renderCadastrar();
    await waitFor(() =>
      expect(screen.getByLabelText('Cadastrar filho')).toBeTruthy(),
    );
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Cadastrar filho'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('register-dependent-sheet')).toBeTruthy(),
    );
  });
});
