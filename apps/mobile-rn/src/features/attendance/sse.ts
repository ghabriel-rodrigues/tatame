/**
 * Thin SSE wrapper over `react-native-sse` (ATT.17). The realtime decision
 * (backend issue 09) picked react-native-sse for the RN client: tiny,
 * XHR-streaming based, pure JS (no native module — Expo-managed safe), and
 * it supports the named `checkin` / `revoke` events RN's fetch cannot
 * stream. Hand-rolling a parser over fetch would gain nothing: RN fetch has
 * no incremental body reads without polyfills.
 *
 * This module is the app's single streaming seam — the live-chamada state
 * machine talks to `connectLiveStream` only, so tests mock this module and
 * the transport never leaks into screens.
 */

import EventSource from 'react-native-sse';
import type { LiveStreamCheckinEvent, LiveStreamRevokeEvent } from '@tatame/shared';

export interface LiveStreamHandlers {
  onOpen: () => void;
  onCheckin: (event: LiveStreamCheckinEvent) => void;
  onRevoke: (event: LiveStreamRevokeEvent) => void;
  /** Any transport failure — the machine decides retry vs polling. */
  onError: () => void;
}

export interface LiveStreamConnection {
  close: () => void;
}

type LiveEvents = 'checkin' | 'revoke' | 'heartbeat';

function parse<T>(data: string | null | undefined): T | null {
  if (!data) return null;
  try {
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

/** Opens the ticketed SSE stream; heartbeats are consumed silently. */
export function connectLiveStream(
  url: string,
  handlers: LiveStreamHandlers,
): LiveStreamConnection {
  const source = new EventSource<LiveEvents>(url);

  source.addEventListener('open', () => handlers.onOpen());
  source.addEventListener('checkin', (event) => {
    const payload = parse<LiveStreamCheckinEvent>('data' in event ? event.data : null);
    if (payload) handlers.onCheckin(payload);
  });
  source.addEventListener('revoke', (event) => {
    const payload = parse<LiveStreamRevokeEvent>('data' in event ? event.data : null);
    if (payload) handlers.onRevoke(payload);
  });
  source.addEventListener('error', () => handlers.onError());

  return {
    close: () => {
      source.removeAllEventListeners();
      source.close();
    },
  };
}
