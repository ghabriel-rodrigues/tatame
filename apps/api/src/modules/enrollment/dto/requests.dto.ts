import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** List filter shared by the students and classes segments. */
export class StatusFilterQueryDto {
  @ApiPropertyOptional({
    enum: ['active', 'inactive', 'all'],
    description: 'Default `active` — archived records are hidden from active listings',
  })
  @IsOptional()
  @IsIn(['active', 'inactive', 'all'])
  status?: 'active' | 'inactive' | 'all';
}

export class CreateStudentDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  fullName!: string;

  @ApiProperty({ example: '2010-04-20' })
  @IsDateString()
  birthDate!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Required when the student is a minor (minor ⇒ guardian rule)',
  })
  @IsOptional()
  @IsUUID()
  guardianId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Optional initial belt (transfer students, story 32): seeds one audited belt award. ' +
      'Left empty, the student starts white. Must be an enabled catalog belt.',
  })
  @IsOptional()
  @IsUUID()
  initialBeltId?: string;
}

export class CreateGuardianDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  fullName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;
}

export class RegisterProfessorDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  fullName!: string;

  @ApiProperty({ description: 'Reused cross-tenant when an account already exists' })
  @IsEmail()
  email!: string;
}

/** Name-only editing across all registry types (handoff design backlog). */
export class UpdateNameDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  fullName!: string;
}

/** Name-only editing for turmas. */
export class UpdateClassNameDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  name!: string;
}

/** One weekday chip — fans out into a class_schedules row. */
export class ScheduleSlotDto {
  @ApiProperty({ minimum: 0, maximum: 6, description: '0 = Sunday … 6 = Saturday' })
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  @ApiProperty({ example: '19:00', description: 'HH:MM (24h)' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'startTime must be HH:MM (24h)' })
  startTime!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  durationMinutes!: number;
}

export class CreateClassDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ format: 'uuid', description: 'Must hold an active professor membership' })
  @IsUUID()
  professorUserId!: string;

  @ApiProperty({ minimum: 1, description: 'Student limit — "Lotada" when reached' })
  @IsInt()
  @Min(1)
  capacity!: number;

  @ApiPropertyOptional({ minimum: 0, description: 'Optional age range (Kids chip)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  ageMin?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  ageMax?: number;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Turma belt range floor — catalog belt ("Branca a Azul" chips, GRD.6)',
  })
  @IsOptional()
  @IsUUID()
  minBeltId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Turma belt range ceiling — catalog belt' })
  @IsOptional()
  @IsUUID()
  maxBeltId?: string;

  @ApiProperty({ type: [ScheduleSlotDto], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ScheduleSlotDto)
  schedules!: ScheduleSlotDto[];
}

export class AddRosterStudentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  studentId!: string;
}

export class MoveStudentsDto {
  @ApiProperty({ type: [String], format: 'uuid', minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  studentIds!: string[];

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  destinationClassId!: string;
}

export class RegisterDependentDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  fullName!: string;

  @ApiProperty({ example: '2017-06-10' })
  @IsDateString()
  birthDate!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Accepted age-suggested class. Registration succeeds even when it is full — the enrollment is skipped (story 34).',
  })
  @IsOptional()
  @IsUUID()
  classId?: string;
}

export class ClassSuggestionQueryDto {
  @ApiProperty({ example: '2017-06-10' })
  @IsDateString()
  birthDate!: string;
}
