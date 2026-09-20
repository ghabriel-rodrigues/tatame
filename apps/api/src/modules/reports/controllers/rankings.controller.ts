import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { ClsService } from 'nestjs-cls';
import { Roles } from '../../../common/decorators.js';
import { requireTenantContext } from '../../enrollment/controllers/context.js';
import { RankingResponseDto } from '../dto/responses.dto.js';
import {
  RankingsService,
  type RankingBy,
} from '../services/rankings.service.js';

class RankingQueryDto {
  @IsOptional()
  @IsIn(['lessons', 'events'])
  by?: RankingBy;

  @IsOptional()
  month?: string;
}

/**
 * Ranking do mês (spec 013, REP.5 — aluno-06/07, professor-05/06): one read
 * endpoint for both segments, consumed by the aluno home card, the full
 * screens and the professor dashboard section. Visible to students AND
 * professors regardless of the `gamification.streak` toggle (recorded
 * decision — that switch governs only the streak tile). Guardians and admins
 * have no ranking surface (per the screenshots).
 */
@ApiTags('rankings')
@ApiBearerAuth()
@Roles('student', 'professor')
@Controller('rankings')
export class RankingsController {
  constructor(
    private readonly rankings: RankingsService,
    private readonly cls: ClsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Academy-wide ranking: Por aulas (month) / Por eventos (semester)',
    description:
      'Active students only, count-desc then name-asc (deterministic ties), top 10 plus the ' +
      "requesting student's own position (`me` — always null for professors). Windows are " +
      'tenant-timezone calendar month / calendar half.',
  })
  @ApiQuery({ name: 'by', required: false, enum: ['lessons', 'events'] })
  @ApiQuery({ name: 'month', required: false, example: '2026-08' })
  @ApiOkResponse({ type: RankingResponseDto })
  async ranking(@Query() query: RankingQueryDto) {
    const ctx = requireTenantContext(this.cls);
    return this.rankings.ranking(ctx, query.by ?? 'lessons', query.month);
  }
}
