import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MensalidadeAlertDto } from '../../billing/dto/responses.dto.js';
import { ScheduleSlotViewDto } from '../../enrollment/dto/responses.dto.js';
import { AlunoEventItemDto, ProfessorUpcomingEventDto } from '../../events/dto/responses.dto.js';
import { ProductCardDto } from '../../store/dto/responses.dto.js';
import { BeltViewDto, GraduationProgressDto } from '../../graduation/dto/belt.dto.js';

/**
 * Response DTOs — OpenAPI documentation classes only (web-03 pipeline).
 * Controllers return the service objects untouched; these classes keep
 * `/docs-json` truthful so the generated client contract stays drift-free.
 */

export class AlunoStatsDto {
  @ApiProperty({ minimum: 0, maximum: 100, description: 'Presença no mês (%)' })
  monthPresencePct!: number;

  @ApiProperty()
  monthAttendedSessions!: number;

  @ApiProperty({ description: 'Materialized sessions of enrolled classes, month-to-date' })
  monthTotalSessions!: number;

  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'Aulas seguidas — null when the academy disabled gamification.streak',
  })
  streak!: number | null;

  @ApiProperty({ description: 'Lifetime active attendances (graduation progress numerator)' })
  totalLessons!: number;
}

export class AttendanceRefDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  classSessionId!: string;

  @ApiProperty({ enum: ['qr', 'code', 'manual'] })
  method!: 'qr' | 'code' | 'manual';

  @ApiProperty({ format: 'date-time' })
  checkedInAt!: Date;
}

export class CheckinSessionRefDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  classId!: string;

  @ApiProperty()
  className!: string;

  @ApiProperty({ example: '2026-08-03' })
  sessionDate!: string;
}

export class CheckinResponseDto {
  @ApiProperty({
    enum: ['checked_in', 'already_checked_in'],
    description: 'Stable duplicate state — clients render "Presença registrada", never an error',
  })
  status!: 'checked_in' | 'already_checked_in';

  @ApiProperty({ type: AttendanceRefDto })
  attendance!: AttendanceRefDto;

  @ApiProperty({ type: CheckinSessionRefDto })
  session!: CheckinSessionRefDto;

  @ApiProperty({ type: AlunoStatsDto, description: 'Fresh stats — one round trip updates the pop and the tiles' })
  stats!: AlunoStatsDto;
}

export class AlunoTodayClassDto {
  @ApiProperty({ format: 'uuid' })
  classId!: string;

  @ApiProperty()
  className!: string;

  @ApiProperty({ type: ScheduleSlotViewDto })
  slot!: ScheduleSlotViewDto;

  @ApiProperty({ description: 'Hero flips to "Presença registrada" when true' })
  checkedIn!: boolean;
}

export class AlunoStudentRefDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  fullName!: string;
}

/** Home graduation card (GRD.7) — the real rule target, not the 40 placeholder. */
export class AlunoHomeGraduationDto {
  @ApiProperty({ type: BeltViewDto })
  belt!: BeltViewDto;

  @ApiProperty({ type: GraduationProgressDto })
  progress!: GraduationProgressDto;
}

export class AlunoHomeResponseDto {
  @ApiProperty({ type: AlunoStudentRefDto })
  student!: AlunoStudentRefDto;

  @ApiPropertyOptional({ type: AlunoTodayClassDto, nullable: true })
  todayClass!: AlunoTodayClassDto | null;

  @ApiProperty({ type: AlunoStatsDto })
  stats!: AlunoStatsDto;

  @ApiPropertyOptional({
    type: AlunoHomeGraduationDto,
    description: 'Derived belt + progress against the academy rule (GRD.7)',
  })
  graduation?: AlunoHomeGraduationDto;

  @ApiPropertyOptional({
    type: MensalidadeAlertDto,
    nullable: true,
    description:
      'Real "mensalidade em aberto" alert (spec 006) deep-linking into the Carteira; null = nothing open',
  })
  mensalidade!: MensalidadeAlertDto | null;

  @ApiProperty({
    type: [AlunoEventItemDto],
    description:
      '"Próximos eventos": the next 2 published events with own registration state (spec 008)',
  })
  upcomingEvents!: AlunoEventItemDto[];

  @ApiProperty({
    type: [ProductCardDto],
    description:
      '"Loja da academia" strip: the first 3 active store products + "Ver tudo" (spec 009 — additive)',
  })
  storeStrip!: ProductCardDto[];
}

export class LiveSessionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  classId!: string;

  @ApiProperty()
  className!: string;

  @ApiProperty({ example: '2026-08-03' })
  sessionDate!: string;

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  startsAt!: Date | null;

  @ApiProperty({ enum: ['scheduled', 'done', 'canceled'] })
  status!: string;
}

export class LiveCodeResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: '4821', description: 'The 4-digit human code' })
  code!: string;

  @ApiProperty({ description: 'Opaque token the QR encodes — never the digits' })
  qrToken!: string;

  @ApiProperty({ format: 'date-time', description: 'Slot end + 15 min grace (fallback: +60 min)' })
  expiresAt!: Date;

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  revokedAt!: Date | null;

  @ApiProperty({ type: LiveSessionDto })
  session!: LiveSessionDto;

  @ApiProperty({ description: 'Active attendances on the session' })
  presentCount!: number;
}

export class SnapshotAttendanceDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  studentId!: string;

  @ApiProperty()
  studentName!: string;

  @ApiProperty({ enum: ['qr', 'code', 'manual'] })
  method!: 'qr' | 'code' | 'manual';

  @ApiProperty({ format: 'date-time' })
  checkedInAt!: Date;
}

export class SnapshotCodeDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: Date;

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  revokedAt!: Date | null;
}

export class LiveSnapshotResponseDto {
  @ApiProperty()
  presentCount!: number;

  @ApiProperty({ type: SnapshotCodeDto })
  code!: SnapshotCodeDto;

  @ApiProperty({ type: [SnapshotAttendanceDto], description: 'Active rows only, oldest first' })
  attendances!: SnapshotAttendanceDto[];
}

export class StreamTicketResponseDto {
  @ApiProperty({ description: 'HMAC-signed single-purpose ticket — pass as ?ticket= on the stream route only' })
  ticket!: string;

  @ApiProperty({ example: 60 })
  expiresInSeconds!: number;
}

/**
 * SSE `checkin` event payload — component schema for the stream route, the
 * documented exception to the generated REST contract (be-09): clients wire
 * their own EventSource/OkHttp/URLSession primitive against this shape.
 */
export class LiveStreamCheckinEventDto {
  @ApiProperty({ format: 'uuid' })
  attendanceId!: string;

  @ApiProperty({ format: 'uuid' })
  studentId!: string;

  @ApiProperty()
  studentName!: string;

  @ApiProperty({ enum: ['qr', 'code', 'manual'] })
  method!: 'qr' | 'code' | 'manual';

  @ApiProperty({ format: 'date-time' })
  checkedInAt!: string;

  @ApiProperty({ description: 'Active attendances after this event' })
  presentCount!: number;
}

/** SSE `revoke` event payload — voids decrement the counter. */
export class LiveStreamRevokeEventDto {
  @ApiProperty({ format: 'uuid' })
  attendanceId!: string;

  @ApiProperty({ description: 'Active attendances after this event' })
  presentCount!: number;
}

export class RosterAttendanceDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ['qr', 'code', 'manual'] })
  method!: 'qr' | 'code' | 'manual';

  @ApiProperty({ format: 'date-time' })
  checkedInAt!: Date;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    type: String,
    description: 'NULL = self check-in; set = professor-recorded manual row',
  })
  recordedByUserId!: string | null;
}

export class RosterRowDto {
  @ApiProperty({ format: 'uuid' })
  studentId!: string;

  @ApiProperty()
  fullName!: string;

  @ApiPropertyOptional({ type: BeltViewDto, description: 'Derived current belt (GRD.6)' })
  belt?: BeltViewDto;

  @ApiPropertyOptional({ type: RosterAttendanceDto, nullable: true })
  attendance!: RosterAttendanceDto | null;
}

export class RollCallResponseDto {
  @ApiProperty({ type: LiveSessionDto })
  session!: LiveSessionDto;

  @ApiProperty({ description: '"N presentes de M" numerator' })
  presentCount!: number;

  @ApiProperty({ type: [RosterRowDto], description: 'Self check-ins appear pre-toggled' })
  roster!: RosterRowDto[];
}

export class MarkAttendanceResultDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  classSessionId!: string;

  @ApiProperty({ format: 'uuid' })
  studentId!: string;

  @ApiProperty({ format: 'date-time' })
  checkedInAt!: Date;
}

export class MarkAttendanceResponseDto {
  @ApiProperty({ enum: ['checked_in', 'already_checked_in'] })
  status!: 'checked_in' | 'already_checked_in';

  @ApiProperty({ type: MarkAttendanceResultDto })
  attendance!: MarkAttendanceResultDto;

  @ApiProperty()
  presentCount!: number;
}

export class RevokeAttendanceResponseDto {
  @ApiProperty({ enum: ['revoked', 'already_revoked'], description: 'A second toggle-off is benign' })
  status!: 'revoked' | 'already_revoked';

  @ApiProperty({ format: 'uuid' })
  attendanceId!: string;

  @ApiProperty()
  presentCount!: number;
}

export class ProfessorNextClassDto {
  @ApiProperty({ format: 'uuid' })
  classId!: string;

  @ApiProperty()
  className!: string;

  @ApiProperty({ type: ScheduleSlotViewDto })
  slot!: ScheduleSlotViewDto;

  @ApiProperty({ description: "Today's session check-in count when one exists, else 0" })
  checkedInCount!: number;
}

export class ProfessorTodayClassDto extends ProfessorNextClassDto {
  @ApiProperty()
  enrolledCount!: number;
}

export class ProfessorDashboardResponseDto {
  @ApiProperty({ description: "Distinct students with an active check-in today across own classes" })
  alunosHoje!: number;

  @ApiProperty({ minimum: 0, maximum: 100 })
  presencaMediaPct!: number;

  @ApiPropertyOptional({ type: ProfessorNextClassDto, nullable: true })
  nextClass!: ProfessorNextClassDto | null;

  @ApiProperty({ type: [ProfessorTodayClassDto] })
  todayClasses!: ProfessorTodayClassDto[];

  @ApiProperty({ description: 'The "eventos futuros" stat tile (spec 008)' })
  upcomingEventsCount!: number;

  @ApiProperty({
    type: [ProfessorUpcomingEventDto],
    description: '"Eventos futuros" list — read-only academy-wide data (spec 008)',
  })
  upcomingEvents!: ProfessorUpcomingEventDto[];
}

export class ProfessorStudentDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty({ example: '2010-04-20' })
  birthDate!: string;

  @ApiProperty({ enum: ['ativo', 'pendente'] })
  badge!: 'ativo' | 'pendente';

  @ApiPropertyOptional({ type: BeltViewDto, description: 'Derived current belt (GRD.6)' })
  belt?: BeltViewDto;
}

export class ProfessorStudentsResponseDto {
  @ApiProperty({ type: [ProfessorStudentDto] })
  students!: ProfessorStudentDto[];
}

export class AdminSessionRowDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: '2026-08-03' })
  sessionDate!: string;

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  startsAt!: Date | null;

  @ApiProperty({ enum: ['scheduled', 'done', 'canceled'] })
  status!: 'scheduled' | 'done' | 'canceled';

  @ApiProperty({ description: 'Active (non-revoked) attendance count' })
  presentCount!: number;
}

export class AdminSessionListResponseDto {
  @ApiProperty({ type: [AdminSessionRowDto], description: 'Newest first' })
  sessions!: AdminSessionRowDto[];
}
