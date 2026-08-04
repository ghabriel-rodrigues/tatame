/**
 * Domain events for the attendance slice (spec 004, resolved realtime
 * decision be-09). Services emit these on the `@nestjs/event-emitter` bus
 * AFTER the tenant transaction commits — the SSE bridge forwards them to the
 * in-process per-session rooms, so only accepted (committed) check-ins ever
 * reach a stream.
 */

export const ATTENDANCE_CHECKIN_RECORDED = 'attendance.checkin.recorded';
export const ATTENDANCE_REVOKED = 'attendance.revoked';

/** SSE `checkin` event payload (component schema in the OpenAPI document). */
export interface CheckinRecordedEvent {
  tenantId: string;
  classSessionId: string;
  attendanceId: string;
  studentId: string;
  studentName: string;
  method: 'qr' | 'code' | 'manual';
  /** ISO instant. */
  checkedInAt: string;
  /** Active attendances on the session, post-commit. */
  presentCount: number;
}

/** SSE `revoke` event payload — voids decrement the counter. */
export interface AttendanceRevokedEvent {
  tenantId: string;
  classSessionId: string;
  attendanceId: string;
  presentCount: number;
}
