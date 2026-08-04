import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClsService } from 'nestjs-cls';
import { Roles } from '../../../common/decorators.js';
import { requireTenantContext } from '../../enrollment/controllers/context.js';
import { ProfessorStudentsQueryDto } from '../dto/requests.dto.js';
import {
  ProfessorDashboardResponseDto,
  ProfessorStudentsResponseDto,
} from '../dto/responses.dto.js';
import { DirectoryService } from '../services/directory.service.js';
import { StatsService } from '../services/stats.service.js';

/**
 * Professor dashboard tiles (spec 004, ATT.11) and the students listing with
 * the not-enrolled filter (ATT.12 — the "Adicionar aluno" picker stops
 * unioning other-class rosters). All numbers scoped to own classes.
 */
@ApiTags('professor')
@ApiBearerAuth()
@Roles('professor')
@Controller('professor')
export class ProfessorDashboardController {
  constructor(
    private readonly stats: StatsService,
    private readonly directory: DirectoryService,
    private readonly cls: ClsService,
  ) {}

  @Get('dashboard')
  @ApiOperation({
    summary: 'Dashboard: alunos hoje, presença média, next-class hero, today\'s classes',
  })
  @ApiOkResponse({ type: ProfessorDashboardResponseDto })
  async dashboard() {
    const ctx = requireTenantContext(this.cls);
    return this.stats.professorDashboard(ctx);
  }

  @Get('students')
  @ApiOperation({
    summary: 'Academy students — optional filter: not enrolled in one of my classes',
    description: 'notEnrolledInClassId must reference a class the caller teaches (else 404).',
  })
  @ApiOkResponse({ type: ProfessorStudentsResponseDto })
  async students(@Query() query: ProfessorStudentsQueryDto) {
    const ctx = requireTenantContext(this.cls);
    return {
      students: await this.directory.professorStudents(ctx, query.notEnrolledInClassId),
    };
  }
}
