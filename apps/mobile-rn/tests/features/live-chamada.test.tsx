/**
 * Live-chamada state machine (ATT.17, backend issue 09 protocol): snapshot
 * then stream; checkin events increment / revoke events decrement with the
 * server's presentCount; a drop after open re-mints the ticket and
 * re-attaches; a connect failure or second drop falls back to 5 s polling.
 * Transport fully mocked — the machine never sees a real EventSource.
 */

import { act, renderHook } from '@testing-library/react-native';
import { queryClient } from '../../src/session/api';
import { sessionTestApi } from '../../src/session/session-store';
import {
  POLL_INTERVAL_MS,
  useLiveChamada,
} from '../../src/features/attendance/use-live-chamada';
import type { LiveStreamHandlers } from '../../src/features/attendance/sse';
import { installFetchMock, json, type FetchHandler } from '../helpers/session';
import { LIVE_CODE_ID, makeSnapshot, makeSnapshotAttendance } from '../helpers/attendance';

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

function lastConnection(): MockConnection {
  const connection = connections[connections.length - 1];
  if (!connection) throw new Error('no SSE connection opened');
  return connection;
}

interface Log {
  snapshotCalls: number;
  ticketCalls: number;
}

function installLiveHandlers(override?: FetchHandler): Log {
  const log: Log = { snapshotCalls: 0, ticketCalls: 0 };
  const rows = [makeSnapshotAttendance('Lucas Almeida'), makeSnapshotAttendance('João Ferraz')];
  installFetchMock((request) => {
    const overridden = override?.(request);
    if (overridden) return overridden;
    const { method, path } = request;
    if (method === 'GET' && path === `/v1/professor/live-codes/${LIVE_CODE_ID}/attendances`) {
      log.snapshotCalls += 1;
      return json(200, makeSnapshot(rows));
    }
    if (method === 'POST' && path === `/v1/professor/live-codes/${LIVE_CODE_ID}/stream-ticket`) {
      log.ticketCalls += 1;
      return json(200, { ticket: `ticket-${log.ticketCalls}`, expiresInSeconds: 60 });
    }
    return null;
  });
  return log;
}

async function flush(): Promise<void> {
  await act(async () => {});
}

describe('useLiveChamada (ATT.17)', () => {
  beforeEach(() => {
    connections.length = 0;
    sessionTestApi.reset();
    sessionTestApi.seed({ status: 'authed', session: null });
    queryClient.clear();
  });

  it('fetches the snapshot, attaches the ticketed stream and goes live', async () => {
    const log = installLiveHandlers();
    const { result } = renderHook(() => useLiveChamada(LIVE_CODE_ID));
    await flush();

    expect(log.snapshotCalls).toBe(1);
    expect(log.ticketCalls).toBe(1);
    expect(lastConnection().url).toContain(`/v1/professor/live-codes/${LIVE_CODE_ID}/stream`);
    expect(lastConnection().url).toContain('ticket=ticket-1');

    act(() => lastConnection().handlers.onOpen());
    await flush();
    expect(result.current.status).toBe('live');
    expect(result.current.presentCount).toBe(2);
    expect(result.current.attendances.map((row) => row.studentName)).toEqual([
      'Lucas Almeida',
      'João Ferraz',
    ]);
  });

  it('checkin events increment and revoke events decrement the counter', async () => {
    installLiveHandlers();
    const { result } = renderHook(() => useLiveChamada(LIVE_CODE_ID));
    await flush();
    act(() => lastConnection().handlers.onOpen());
    await flush();

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
    expect(result.current.presentCount).toBe(3);
    expect(result.current.attendances.map((row) => row.studentName)).toContain('Tiago Mota');

    act(() =>
      lastConnection().handlers.onRevoke({ attendanceId: 'att-new', presentCount: 2 }),
    );
    expect(result.current.presentCount).toBe(2);
    expect(result.current.attendances.map((row) => row.studentName)).not.toContain(
      'Tiago Mota',
    );
  });

  it('re-mints the ticket and re-attaches after a single drop', async () => {
    const log = installLiveHandlers();
    const { result } = renderHook(() => useLiveChamada(LIVE_CODE_ID));
    await flush();
    act(() => lastConnection().handlers.onOpen());
    await flush();

    // Ticket expiry drop: one error after a good open → reconnect.
    act(() => lastConnection().handlers.onError());
    await flush();
    expect(log.ticketCalls).toBe(2);
    expect(lastConnection().url).toContain('ticket=ticket-2');

    act(() => lastConnection().handlers.onOpen());
    await flush();
    expect(result.current.status).toBe('live');
  });

  it('falls back to 5 s polling when the stream cannot connect', async () => {
    const log = installLiveHandlers();
    const { result } = renderHook(() => useLiveChamada(LIVE_CODE_ID));
    await flush();

    // Never opened → first error is a connect failure → polling.
    act(() => lastConnection().handlers.onError());
    await flush();
    expect(result.current.status).toBe('polling');

    const before = log.snapshotCalls;
    await act(async () => {
      jest.advanceTimersByTime(POLL_INTERVAL_MS);
    });
    await flush();
    expect(log.snapshotCalls).toBe(before + 1);
    expect(result.current.presentCount).toBe(2);
  });

  it('falls back to polling after two consecutive drops', async () => {
    const log = installLiveHandlers();
    const { result } = renderHook(() => useLiveChamada(LIVE_CODE_ID));
    await flush();
    act(() => lastConnection().handlers.onOpen());
    await flush();

    // First drop → reconnect attempt (new ticket, not yet opened).
    act(() => lastConnection().handlers.onError());
    await flush();
    expect(result.current.status).toBe('live');
    // Second drop before reopening → polling.
    act(() => lastConnection().handlers.onError());
    await flush();
    expect(result.current.status).toBe('polling');
    expect(log.ticketCalls).toBe(2);
  });
});
