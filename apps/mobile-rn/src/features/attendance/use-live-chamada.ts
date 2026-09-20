/**
 * Live-chamada realtime state machine (ATT.17, backend issue 09 protocol):
 * snapshot first, then attach the ticketed SSE stream; `checkin` events
 * append + set the server's presentCount, `revoke` events remove + set it.
 * A single drop after a successful open re-mints the ~60 s ticket and
 * re-attaches (ticket expiry is a normal drop); a connect failure or a
 * second drop falls back to 5 s snapshot polling while foregrounded.
 * Backgrounding stops everything; returning to foreground restarts from the
 * stream path.
 */

import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import type { SnapshotAttendance } from '@tatame/shared';
import { apiBaseUrl, apiClient } from '../../session/api';
import { connectLiveStream, type LiveStreamConnection } from './sse';

export const POLL_INTERVAL_MS = 5000;

export type LiveChamadaStatus = 'connecting' | 'live' | 'polling';

export interface LiveChamadaState {
  status: LiveChamadaStatus;
  /** False until the first snapshot lands — callers keep their seed count. */
  synced: boolean;
  presentCount: number;
  /** Active attendances, oldest first (snapshot order + stream appends). */
  attendances: SnapshotAttendance[];
}

const INITIAL: LiveChamadaState = {
  status: 'connecting',
  synced: false,
  presentCount: 0,
  attendances: [],
};

/** Streams the live code's roll call; `null` id keeps the machine idle. */
export function useLiveChamada(liveCodeId: string | null): LiveChamadaState {
  // The state carries the id it belongs to, so going idle (or switching
  // codes) reads as INITIAL by derivation instead of a synchronous reset
  // write inside the effect.
  const [owned, setOwned] = useState<{
    id: string | null;
    state: LiveChamadaState;
  }>({
    id: null,
    state: INITIAL,
  });

  useEffect(() => {
    if (!liveCodeId) return;
    let disposed = false;
    let connection: LiveStreamConnection | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let drops = 0;
    let opened = false;

    const setSafe = (updater: (prev: LiveChamadaState) => LiveChamadaState) => {
      if (disposed) return;
      setOwned((prev) => ({
        id: liveCodeId,
        state: updater(prev.id === liveCodeId ? prev.state : INITIAL),
      }));
    };

    const fetchSnapshot = async (): Promise<void> => {
      const { data } = await apiClient.GET(
        '/v1/professor/live-codes/{id}/attendances',
        {
          params: { path: { id: liveCodeId } },
        },
      );
      if (!data) return;
      setSafe((prev) => ({
        ...prev,
        synced: true,
        presentCount: data.presentCount,
        attendances: data.attendances,
      }));
    };

    const stopTransports = () => {
      connection?.close();
      connection = null;
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    const startPolling = () => {
      if (disposed || pollTimer) return;
      connection?.close();
      connection = null;
      setSafe((prev) => ({ ...prev, status: 'polling' }));
      pollTimer = setInterval(() => {
        void fetchSnapshot();
      }, POLL_INTERVAL_MS);
    };

    const connect = async (): Promise<void> => {
      const { data } = await apiClient.POST(
        '/v1/professor/live-codes/{id}/stream-ticket',
        {
          params: { path: { id: liveCodeId } },
        },
      );
      if (disposed) return;
      if (!data) {
        startPolling();
        return;
      }
      opened = false;
      const url = `${apiBaseUrl}/v1/professor/live-codes/${liveCodeId}/stream?ticket=${encodeURIComponent(data.ticket)}`;
      connection = connectLiveStream(url, {
        onOpen: () => {
          if (disposed) return;
          opened = true;
          drops = 0;
          setSafe((prev) => ({ ...prev, status: 'live' }));
          // Re-sync: events between snapshot and attach (or across a
          // reconnect gap) are not replayed in v1.
          void fetchSnapshot();
        },
        onCheckin: (event) => {
          setSafe((prev) => {
            if (prev.attendances.some((row) => row.id === event.attendanceId)) {
              return {
                ...prev,
                synced: true,
                presentCount: event.presentCount,
              };
            }
            return {
              ...prev,
              synced: true,
              presentCount: event.presentCount,
              attendances: [
                ...prev.attendances,
                {
                  id: event.attendanceId,
                  studentId: event.studentId,
                  studentName: event.studentName,
                  method: event.method,
                  checkedInAt: event.checkedInAt,
                },
              ],
            };
          });
        },
        onRevoke: (event) => {
          setSafe((prev) => ({
            ...prev,
            synced: true,
            presentCount: event.presentCount,
            attendances: prev.attendances.filter(
              (row) => row.id !== event.attendanceId,
            ),
          }));
        },
        onError: () => {
          if (disposed) return;
          connection?.close();
          connection = null;
          drops += 1;
          // Never opened (connect failure) or second drop → polling.
          if (!opened || drops >= 2) {
            startPolling();
            return;
          }
          // Single drop after a good stream: ticket likely expired — mint a
          // fresh one and re-attach.
          void connect();
        },
      });
    };

    const start = () => {
      setSafe((prev) => ({ ...prev, status: 'connecting' }));
      void fetchSnapshot();
      void connect();
    };

    start();

    const appStateSub = AppState.addEventListener('change', (next) => {
      if (disposed) return;
      if (next === 'active') {
        stopTransports();
        drops = 0;
        start();
      } else {
        stopTransports();
      }
    });

    return () => {
      disposed = true;
      stopTransports();
      appStateSub.remove();
    };
  }, [liveCodeId]);

  return owned.id === liveCodeId && liveCodeId ? owned.state : INITIAL;
}
