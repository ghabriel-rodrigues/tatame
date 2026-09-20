/**
 * Chamada ao vivo (ATT.17, professor-03): opened from the turma detail —
 * big 4-digit code, QR panel, expiry countdown, live counter via the
 * (mocked) SSE machine, polling-fallback note, encerrar + reabrir.
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
import type { LiveStreamHandlers } from '../../src/features/attendance/sse';
import {
  installFetchMock,
  json,
  makeMe,
  type FetchHandler,
} from '../helpers/session';
import {
  FUNDAMENTOS_ID,
  makeProfessorClassDetails,
  makeProfessorClasses,
} from '../helpers/enrollment';
import {
  LIVE_CODE_ID,
  makeLiveCode,
  makeSnapshot,
  makeSnapshotAttendance,
} from '../helpers/attendance';

interface MockConnection {
  url: string;
  handlers: LiveStreamHandlers;
  close: jest.Mock;
}

const connections: MockConnection[] = [];

jest.mock('../../src/features/attendance/sse', () => ({
  connectLiveStream: jest.fn((url: string, handlers: unknown) => {
    const connection = { url, handlers, close: jest.fn() };
    connections.push(connection as never);
    return connection;
  }),
}));

jest.useFakeTimers();

const secure = SecureStore as unknown as { __reset: () => void };

function lastConnection(): MockConnection {
  const connection = connections[connections.length - 1];
  if (!connection) throw new Error('no SSE connection opened');
  return connection;
}

interface Log {
  openCalls: number;
  closeCalls: number;
}

function fundamentosLiveCode() {
  const base = makeLiveCode();
  return { ...base, session: { ...base.session, className: 'Fundamentos' } };
}

function installHandlers(override?: FetchHandler): Log {
  const log: Log = { openCalls: 0, closeCalls: 0 };
  const classes = makeProfessorClasses();
  const details = makeProfessorClassDetails();
  const rows = [
    makeSnapshotAttendance('Lucas Almeida'),
    makeSnapshotAttendance('João Ferraz'),
  ];
  installFetchMock((request) => {
    const overridden = override?.(request);
    if (overridden) return overridden;
    const { method, path } = request;
    if (method === 'GET' && path === '/v1/professor/classes')
      return json(200, { classes });
    const detailMatch = /^\/v1\/professor\/classes\/([0-9a-f-]+)$/.exec(path);
    if (method === 'GET' && detailMatch) {
      return json(200, { class: details[detailMatch[1] ?? ''] });
    }
    if (
      method === 'POST' &&
      path === `/v1/professor/classes/${FUNDAMENTOS_ID}/live-codes`
    ) {
      log.openCalls += 1;
      return json(200, fundamentosLiveCode());
    }
    if (
      method === 'POST' &&
      path === `/v1/professor/live-codes/${LIVE_CODE_ID}/close`
    ) {
      log.closeCalls += 1;
      return json(200, {
        ...fundamentosLiveCode(),
        revokedAt: '2026-08-03T10:20:00.000Z',
        presentCount: 3,
      });
    }
    if (
      method === 'GET' &&
      path === `/v1/professor/live-codes/${LIVE_CODE_ID}/attendances`
    ) {
      return json(200, makeSnapshot(rows));
    }
    if (
      method === 'POST' &&
      path === `/v1/professor/live-codes/${LIVE_CODE_ID}/stream-ticket`
    ) {
      return json(200, { ticket: 'ticket-1', expiresInSeconds: 60 });
    }
    return null;
  });
  return log;
}

async function openLiveChamada(): Promise<void> {
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
    fireEvent.press(screen.getByText('Fazer chamada de hoje'));
  });
  await waitFor(() =>
    expect(screen.getByText('Chamada aberta · Fundamentos')).toBeTruthy(),
  );
}

describe('professor chamada ao vivo (ATT.17)', () => {
  beforeEach(() => {
    connections.length = 0;
    secure.__reset();
    sessionTestApi.reset();
    queryClient.clear();
  });

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

  it('shows the big code, QR, countdown and live counter', async () => {
    renderProfessor();
    await openLiveChamada();

    // 4-digit code as individual digits (professor-03).
    expect(screen.getByTestId('live-code-digits')).toBeTruthy();
    for (const digit of ['4', '7', '2', '9']) {
      expect(screen.getAllByText(digit).length).toBeGreaterThan(0);
    }
    expect(screen.getByText(/Expira em \d{2}:\d{2}/)).toBeTruthy();
    expect(screen.getByTestId('live-qr-panel')).toBeTruthy();

    // Snapshot lands → counter shows the active-rows truth.
    await waitFor(() =>
      expect(screen.getByText(/2 alunos já registraram presença/)).toBeTruthy(),
    );
    expect(screen.getByText('Lucas Almeida')).toBeTruthy();
    expect(screen.getByText('João Ferraz')).toBeTruthy();
  });

  it('increments the counter and list on a checkin stream event', async () => {
    renderProfessor();
    await openLiveChamada();
    await waitFor(() =>
      expect(screen.getByText(/2 alunos já registraram presença/)).toBeTruthy(),
    );

    act(() => lastConnection().handlers.onOpen());
    // Let the on-open snapshot re-sync settle before the stream event.
    await act(async () => {});
    act(() =>
      lastConnection().handlers.onCheckin({
        attendanceId: 'att-new',
        studentId: 'stu-new',
        studentName: 'Tiago Mota',
        method: 'code',
        checkedInAt: '2026-08-03T10:03:00.000Z',
        presentCount: 3,
      }),
    );

    await waitFor(() =>
      expect(screen.getByText(/3 alunos já registraram presença/)).toBeTruthy(),
    );
    expect(screen.getByText('Tiago Mota')).toBeTruthy();
  });

  it('shows the polling note when the stream cannot connect', async () => {
    renderProfessor();
    await openLiveChamada();

    act(() => lastConnection().handlers.onError());
    await waitFor(() =>
      expect(screen.getByText(/atualizando a cada 5 segundos/i)).toBeTruthy(),
    );
  });

  it('encerra a chamada and reopens with a fresh open call', async () => {
    const log = renderProfessor();
    await openLiveChamada();

    await act(async () => {
      fireEvent.press(screen.getByText('Encerrar chamada'));
    });
    await waitFor(() =>
      expect(screen.getByText('Chamada encerrada')).toBeTruthy(),
    );
    expect(log.closeCalls).toBe(1);
    expect(screen.getByText(/3 presenças registradas/)).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText('Reabrir chamada'));
    });
    await waitFor(() =>
      expect(screen.getByText('Chamada aberta · Fundamentos')).toBeTruthy(),
    );
    expect(log.openCalls).toBe(2);
  });
});
