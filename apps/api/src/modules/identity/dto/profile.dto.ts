import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/** The small fixed gender set (users_gender_ck) — clients render PT-BR labels. */
export const GENDER_VALUES = [
  'female',
  'male',
  'other',
  'unspecified',
] as const;
export type Gender = (typeof GENDER_VALUES)[number];

/**
 * PUT /aluno/profile body (spec 013, REP.6 — aluno-18). Every field is
 * optional (partial update); nullable fields clear with an explicit null.
 * `email` and `birthDate` are DECLARED so the whitelist pipe cannot silently
 * strip them — the service rejects their presence with a 422 (read-only
 * identity/auth facts, ignored-with-422 by decision). CPF/RG are write-once:
 * settable while NULL, 422 `profile.field_locked` on any change after.
 */
export class UpdateAlunoProfileDto {
  @ApiPropertyOptional({
    description: 'Syncs onto the linked student row in the same transaction',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName?: string;

  @ApiPropertyOptional({ enum: GENDER_VALUES, nullable: true })
  @IsOptional()
  @IsIn(GENDER_VALUES)
  gender?: Gender | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Digits, spaces, +, -, parentheses',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string | null;

  @ApiPropertyOptional({
    description:
      'Write-once. Masked or bare digits — normalized and checksum-validated',
  })
  @IsOptional()
  @IsString()
  @MaxLength(18)
  cpf?: string;

  @ApiPropertyOptional({
    description: 'Write-once. Free format (state formats vary), trimmed',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  rg?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  addressCity?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'UF — validated against the 27 federative units',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  addressState?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'CEP — masked or bare digits, normalized to 8',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  addressZip?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  emergencyContactName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  emergencyContactPhone?: string | null;

  /** Read-only — present only so the pipe cannot silently drop it (422). */
  @ApiPropertyOptional({
    description: 'Read-only — sending it is a 422 profile.field_read_only',
  })
  @IsOptional()
  email?: unknown;

  /** Read-only — present only so the pipe cannot silently drop it (422). */
  @ApiPropertyOptional({
    description: 'Read-only — sending it is a 422 profile.field_read_only',
  })
  @IsOptional()
  birthDate?: unknown;
}

export class AlunoProfileResponseDto {
  @ApiProperty()
  fullName!: string;

  @ApiProperty({ description: 'Read-only (login identity)' })
  email!: string;

  @ApiProperty({
    nullable: true,
    type: String,
    example: '2000-03-15',
    description:
      'Read-only — served from the linked student row (the age-rule authority)',
  })
  birthDate!: string | null;

  @ApiProperty({ nullable: true, type: String })
  phone!: string | null;

  @ApiProperty({ enum: GENDER_VALUES, nullable: true, type: String })
  gender!: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    description: '11 normalized digits — clients render the mask',
  })
  cpf!: string | null;

  @ApiProperty({
    description: 'True once set — the aluno-18 dashed lock state',
  })
  cpfLocked!: boolean;

  @ApiProperty({ nullable: true, type: String })
  rg!: string | null;

  @ApiProperty({
    description: 'True once set — the aluno-18 dashed lock state',
  })
  rgLocked!: boolean;

  @ApiProperty({ nullable: true, type: String })
  addressLine!: string | null;

  @ApiProperty({ nullable: true, type: String })
  addressCity!: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'UF, 2 uppercase letters',
  })
  addressState!: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'CEP, 8 normalized digits',
  })
  addressZip!: string | null;

  @ApiProperty({ nullable: true, type: String })
  emergencyContactName!: string | null;

  @ApiProperty({ nullable: true, type: String })
  emergencyContactPhone!: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Avatars stay initials in v1 (Trocar foto is a placeholder)',
  })
  avatarUrl!: string | null;
}
