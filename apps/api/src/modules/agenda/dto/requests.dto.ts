import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

export class AlunoAgendaQueryDto {
  @ApiPropertyOptional({
    minimum: 0,
    maximum: 6,
    description: '0 = Sunday … 6 = Saturday; omitted = today in the tenant timezone',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  weekday?: number;
}

export class CalendarQueryDto {
  @ApiPropertyOptional({
    example: '2026-08',
    description:
      'YYYY-MM, echoed back; omitted = current tenant-local month. In v1 it only windows the (empty) events — recurrence is month-independent.',
  })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month must be YYYY-MM' })
  month?: string;
}
