import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  PLATFORM_ROLES,
  type PlatformRole,
} from '../../../common/decorators.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const emptyToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

/** plataforma-08 "Registrar academia" — owner only; starts the academy on Trial. */
export class RegisterAcademyDto {
  @ApiProperty({ minLength: 2, maxLength: 80, example: 'Horizonte BJJ' })
  @Transform(trim)
  @IsString()
  @Length(2, 80)
  name!: string;

  @ApiProperty({ nullable: true, type: String, example: 'São Paulo / SP' })
  @Transform(emptyToNull)
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @Length(2, 80)
  city!: string | null;

  @ApiProperty({ example: 'admin@horizontebjj.com.br' })
  @Transform(trim)
  @IsEmail()
  adminEmail!: string;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Admin display name; falls back to the academy name',
  })
  @Transform(emptyToNull)
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @Length(2, 120)
  adminFullName?: string | null;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  platformPlanId!: string;
}

/** Next-cycle plan change; `null` cancels a scheduled one. */
export class SchedulePlanChangeDto {
  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  @ValidateIf((_object, value) => value !== null)
  @IsUUID()
  platformPlanId!: string | null;
}

/** plataforma-06/07 — the plan editor. `feeBps` is contractual, not editable. */
export class PlatformPlanWriteDto {
  @ApiProperty({ minLength: 2, maxLength: 40, example: 'Pro' })
  @Transform(trim)
  @IsString()
  @Length(2, 40)
  name!: string;

  @ApiProperty({
    minimum: 0,
    example: 19_900,
    description: 'Monthly price in cents',
  })
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  priceCents!: number;

  @ApiProperty({
    nullable: true,
    type: Number,
    minimum: 1,
    description: 'null = unlimited students',
  })
  @ValidateIf((_object, value) => value !== null)
  @IsInt()
  @Min(1)
  studentLimit!: number | null;

  @ApiProperty({
    type: [String],
    description: 'Feature registry slugs; unknown slugs are rejected',
    example: ['attendance', 'graduations'],
  })
  @IsArray()
  @IsString({ each: true })
  features!: string[];
}

/** plataforma-10 "Convidar" — owner only. */
export class InviteTeamMemberDto {
  @ApiProperty({ minLength: 2, maxLength: 120, example: 'Paula Andrade' })
  @Transform(trim)
  @IsString()
  @Length(2, 120)
  fullName!: string;

  @ApiProperty({ example: 'paula@tatame.app' })
  @Transform(trim)
  @IsEmail()
  email!: string;

  @ApiProperty({ enum: PLATFORM_ROLES, example: 'support' })
  @IsIn([...PLATFORM_ROLES])
  role!: PlatformRole;
}
