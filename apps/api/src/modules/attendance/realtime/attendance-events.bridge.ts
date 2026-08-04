import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ATTENDANCE_CHECKIN_RECORDED,
  ATTENDANCE_REVOKED,
  type AttendanceRevokedEvent,
  type CheckinRecordedEvent,
} from '../attendance.events.js';
import { LiveRoomRegistry } from './live-room.registry.js';

/**
 * Post-commit bridge (be-09): services emit domain events on the
 * `@nestjs/event-emitter` bus only AFTER `withTenant` resolves (transaction
 * committed), and this bridge fans them out to the per-session rooms — so a
 * stream can never observe a check-in that later rolled back, and only
 * accepted check-ins (past the unique-constraint gate) ever reach the mat
 * screen. Tenancy note: subscribers were admitted by the stream ticket, which
 * binds the tenant; events carry `tenantId` for defense-in-depth but rooms
 * are already tenant-pure because session ids never cross tenants.
 */
@Injectable()
export class AttendanceEventsBridge {
  constructor(private readonly rooms: LiveRoomRegistry) {}

  @OnEvent(ATTENDANCE_CHECKIN_RECORDED)
  onCheckin(event: CheckinRecordedEvent): void {
    this.rooms.publish(event.classSessionId, {
      type: 'checkin',
      data: {
        attendanceId: event.attendanceId,
        studentId: event.studentId,
        studentName: event.studentName,
        method: event.method,
        checkedInAt: event.checkedInAt,
        presentCount: event.presentCount,
      },
    });
  }

  @OnEvent(ATTENDANCE_REVOKED)
  onRevoke(event: AttendanceRevokedEvent): void {
    this.rooms.publish(event.classSessionId, {
      type: 'revoke',
      data: { attendanceId: event.attendanceId, presentCount: event.presentCount },
    });
  }
}
