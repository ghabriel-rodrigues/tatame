import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AlunoStatsDto } from '../../attendance/dto/responses.dto.js';
import { BeltRefDto, BeltViewDto, GraduationProgressDto, NextMilestoneDto } from './belt.dto.js';

/**
 * Response DTOs — OpenAPI documentation classes only (web-03 pipeline). The
 * controllers return the service objects untouched; these classes keep
 * `/docs-json` truthful so the generated client contract stays drift-free.
 */

export { BeltRefDto, BeltViewDto, GraduationProgressDto, NextMilestoneDto };

export class GraduationActorDto {
  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty()
  fullName!: string;
}

export class GraduationEntryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ['degree', 'belt', 'revocation'] })
  kind!: 'degree' | 'belt' | 'revocation';

  @ApiProperty({ type: BeltRefDto })
  belt!: BeltRefDto;

  @ApiProperty({ description: '0 on belt promotions and revocations' })
  degree!: number;

  @ApiProperty({ format: 'date-time' })
  awardedAt!: Date;

  @ApiProperty({ type: GraduationActorDto })
  awardedBy!: GraduationActorDto;

  @ApiProperty({ nullable: true, type: String })
  notes!: string | null;

  @ApiProperty({ description: 'Award reversed by a later revocation compensation row' })
  reversed!: boolean;

  @ApiProperty({ format: 'uuid', nullable: true, type: String, description: 'Set on revocation rows' })
  reversesGraduationId!: string | null;

  @ApiProperty({
    description: 'Render-only "Ver certificado" placeholder — non-reversed belt awards only',
  })
  certificateAvailable!: boolean;
}

export class AlunoGraduationResponseDto {
  @ApiProperty({ type: BeltViewDto, description: 'FAIXA ATUAL hero payload' })
  belt!: BeltViewDto;

  @ApiProperty({ type: GraduationProgressDto })
  progress!: GraduationProgressDto;

  @ApiProperty({ type: [GraduationEntryDto], description: 'Histórico de evolução, newest first' })
  timeline!: GraduationEntryDto[];
}

export class AwardGraduationResponseDto {
  @ApiProperty({ type: GraduationEntryDto })
  graduation!: GraduationEntryDto;

  @ApiProperty({ type: BeltViewDto, description: 'Freshly derived current belt after the award' })
  belt!: BeltViewDto;
}

export class RevokeGraduationResponseDto {
  @ApiProperty({ enum: ['revoked'] })
  status!: 'revoked';

  @ApiProperty({ format: 'uuid', description: 'The reversed award row' })
  graduationId!: string;

  @ApiProperty({ format: 'uuid', description: 'The appended compensation row' })
  revocationId!: string;

  @ApiProperty({ type: BeltViewDto, description: 'Restored current belt after the reversal' })
  belt!: BeltViewDto;
}

export class GraduationHistoryResponseDto {
  @ApiProperty({ type: [GraduationEntryDto], description: 'Full history incl. revocations' })
  graduations!: GraduationEntryDto[];
}

export class GraduationRuleRowDto extends BeltRefDto {
  @ApiProperty({ enum: ['adult', 'kids'] })
  ladderKind!: 'adult' | 'kids';

  @ApiProperty({ description: 'Aulas por grau — default 40 when no override row exists' })
  lessonsPerDegree!: number;

  @ApiProperty()
  enabled!: boolean;

  @ApiProperty({ description: 'Only kids-ladder belts render a toggle' })
  toggleable!: boolean;
}

export class GraduationRulesResponseDto {
  @ApiProperty({
    type: [GraduationRuleRowDto],
    description: 'Merged ladder in the handoff régua display order',
  })
  rules!: GraduationRuleRowDto[];
}

export class StudentNoteDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  body!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: GraduationActorDto })
  author!: GraduationActorDto;
}

export class StudentNotesResponseDto {
  @ApiProperty({ type: [StudentNoteDto], description: 'Newest first' })
  notes!: StudentNoteDto[];
}

export class StudentNoteResponseDto {
  @ApiProperty({ type: StudentNoteDto })
  note!: StudentNoteDto;
}

export class ProfileStudentDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty({ example: '2000-03-15' })
  birthDate!: string;

  @ApiProperty({ enum: ['active', 'inactive'] })
  status!: 'active' | 'inactive';

  @ApiProperty({ enum: ['ativo', 'pendente'] })
  badge!: 'ativo' | 'pendente';
}

export class StudentProfileResponseDto {
  @ApiProperty({ type: ProfileStudentDto })
  student!: ProfileStudentDto;

  @ApiProperty({ type: BeltViewDto })
  belt!: BeltViewDto;

  @ApiProperty({ type: GraduationProgressDto })
  progress!: GraduationProgressDto;

  @ApiProperty({ type: AlunoStatsDto, description: 'Phase-4 attendance stat tiles' })
  stats!: AlunoStatsDto;

  @ApiProperty({ type: [StudentNoteDto], description: 'Observações, newest first' })
  notes!: StudentNoteDto[];
}

export class ValidGraduationDto extends BeltRefDto {
  @ApiProperty({ enum: ['adult', 'kids'] })
  ladderKind!: 'adult' | 'kids';

  @ApiProperty({ description: 'Kids belts reflect the admin toggles (dimmed when false)' })
  enabled!: boolean;
}

export class ProfessorProfileResponseDto {
  @ApiProperty({ type: GraduationActorDto })
  professor!: GraduationActorDto;

  @ApiPropertyOptional({
    type: BeltViewDto,
    nullable: true,
    description: 'Display-only membership rank chip — null when unset',
  })
  belt!: BeltViewDto | null;

  @ApiProperty({ type: [ValidGraduationDto], description: 'Graduações válidas (merged régua)' })
  validGraduations!: ValidGraduationDto[];
}
