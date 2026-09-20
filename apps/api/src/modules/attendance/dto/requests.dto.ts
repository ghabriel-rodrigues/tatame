import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

/** One check-in endpoint, three methods (spec 004, ATT.7). */
export class CheckinRequestDto {
  @ApiProperty({ enum: ['qr', 'code', 'manual'] })
  @IsIn(['qr', 'code', 'manual'])
  method!: 'qr' | 'code' | 'manual';

  @ApiPropertyOptional({
    description: 'Opaque token scanned from the QR (method=qr)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  qrToken?: string;

  @ApiPropertyOptional({
    example: '4821',
    description: '4-digit live code (method=code)',
  })
  @IsOptional()
  @Matches(/^\d{4}$/, { message: 'code must be exactly 4 digits' })
  code?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Class to check into (method=manual — location step is a client stub)',
  })
  @IsOptional()
  @IsUUID()
  classId?: string;
}

export class MarkAttendanceDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  studentId!: string;
}

export class RevokeAttendanceDto {
  @ApiPropertyOptional({ description: 'Free-text audit reason' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ProfessorStudentsQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Return only students NOT actively enrolled in this class (must be taught by the caller — the "Adicionar aluno" picker)',
  })
  @IsOptional()
  @IsUUID()
  notEnrolledInClassId?: string;
}
