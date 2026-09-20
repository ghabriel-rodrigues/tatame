import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AlunoEventItemDto,
  CalendarEventItemDto,
} from '../../events/dto/responses.dto.js';
import { BeltRefDto } from '../../graduation/dto/belt.dto.js';

/**
 * Response DTOs — OpenAPI documentation classes only (web-03 pipeline).
 * Controllers return the service objects untouched.
 */

export class AgendaOccupancyDto {
  @ApiProperty({
    description: 'Active enrollments — the "N" of the "N de M" chip',
  })
  active!: number;

  @ApiProperty()
  capacity!: number;
}

export class AlunoAgendaClassDto {
  @ApiProperty({ format: 'uuid' })
  classId!: string;

  @ApiProperty()
  className!: string;

  @ApiProperty({ example: '19:00' })
  startTime!: string;

  @ApiProperty({ example: '20:00', description: 'Slot start + duration' })
  endTime!: string;

  @ApiProperty()
  professorName!: string;

  @ApiProperty({ nullable: true, type: Number })
  ageMin!: number | null;

  @ApiProperty({ nullable: true, type: Number })
  ageMax!: number | null;

  @ApiPropertyOptional({
    type: BeltRefDto,
    nullable: true,
    description: 'Level chip lower bound; both ends null = "Todas as faixas"',
  })
  minBelt!: BeltRefDto | null;

  @ApiPropertyOptional({ type: BeltRefDto, nullable: true })
  maxBelt!: BeltRefDto | null;

  @ApiProperty({ type: AgendaOccupancyDto })
  occupancy!: AgendaOccupancyDto;

  @ApiProperty({
    description:
      "True iff today's session exists AND the caller holds an active (non-revoked) attendance " +
      'on it. Always false off-today — clients render the button iff `isToday && !checkedIn`.',
  })
  checkedIn!: boolean;
}

export class AlunoAgendaResponseDto {
  @ApiProperty({
    minimum: 0,
    maximum: 6,
    description: '0 = Sunday … 6 = Saturday',
  })
  weekday!: number;

  @ApiProperty({
    description: 'Whether the returned weekday is today in the tenant timezone',
  })
  isToday!: boolean;

  @ApiProperty({
    type: [AlunoAgendaClassDto],
    description: 'Sorted by start time',
  })
  classes!: AlunoAgendaClassDto[];

  @ApiProperty({
    type: [AlunoEventItemDto],
    description:
      '"Eventos do mês": the current tenant-local month\'s published events with own state (spec 008)',
  })
  events!: AlunoEventItemDto[];
}

export class CalendarClassItemDto {
  @ApiProperty({ format: 'uuid' })
  classId!: string;

  @ApiProperty()
  className!: string;

  @ApiProperty({ example: '19:00' })
  startTime!: string;

  @ApiProperty({ example: '20:00' })
  endTime!: string;

  @ApiProperty()
  professorName!: string;

  @ApiProperty({ type: AgendaOccupancyDto })
  occupancy!: AgendaOccupancyDto;
}

/** Weekly recurrence buckets — clients expand dots over the month grid. */
export class CalendarBucketsDto {
  @ApiProperty({ type: [CalendarClassItemDto], description: 'Sunday' })
  '0'!: CalendarClassItemDto[];

  @ApiProperty({ type: [CalendarClassItemDto], description: 'Monday' })
  '1'!: CalendarClassItemDto[];

  @ApiProperty({ type: [CalendarClassItemDto], description: 'Tuesday' })
  '2'!: CalendarClassItemDto[];

  @ApiProperty({ type: [CalendarClassItemDto], description: 'Wednesday' })
  '3'!: CalendarClassItemDto[];

  @ApiProperty({ type: [CalendarClassItemDto], description: 'Thursday' })
  '4'!: CalendarClassItemDto[];

  @ApiProperty({ type: [CalendarClassItemDto], description: 'Friday' })
  '5'!: CalendarClassItemDto[];

  @ApiProperty({ type: [CalendarClassItemDto], description: 'Saturday' })
  '6'!: CalendarClassItemDto[];
}

export class CalendarResponseDto {
  @ApiProperty({
    example: '2026-08',
    description: 'Echoed (or current tenant-local) month',
  })
  month!: string;

  @ApiProperty({ type: CalendarBucketsDto })
  classesByWeekday!: CalendarBucketsDto;

  @ApiProperty({
    type: [CalendarEventItemDto],
    description:
      "The requested month's published events as dated items (tenant-timezone bucketing) — the " +
      'pink dots. Aluno items carry own registration state (spec 008).',
  })
  events!: CalendarEventItemDto[];
}
