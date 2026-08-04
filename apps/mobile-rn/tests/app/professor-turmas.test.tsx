/**
 * Professor turmas (ENR.17/18 + ATT.18): Minhas turmas list per
 * professor-07 (schedule line, occupancy chip + bar, Lotada), turma detail
 * per professor-08 (real roster — not the prototype's 3-of-24 bug — and the
 * honest frequência placeholder), Adicionar aluno picker per professor-09 —
 * now rewired to GET /v1/professor/students?notEnrolledInClassId (ATT.18) —
 * and remove-with-confirm, with PT-BR problem+json mapping.
 */

import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import * as SecureStore from 'expo-secure-store';
import { queryClient } from '../../src/session/api';
import { sessionTestApi } from '../../src/session/session-store';
import { installFetchMock, json, makeMe, problem, type FetchHandler } from '../helpers/session';
import {
  FUNDAMENTOS_ID,
  FUNDAMENTOS_ROSTER,
  makeProfessorClassDetails,
  makeProfessorClasses,
} from '../helpers/enrollment';
import { makeProfessorStudents } from '../helpers/attendance';

jest.useFakeTimers();

const secure = SecureStore as unknown as { __reset: () => void };

interface HandlerLog {
  addBodies: unknown[];
  removedPaths: string[];
  studentsSearches: string[];
}

/** Happy-path professor enrollment API; overrides run first. */
function professorHandlers(log: HandlerLog, override?: FetchHandler): FetchHandler {
  const classes = makeProfessorClasses();
  const details = makeProfessorClassDetails();
  return (request) => {
    const overridden = override?.(request);
    if (overridden) return overridden;
    const { method, path, body } = request;
    if (method === 'GET' && path === '/v1/professor/classes') {
      return json(200, { classes });
    }
    if (method === 'GET' && path === '/v1/professor/students') {
      log.studentsSearches.push(request.search);
      return json(200, { students: makeProfessorStudents() });
    }
    const detailMatch = /^\/v1\/professor\/classes\/([0-9a-f-]+)$/.exec(path);
    if (method === 'GET' && detailMatch) {
      const detail = details[detailMatch[1] ?? ''];
      return detail ? json(200, { class: detail }) : problem(404, 'resource.not_found');
    }
    const rosterMatch = /^\/v1\/professor\/classes\/([0-9a-f-]+)\/students$/.exec(path);
    if (method === 'POST' && rosterMatch) {
      log.addBodies.push(body);
      return json(201, {
        enrollment: {
          classId: rosterMatch[1],
          studentId: (body as { studentId: string }).studentId,
          status: 'active',
        },
      });
    }
    const removeMatch = /^\/v1\/professor\/classes\/([0-9a-f-]+)\/students\/([0-9a-f-]+)$/.exec(
      path,
    );
    if (method === 'DELETE' && removeMatch) {
      log.removedPaths.push(path);
      return json(200, {
        enrollment: { classId: removeMatch[1], studentId: removeMatch[2], status: 'removed' },
      });
    }
    return null;
  };
}

function renderProfessor(override?: FetchHandler): HandlerLog {
  const log: HandlerLog = { addBodies: [], removedPaths: [], studentsSearches: [] };
  installFetchMock(professorHandlers(log, override));
  sessionTestApi.seed({
    status: 'authed',
    session: makeMe({ role: 'professor', fullName: 'Rafa Mendes' }),
  });
  renderRouter('src/app');
  act(() => {
    jest.advanceTimersByTime(2000);
  });
  return log;
}

async function openTurmas(): Promise<void> {
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Turmas'));
  });
  await waitFor(() => expect(screen.getByText('Fundamentos')).toBeTruthy());
}

async function openFundamentosDetail(): Promise<void> {
  await openTurmas();
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Fundamentos'));
  });
  await waitFor(() => expect(screen.getByText('Fazer chamada de hoje')).toBeTruthy());
}

describe('professor turmas (ENR.17/18)', () => {
  beforeEach(() => {
    secure.__reset();
    sessionTestApi.reset();
    queryClient.clear();
  });

  it('lists Minhas turmas with schedule, occupancy chips, bar and Lotada', async () => {
    renderProfessor();
    await openTurmas();

    expect(screen.getByText('Minhas turmas')).toBeTruthy();
    expect(screen.getByText('Seg · Qua · Sex 19:00 – 20:00')).toBeTruthy();
    expect(screen.getByText('24 de 24 vagas')).toBeTruthy();
    expect(screen.getByText('Lotada')).toBeTruthy();
    expect(screen.getByTestId('occupancy-bar-Fundamentos')).toBeTruthy();

    expect(screen.getByText('Avançada')).toBeTruthy();
    expect(screen.getByText('Ter · Qui 20:00 – 21:30')).toBeTruthy();
    expect(screen.getByText('16 de 20 vagas')).toBeTruthy();
  });

  it('renders the turma detail with real roster and the Fase 4 placeholder', async () => {
    renderProfessor();
    await openFundamentosDetail();

    // Stat tiles: real occupancy + honest per-turma frequency placeholder
    // (the professor contract has no per-class month rate — reports slice).
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('alunos')).toBeTruthy();
    expect(screen.getByText('Relatórios')).toBeTruthy();
    expect(screen.getByText('13%')).toBeTruthy(); // 3 / 24

    // Real roster — every enrolled student, not the prototype's excerpt.
    expect(screen.getByText('Lucas Almeida')).toBeTruthy();
    expect(screen.getByText('João Ferraz')).toBeTruthy();
    expect(screen.getByText('Tiago Mota')).toBeTruthy();
    expect(screen.getByText('Pendente')).toBeTruthy();
  });

  it('adds a student from the picker fed by /professor/students (ATT.18)', async () => {
    const log = renderProfessor();
    await openFundamentosDetail();

    await act(async () => {
      fireEvent.press(screen.getByText('Adicionar aluno'));
    });
    // Real candidates from the dedicated endpoint, filtered server-side.
    await waitFor(() => expect(screen.getByText('Marina Costa')).toBeTruthy());
    expect(screen.getByText('Pedro Silveira')).toBeTruthy();
    expect(screen.getByText('Bia Andrade')).toBeTruthy();
    expect(screen.getByText(/gestão compartilhada com o admin/)).toBeTruthy();
    expect(log.studentsSearches).toContainEqual(
      `?notEnrolledInClassId=${FUNDAMENTOS_ID}`,
    );

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Adicionar Marina Costa'));
    });

    const marina = makeProfessorStudents()[0]!;
    await waitFor(() => expect(log.addBodies).toContainEqual({ studentId: marina.id }));
    await waitFor(() =>
      expect(screen.getByText('Marina Costa agora faz parte da turma.')).toBeTruthy(),
    );
  });

  it('maps class.full to the PT-BR error inside the picker', async () => {
    renderProfessor(({ method, path }) =>
      method === 'POST' && path === `/v1/professor/classes/${FUNDAMENTOS_ID}/students`
        ? problem(409, 'class.full')
        : null,
    );
    await openFundamentosDetail();

    await act(async () => {
      fireEvent.press(screen.getByText('Adicionar aluno'));
    });
    await waitFor(() => expect(screen.getByText('Marina Costa')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Adicionar Marina Costa'));
    });

    await waitFor(() =>
      expect(
        screen.getByText('Turma lotada — o limite de alunos foi atingido.'),
      ).toBeTruthy(),
    );
  });

  it('maps enrollment.already_enrolled to the PT-BR error', async () => {
    renderProfessor(({ method, path }) =>
      method === 'POST' && path === `/v1/professor/classes/${FUNDAMENTOS_ID}/students`
        ? problem(409, 'enrollment.already_enrolled')
        : null,
    );
    await openFundamentosDetail();

    await act(async () => {
      fireEvent.press(screen.getByText('Adicionar aluno'));
    });
    await waitFor(() => expect(screen.getByText('Marina Costa')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Adicionar Marina Costa'));
    });

    await waitFor(() =>
      expect(screen.getByText('Este aluno já está matriculado nesta turma.')).toBeTruthy(),
    );
  });

  it('removes a student from the roster after confirmation', async () => {
    const log = renderProfessor();
    await openFundamentosDetail();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Remover Tiago Mota'));
    });
    await waitFor(() => expect(screen.getByText('Remover aluno')).toBeTruthy());
    expect(screen.getByText('Tiago Mota sai da turma Fundamentos.')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText('Remover'));
    });

    const tiago = FUNDAMENTOS_ROSTER[2]!;
    await waitFor(() =>
      expect(log.removedPaths).toContain(
        `/v1/professor/classes/${FUNDAMENTOS_ID}/students/${tiago.studentId}`,
      ),
    );
    await waitFor(() => expect(screen.getByText('Aluno removido da turma.')).toBeTruthy());
  });
});
