import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Response DTOs — OpenAPI documentation classes only (web-03 pipeline).
 * Controllers return the service objects untouched.
 */

export class EventRegistrationStateDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ['pending_payment', 'confirmed', 'canceled'] })
  status!: 'pending_payment' | 'confirmed' | 'canceled';

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    type: String,
    description: 'Open event-origin charge to pay (pending_payment only) — drives the Pix sheet',
  })
  chargeId!: string | null;
}

/** The gradient-banner card base every persona surface renders. */
export class EventCardDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Open mat de verão' })
  name!: string;

  @ApiProperty({ example: 'event-purple-pink', description: 'Design-system gradient slug' })
  bannerPreset!: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  location!: string | null;

  @ApiPropertyOptional({
    format: 'date-time',
    nullable: true,
    type: String,
    description: 'Null only on drafts ("Data a definir")',
  })
  startsAt!: string | null;

  @ApiPropertyOptional({ example: '2026-08-22', nullable: true, type: String, description: 'Tenant-local date' })
  date!: string | null;

  @ApiPropertyOptional({ example: '10:00', nullable: true, type: String, description: 'Tenant-local time' })
  time!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: Number,
    description: 'Integer cents; null = gratuito',
  })
  priceCents!: number | null;
}

export class EventResponsibleDto {
  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ example: 'Paulo Professor' })
  fullName!: string;
}

export class EventTotalsDto {
  @ApiProperty({ description: 'Non-canceled registrations (pending + confirmed)' })
  inscritos!: number;

  @ApiProperty()
  confirmados!: number;

  @ApiProperty({ description: 'Settled event money (paid charges; refunds excluded)' })
  arrecadadoCents!: number;
}

export class AdminEventDto extends EventCardDto {
  @ApiPropertyOptional({ nullable: true, type: String })
  description!: string | null;

  @ApiProperty({ enum: ['draft', 'published', 'canceled'] })
  status!: 'draft' | 'published' | 'canceled';

  @ApiProperty({ type: EventResponsibleDto })
  responsible!: EventResponsibleDto;

  @ApiProperty({ type: EventTotalsDto })
  totals!: EventTotalsDto;
}

export class AdminEventsResponseDto {
  @ApiProperty({ type: [AdminEventDto], description: 'Drafts first, then chronological' })
  events!: AdminEventDto[];
}

export class AdminRegistrationStudentDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  fullName!: string;
}

export class AdminRegistrationRowDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: AdminRegistrationStudentDto })
  student!: AdminRegistrationStudentDto;

  @ApiProperty({ enum: ['pending_payment', 'confirmed', 'canceled'] })
  status!: 'pending_payment' | 'confirmed' | 'canceled';

  @ApiProperty({
    type: EventResponsibleDto,
    description: 'Who confirmed — the aluno themself or the responsável',
  })
  confirmedBy!: EventResponsibleDto;

  @ApiPropertyOptional({
    nullable: true,
    type: Number,
    description: 'Settled amount for this registration (null while unpaid / free)',
  })
  paidAmountCents!: number | null;
}

export class AdminEventRegistrationsResponseDto {
  @ApiProperty({ type: AdminEventDto })
  event!: AdminEventDto;

  @ApiProperty({ type: [AdminRegistrationRowDto] })
  registrations!: AdminRegistrationRowDto[];

  @ApiProperty({ type: EventTotalsDto })
  totals!: EventTotalsDto;
}

export class AnnounceResponseDto {
  @ApiProperty({ description: 'Inscritos addressed by the queued announcement' })
  recipients!: number;
}

/** Aluno home "Próximos eventos" card + agenda/calendar month items. */
export class AlunoEventItemDto extends EventCardDto {
  @ApiPropertyOptional({ type: EventRegistrationStateDto, nullable: true })
  registration!: EventRegistrationStateDto | null;
}

/** Professor/admin calendars carry the bare dated item (no own state). */
export class CalendarEventItemDto extends EventCardDto {
  @ApiPropertyOptional({
    type: EventRegistrationStateDto,
    nullable: true,
    description: 'Own state — present on aluno surfaces only',
  })
  registration?: EventRegistrationStateDto | null;
}

export class AlunoEventDetailResponseDto extends EventCardDto {
  @ApiPropertyOptional({ nullable: true, type: String })
  description!: string | null;

  @ApiProperty({ type: EventResponsibleDto, description: 'The "Responsável: Prof. …" line' })
  responsible!: EventResponsibleDto;

  @ApiPropertyOptional({ type: EventRegistrationStateDto, nullable: true })
  registration!: EventRegistrationStateDto | null;
}

export class RegisterEventResponseDto {
  @ApiProperty({ type: EventRegistrationStateDto })
  registration!: EventRegistrationStateDto;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    type: String,
    description:
      'Paid events: pay this charge through the existing wallet rails (Pix sheet + simulate). Null on free events.',
  })
  chargeId!: string | null;
}

export class ResponsavelEventDependentDto {
  @ApiProperty({ format: 'uuid' })
  studentId!: string;

  @ApiProperty()
  fullName!: string;

  @ApiPropertyOptional({ type: EventRegistrationStateDto, nullable: true })
  registration!: EventRegistrationStateDto | null;
}

export class ResponsavelEventDto extends EventCardDto {
  @ApiPropertyOptional({ nullable: true, type: String })
  description!: string | null;

  @ApiProperty({
    type: [ResponsavelEventDependentDto],
    description: 'One chip per dependent — per-child state, per the charter',
  })
  dependents!: ResponsavelEventDependentDto[];
}

export class ResponsavelEventsResponseDto {
  @ApiProperty({ type: [ResponsavelEventDto], description: 'Published upcoming, chronological' })
  events!: ResponsavelEventDto[];
}

export class ProfessorUpcomingEventDto extends EventCardDto {
  @ApiProperty({ description: 'The "N confirmados" of the dashboard list' })
  confirmedCount!: number;
}
