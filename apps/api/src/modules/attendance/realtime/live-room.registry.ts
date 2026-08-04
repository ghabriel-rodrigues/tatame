import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { defer, finalize, Observable, Subject } from 'rxjs';

/** One serialized SSE frame: `event: <type>` + `data: <json>`. */
export interface LiveRoomEvent {
  type: 'checkin' | 'revoke';
  data: Record<string, unknown>;
}

interface Room {
  subject: Subject<LiveRoomEvent>;
  subscribers: number;
}

/**
 * In-process per-session rooms for the live chamada stream (be-09). Single
 * API instance in v1 — if the API ever scales horizontally this registry is
 * the interface a Redis pub/sub adapter replaces (noted future swap, not
 * built now). Rooms are keyed by class-session id (the durable identity;
 * reopening mints a new live code but the mat is the same) and are created
 * on first subscription and dropped with the last unsubscribe.
 */
@Injectable()
export class LiveRoomRegistry implements OnModuleDestroy {
  private readonly rooms = new Map<string, Room>();

  publish(classSessionId: string, event: LiveRoomEvent): void {
    this.rooms.get(classSessionId)?.subject.next(event);
  }

  subscribe(classSessionId: string): Observable<LiveRoomEvent> {
    return defer(() => {
      const existing = this.rooms.get(classSessionId);
      const room: Room = existing ?? { subject: new Subject<LiveRoomEvent>(), subscribers: 0 };
      if (!existing) this.rooms.set(classSessionId, room);
      room.subscribers += 1;
      return room.subject.asObservable().pipe(
        finalize(() => {
          room.subscribers -= 1;
          if (room.subscribers <= 0 && this.rooms.get(classSessionId) === room) {
            this.rooms.delete(classSessionId);
          }
        }),
      );
    });
  }

  /** Test/observability hook. */
  roomCount(): number {
    return this.rooms.size;
  }

  onModuleDestroy(): void {
    for (const room of this.rooms.values()) room.subject.complete();
    this.rooms.clear();
  }
}
