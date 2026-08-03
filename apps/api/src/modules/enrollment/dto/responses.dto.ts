import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Response DTOs — OpenAPI documentation classes only (web-03 pipeline). The
 * controllers return the service objects untouched; these classes keep
 * `/docs-json` truthful so the generated client contract stays drift-free.
 */

export class ClassRefDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;
}

export class StudentListItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty({ example: '2010-04-20' })
  birthDate!: string;

  @ApiProperty({ enum: ['active', 'inactive'] })
  status!: 'active' | 'inactive';

  @ApiProperty({
    enum: ['ativo', 'pendente'],
    description: 'Derived: pendente = record not yet claimed by a login',
  })
  badge!: 'ativo' | 'pendente';

  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  guardianId!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  userId!: string | null;

  @ApiProperty({ type: [ClassRefDto], description: 'Active enrollments' })
  classes!: ClassRefDto[];
}

export class StudentListResponseDto {
  @ApiProperty({ type: [StudentListItemDto] })
  students!: StudentListItemDto[];
}

export class StudentResponseDto {
  @ApiProperty({ type: StudentListItemDto })
  student!: StudentListItemDto;
}

export class GuardianListItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty({ nullable: true, type: String })
  phone!: string | null;

  @ApiProperty({ nullable: true, type: String })
  email!: string | null;

  @ApiProperty({ enum: ['ativo', 'pendente'] })
  badge!: 'ativo' | 'pendente';

  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  userId!: string | null;

  @ApiProperty()
  dependentCount!: number;
}

export class GuardianListResponseDto {
  @ApiProperty({ type: [GuardianListItemDto] })
  guardians!: GuardianListItemDto[];
}

export class GuardianResponseDto {
  @ApiProperty({ type: GuardianListItemDto })
  guardian!: GuardianListItemDto;
}

export class ProfessorListItemDto {
  @ApiProperty({ format: 'uuid' })
  membershipId!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ description: 'Membership status' })
  status!: string;
}

export class ProfessorListResponseDto {
  @ApiProperty({ type: [ProfessorListItemDto] })
  professors!: ProfessorListItemDto[];
}

export class RegisterProfessorResponseDto {
  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ format: 'uuid' })
  membershipId!: string;

  @ApiProperty({ description: 'False when an existing account was reused by email' })
  userCreated!: boolean;

  @ApiProperty({
    description: 'True when the set-your-password email was dispatched (no credential yet)',
  })
  passwordEmailSent!: boolean;
}

export class ScheduleSlotViewDto {
  @ApiProperty({ minimum: 0, maximum: 6, description: '0 = Sunday … 6 = Saturday' })
  weekday!: number;

  @ApiProperty({ example: '19:00' })
  startTime!: string;

  @ApiProperty()
  durationMinutes!: number;
}

export class ClassProfessorDto {
  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty()
  fullName!: string;
}

export class ClassListItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: ['active', 'archived'] })
  status!: 'active' | 'archived';

  @ApiProperty()
  capacity!: number;

  @ApiProperty({ description: 'Active enrollment count — server-derived' })
  occupancy!: number;

  @ApiProperty({ description: 'Derived: occupancy ≥ capacity' })
  lotada!: boolean;

  @ApiProperty({ nullable: true, type: Number })
  ageMin!: number | null;

  @ApiProperty({ nullable: true, type: Number })
  ageMax!: number | null;

  @ApiProperty({ type: ClassProfessorDto })
  professor!: ClassProfessorDto;

  @ApiProperty({ type: [ScheduleSlotViewDto] })
  schedules!: ScheduleSlotViewDto[];
}

export class ClassListResponseDto {
  @ApiProperty({ type: [ClassListItemDto] })
  classes!: ClassListItemDto[];
}

export class RosterStudentDto {
  @ApiProperty({ format: 'uuid' })
  studentId!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty({ example: '2010-04-20' })
  birthDate!: string;

  @ApiProperty({ enum: ['ativo', 'pendente'] })
  badge!: 'ativo' | 'pendente';
}

export class ClassDetailDto extends ClassListItemDto {
  @ApiProperty({ type: [RosterStudentDto], description: 'Active roster' })
  roster!: RosterStudentDto[];
}

export class ClassDetailResponseDto {
  @ApiProperty({ type: ClassDetailDto })
  class!: ClassDetailDto;
}

export class EnrollmentResultDto {
  @ApiProperty({ format: 'uuid' })
  classId!: string;

  @ApiProperty({ format: 'uuid' })
  studentId!: string;

  @ApiProperty({ enum: ['active', 'removed'] })
  status!: 'active' | 'removed';
}

export class EnrollmentResultResponseDto {
  @ApiProperty({ type: EnrollmentResultDto })
  enrollment!: EnrollmentResultDto;
}

export class MoveStudentsResponseDto {
  @ApiProperty({ format: 'uuid' })
  destinationClassId!: string;

  @ApiProperty({ type: [String], description: 'Every selected student — the move is atomic' })
  movedStudentIds!: string[];
}

export class DependentClassDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: [ScheduleSlotViewDto] })
  schedules!: ScheduleSlotViewDto[];

  @ApiProperty({
    type: ScheduleSlotViewDto,
    nullable: true,
    description: 'Next scheduled slot, server-derived',
  })
  nextSlot!: ScheduleSlotViewDto | null;
}

export class DependentDetailDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty({ example: '2017-06-10' })
  birthDate!: string;

  @ApiProperty({ enum: ['active', 'inactive'] })
  status!: 'active' | 'inactive';

  @ApiProperty({ type: DependentClassDto, nullable: true, description: 'Active class if enrolled' })
  class!: DependentClassDto | null;
}

export class DependentListResponseDto {
  @ApiProperty({ type: [DependentDetailDto] })
  dependents!: DependentDetailDto[];
}

export class DependentResponseDto {
  @ApiProperty({ type: DependentDetailDto })
  dependent!: DependentDetailDto;
}

export class RegisterDependentResponseDto {
  @ApiProperty({ type: DependentDetailDto })
  dependent!: DependentDetailDto;

  @ApiProperty({
    description: 'False when no class was accepted or the accepted class was full (story 34)',
  })
  enrolled!: boolean;
}

export class ClassSuggestionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true, type: Number })
  ageMin!: number | null;

  @ApiProperty({ nullable: true, type: Number })
  ageMax!: number | null;

  @ApiProperty()
  capacity!: number;

  @ApiProperty()
  occupancy!: number;

  @ApiProperty({ type: [ScheduleSlotViewDto] })
  schedules!: ScheduleSlotViewDto[];
}

export class ClassSuggestionResponseDto {
  @ApiPropertyOptional({
    type: ClassSuggestionDto,
    nullable: true,
    description: 'Null when no active age-matching class with a free slot exists',
  })
  suggestion!: ClassSuggestionDto | null;
}
