/**
 * Professor perfil do aluno (GRD.17, professor-11): belt bar + progress
 * line, Adicionar grau / Promover faixa award flows with confirmation
 * sheets (target = next enabled belt of the merged régua), the
 * graduation.update toggle hiding both actions, PT-BR mapping of the
 * stable graduation.* problem codes, and the persistent observações.
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
import {
  FUNDAMENTOS_ID,
  FUNDAMENTOS_ROSTER,
  makeProfessorClassDetails,
  makeProfessorClasses,
} from '../helpers/enrollment';
import {
  BELT_IDS,
  makeProfessorProfile,
  makeStudentNote,
  makeStudentProfile,
} from '../helpers/graduation';

jest.useFakeTimers();

const secure = SecureStore as unknown as { __reset: () => void };

const LUCAS_ID = FUNDAMENTOS_ROSTER[0]!.studentId;

interface HandlerLog {
  awardBodies: unknown[];
  noteBodies: unknown[];
}

function graduationHandlers(
  log: HandlerLog,
  override?: FetchHandler,
): FetchHandler {
  return (request) => {
    const overridden = override?.(request);
    if (overridden) return overridden;
    const { method, path, body } = request;
    if (method === 'GET' && path === '/v1/professor/classes') {
      return json(200, { classes: makeProfessorClasses() });
    }
    const detailMatch = /^\/v1\/professor\/classes\/([0-9a-f-]+)$/.exec(path);
    if (method === 'GET' && detailMatch) {
      const detail = makeProfessorClassDetails()[detailMatch[1] ?? ''];
      return detail
        ? json(200, { class: detail })
        : problem(404, 'resource.not_found');
    }
    if (method === 'GET' && path === '/v1/professor/profile') {
      return json(200, makeProfessorProfile());
    }
    if (
      method === 'GET' &&
      path === `/v1/professor/students/${LUCAS_ID}/profile`
    ) {
      return json(200, makeStudentProfile());
    }
    if (
      method === 'POST' &&
      path === `/v1/professor/students/${LUCAS_ID}/graduations`
    ) {
      log.awardBodies.push(body);
      return json(201, {
        graduation: {
          id: '018f0000-0000-7000-a002-00000000ffff',
          kind: (body as { kind: string }).kind,
          belt: {
            beltId: BELT_IDS.azul,
            name: 'Azul',
            colorSlug: 'belt.blue',
            tipColorSlug: null,
            maxDegrees: 4,
          },
          degree: 3,
          awardedAt: '2026-08-09T18:00:00.000Z',
          awardedBy: {
            userId: '018f0000-0000-7000-8004-000000000001',
            fullName: 'Rafa Mendes',
          },
          notes: null,
          reversed: false,
          reversesGraduationId: null,
          certificateAvailable: false,
        },
        belt: {
          beltId: BELT_IDS.azul,
          name: 'Azul',
          colorSlug: 'belt.blue',
          tipColorSlug: null,
          maxDegrees: 4,
          degrees: 3,
        },
      });
    }
    if (
      method === 'POST' &&
      path === `/v1/professor/students/${LUCAS_ID}/notes`
    ) {
      log.noteBodies.push(body);
      return json(201, {
        note: makeStudentNote((body as { body: string }).body),
      });
    }
    return null;
  };
}

function renderProfessor(
  options: { permissions?: Record<string, boolean> } = {},
  override?: FetchHandler,
): HandlerLog {
  const log: HandlerLog = { awardBodies: [], noteBodies: [] };
  installFetchMock(graduationHandlers(log, override));
  sessionTestApi.seed({
    status: 'authed',
    session: makeMe({
      role: 'professor',
      fullName: 'Rafa Mendes',
      permissions: options.permissions,
    }),
  });
  renderRouter('src/app');
  act(() => {
    jest.advanceTimersByTime(2000);
  });
  return log;
}

async function openLucasProfile(): Promise<void> {
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Turmas'));
  });
  await waitFor(() => expect(screen.getByText('Fundamentos')).toBeTruthy());
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Fundamentos'));
  });
  await waitFor(() =>
    expect(screen.getByText('Fazer chamada de hoje')).toBeTruthy(),
  );
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Lucas Almeida'));
  });
  await waitFor(() => expect(screen.getByText('Perfil do aluno')).toBeTruthy());
}

describe('professor perfil do aluno (GRD.17)', () => {
  beforeEach(() => {
    secure.__reset();
    sessionTestApi.reset();
    queryClient.clear();
  });

  it('renders belt, progress line, stat tiles and observações', async () => {
    renderProfessor();
    await openLucasProfile();

    await waitFor(() =>
      expect(screen.getByTestId('profile-belt')).toBeTruthy(),
    );
    expect(
      screen.getAllByText('Faixa azul · 2 graus').length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('38 de 40 aulas · Próximo 3º grau')).toBeTruthy();

    // Phase-4 tiles + honest mensalidade placeholder.
    expect(screen.getByText('86%')).toBeTruthy();
    expect(screen.getByText('frequência')).toBeTruthy();
    expect(screen.getByText('14')).toBeTruthy();
    expect(screen.getByText('aulas no mês')).toBeTruthy();
    expect(screen.getByText('mensalidade')).toBeTruthy();
    expect(screen.getByText('Em breve')).toBeTruthy();

    // Observações, newest first, with author tag.
    expect(screen.getByText('Observações')).toBeTruthy();
    expect(
      screen.getByText(
        'Boa evolução na guarda fechada, precisa soltar mais o jogo de passagem.',
      ),
    ).toBeTruthy();
    expect(
      screen.getByText('Pediu foco em raspagens para o exame.'),
    ).toBeTruthy();
    expect(screen.getByText('12 jul · Prof. Rafael')).toBeTruthy();
  });

  it('adds a degree through the confirmation sheet with an observação', async () => {
    const log = renderProfessor();
    await openLucasProfile();
    await waitFor(() =>
      expect(screen.getByText('Adicionar grau')).toBeTruthy(),
    );

    await act(async () => {
      fireEvent.press(screen.getByText('Adicionar grau'));
    });
    await waitFor(() =>
      expect(
        screen.getByText('Lucas Almeida recebe o 3º grau na faixa azul.'),
      ).toBeTruthy(),
    );

    fireEvent.changeText(
      screen.getByPlaceholderText('Exame de faixa — aprovado com distinção.'),
      'Constância exemplar.',
    );
    await act(async () => {
      fireEvent.press(screen.getByText('Confirmar grau'));
    });

    await waitFor(() =>
      expect(log.awardBodies).toContainEqual({
        kind: 'degree',
        notes: 'Constância exemplar.',
      }),
    );
    await waitFor(() =>
      expect(screen.getByText('Grau adicionado.')).toBeTruthy(),
    );
  });

  it('promotes the belt to the next enabled belt of the régua', async () => {
    const log = renderProfessor();
    await openLucasProfile();
    await waitFor(() =>
      expect(screen.getByText('Promover faixa')).toBeTruthy(),
    );

    await act(async () => {
      fireEvent.press(screen.getByText('Promover faixa'));
    });
    // Azul → Roxa (kids belts and the disabled Laranja are skipped).
    await waitFor(() =>
      expect(
        screen.getByText(
          'Lucas Almeida é promovido para a faixa roxa. Os graus voltam a zero.',
        ),
      ).toBeTruthy(),
    );

    await act(async () => {
      fireEvent.press(screen.getByText('Confirmar promoção'));
    });

    await waitFor(() =>
      expect(log.awardBodies).toContainEqual({
        kind: 'belt',
        beltId: BELT_IDS.roxa,
      }),
    );
    await waitFor(() =>
      expect(screen.getByText('Faixa promovida.')).toBeTruthy(),
    );
  });

  it('hides both award actions when graduation.update is off', async () => {
    renderProfessor({ permissions: { 'graduation.update': false } });
    await openLucasProfile();
    await waitFor(() =>
      expect(screen.getByTestId('profile-belt')).toBeTruthy(),
    );

    expect(screen.queryByText('Adicionar grau')).toBeNull();
    expect(screen.queryByText('Promover faixa')).toBeNull();
  });

  it('maps graduation.degree_at_max to the PT-BR message', async () => {
    renderProfessor({}, ({ method, path }) =>
      method === 'POST' &&
      path === `/v1/professor/students/${LUCAS_ID}/graduations`
        ? problem(422, 'graduation.degree_at_max')
        : null,
    );
    await openLucasProfile();
    await waitFor(() =>
      expect(screen.getByText('Adicionar grau')).toBeTruthy(),
    );

    await act(async () => {
      fireEvent.press(screen.getByText('Adicionar grau'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Confirmar grau'));
    });

    await waitFor(() =>
      expect(
        screen.getByText(
          'Este aluno já está no número máximo de graus da faixa atual.',
        ),
      ).toBeTruthy(),
    );
  });

  it('maps graduation.belt_invalid_target to the PT-BR message', async () => {
    renderProfessor({}, ({ method, path }) =>
      method === 'POST' &&
      path === `/v1/professor/students/${LUCAS_ID}/graduations`
        ? problem(422, 'graduation.belt_invalid_target')
        : null,
    );
    await openLucasProfile();
    await waitFor(() =>
      expect(screen.getByText('Promover faixa')).toBeTruthy(),
    );

    await act(async () => {
      fireEvent.press(screen.getByText('Promover faixa'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Confirmar promoção'));
    });

    await waitFor(() =>
      expect(
        screen.getByText(
          'Faixa de destino inválida — verifique as graduações válidas da academia.',
        ),
      ).toBeTruthy(),
    );
  });

  it('saves a new observação and clears the input', async () => {
    const log = renderProfessor();
    await openLucasProfile();
    await waitFor(() => expect(screen.getByText('Observações')).toBeTruthy());

    fireEvent.changeText(
      screen.getByPlaceholderText('Nova observação'),
      'Treinou defesa de queda hoje.',
    );
    await act(async () => {
      fireEvent.press(screen.getByText('Salvar'));
    });

    await waitFor(() =>
      expect(log.noteBodies).toContainEqual({
        body: 'Treinou defesa de queda hoje.',
      }),
    );
    await waitFor(() =>
      expect(screen.getByText('Observação salva.')).toBeTruthy(),
    );
  });
});
