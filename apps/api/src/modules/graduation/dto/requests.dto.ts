import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

/** Add degree / promote belt — one payload for both actions (GRD.8). */
export class AwardGraduationDto {
  @ApiProperty({
    enum: ['degree', 'belt'],
    description: 'degree = one more stripe on the current belt; belt = promotion (degrees reset)',
  })
  @IsIn(['degree', 'belt'])
  kind!: 'degree' | 'belt';

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Target belt — required for kind=belt (any enabled, non-current catalog belt)',
  })
  @ValidateIf((dto: AwardGraduationDto) => dto.kind === 'belt')
  @IsUUID()
  beltId?: string;

  @ApiPropertyOptional({ description: 'Observação carried on the timeline entry' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

/** Admin-only compensation-row revocation (GRD.9). */
export class RevokeGraduationDto {
  @ApiPropertyOptional({ description: 'Audited reason ("who and why", story 31)' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

export class GraduationRuleEntryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  beltId!: string;

  @ApiProperty({
    minimum: 10,
    description: 'Aulas por grau — service rejects values below 10 with a stable code',
  })
  @IsInt()
  @Min(1)
  lessonsPerDegree!: number;

  @ApiProperty({ description: 'false is accepted only for kids-ladder belts' })
  @IsBoolean()
  enabled!: boolean;
}

/** PUT /admin/graduation-rules — Salvar persists all rows at once (story 26). */
export class UpdateGraduationRulesDto {
  @ApiProperty({ type: [GraduationRuleEntryDto], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GraduationRuleEntryDto)
  rules!: GraduationRuleEntryDto[];
}

/** Persistent observação (GRD.10). */
export class CreateStudentNoteDto {
  @ApiProperty({ example: 'Exame de faixa — aprovado com distinção.' })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;
}
