/**
 * Chamada manual (ATT.18, professor-10 active behavior): roster with
 * immediate per-tap toggles — self check-ins pre-toggled, manual markers,
 * live "N presentes de M" header, same-day revoke and the
 * revoke_window_closed error path.
 */

import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import * as SecureStore from 'expo-secure-store';
import { queryClient } from '../../src/session/api';
import { sessionTestApi } from '../../src/session/session-store';
import { installFetchMock, json, makeMe, problem, type FetchHandler } from '../helpers/session';
import {
  FUNDAMENTOS_ID,
  makeProfessorClassDetails,
  makeProfessorClasses,
} from '../helpers/enrollment';
import {
  LUCAS_ATTENDANCE_ID,
  ROLL_CALL_STUDENTS,
  SESSION_ID,
  makeRollCall,
} from '../helpers/attendance';

jest.useFakeTimers();

const secure = SecureStore as unknown as { __reset: () => void };

interface Log {
  markBodies: unknown[];
  revokedIds: string[];
}

function installHandlers(override?: FetchHandler): Log {
  const log: Log = { markBodies: [], revokedIds: [] };
  const classes = makeProfessorClasses();
  const details = makeProfessorClassDetails();
  installFetchMock((request) => {
    const overridden = override?.(request);
    if (overridden) return overridden;
    const { method, path, body } = request;
    if (method === 'GET' && path === '/v1/professor/classes') return json(200, { classes });
    const detailMatch = /^\/v1\/professor\/classes\/([0-9a-f-]+)$/.exec(path);
    if (method === 'GET' && detailMatch) {
      return json(200, { class: details[detailMatch[1] ?? ''] });
    }
    if (method === 'POST' && path === `/v1/professor/classes/${FUNDAMENTOS_ID}/roll-call`) {
      return json(200, makeRollCall());
    }
    if (method === 'POST' && path === `/v1/professor/sessions/${SESSION_ID}/attendances`) {
      log.markBodies.push(body);
      return json(200, {
        status: 'checked_in',
        attendance: {
          id: 'att-manual-new',
          classSessionId: SESSION_ID,
          studentId: (body as { studentId: string }).studentId,
          checkedInAt: '2026-08-03T19:05:00.000Z',
        },
        presentCount: 3,
      });
    }
    const revokeMatch = /^\/v1\/professor\/attendances\/([0-9a-z-]+)\/revoke$/.exec(path);
    if (method === 'POST' && revokeMatch) {
      log.revokedIds.push(revokeMatch[1] ?? '');
      return json(200, {
        status: 'revoked',
        attendanceId: revokeMatch[1],
        presentCount: 1,
      });
    }
    return null;
  });
  return log;
}

function renderProfessor(override?: FetchHandler): Log {
  const log = installHandlers(override);
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

async function openRollCall(): Promise<void> {
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Turmas'));
  });
  await waitFor(() => expect(screen.getByText('Fundamentos')).toBeTruthy());
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Fundamentos'));
  });
  await waitFor(() => expect(screen.getByText('Chamada manual')).toBeTruthy());
  await act(async () => {
    fireEvent.press(screen.getByText('Chamada manual'));
  });
  await waitFor(() => expect(screen.getByText('Chamada · Fundamentos')).toBeTruthy());
}

describe('professor chamada manual (ATT.18)', () => {
  beforeEach(() => {
    secure.__reset();
    sessionTestApi.reset();
    queryClient.clear();
  });

  it('renders the roster with pre-toggled self check-ins and manual markers', async () => {
    renderProfessor();
    await openRollCall();

    expect(screen.getByText('2 presentes de 3')).toBeTruthy();
    // Lucas (qr self check-in) and João (manual) arrive toggled on.
    expect(screen.getByTestId('toggle-Lucas Almeida').props.value).toBe(true);
    expect(screen.getByTestId('toggle-João Ferraz').props.value).toBe(true);
    expect(screen.getByTestId('toggle-Tiago Mota').props.value).toBe(false);
    // Manual marker only on the manual row.
    expect(screen.getByText('Manual')).toBeTruthy();
    expect(screen.getByText('Salvar chamada')).toBeTruthy();
  });

  it('toggle on marks the student immediately and updates the header', async () => {
    const log = renderProfessor();
    await openRollCall();

    await act(async () => {
      fireEvent(screen.getByTestId('toggle-Tiago Mota'), 'valueChange', true);
    });

    await waitFor(() => expect(screen.getByText('3 presentes de 3')).toBeTruthy());
    expect(log.markBodies).toContainEqual({ studentId: ROLL_CALL_STUDENTS.tiago });
    expect(screen.getByTestId('toggle-Tiago Mota').props.value).toBe(true);
  });

  it('toggle off revokes the same-day presence immediately', async () => {
    const log = renderProfessor();
    await openRollCall();

    await act(async () => {
      fireEvent(screen.getByTestId('toggle-Lucas Almeida'), 'valueChange', false);
    });

    await waitFor(() => expect(screen.getByText('1 presentes de 3')).toBeTruthy());
    expect(log.revokedIds).toContain(LUCAS_ATTENDANCE_ID);
    expect(screen.getByTestId('toggle-Lucas Almeida').props.value).toBe(false);
  });

  it('keeps the toggle on and explains when the revoke window closed', async () => {
    renderProfessor(({ method, path }) =>
      method === 'POST' && path === `/v1/professor/attendances/${LUCAS_ATTENDANCE_ID}/revoke`
        ? problem(403, 'attendance.revoke_window_closed')
        : null,
    );
    await openRollCall();

    await act(async () => {
      fireEvent(screen.getByTestId('toggle-Lucas Almeida'), 'valueChange', false);
    });

    await waitFor(() =>
      expect(screen.getByText(/O dia desta chamada já fechou/)).toBeTruthy(),
    );
    // History intact: the row stays present, the header count unchanged.
    expect(screen.getByTestId('toggle-Lucas Almeida').props.value).toBe(true);
    expect(screen.getByText('2 presentes de 3')).toBeTruthy();
  });

  it('Salvar chamada simply closes the screen (toggles already applied)', async () => {
    renderProfessor();
    await openRollCall();

    await act(async () => {
      fireEvent.press(screen.getByText('Salvar chamada'));
    });
    await waitFor(() => expect(screen.getByText('Fazer chamada de hoje')).toBeTruthy());
  });
});
