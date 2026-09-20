import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ClsService } from 'nestjs-cls';
import { Roles } from '../../../common/decorators.js';
import { requireTenantContext } from '../../enrollment/controllers/context.js';
import { EventsQueryService } from '../../events/services/events-query.service.js';
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
    private readonly eventsQuery: EventsQueryService,
    private readonly cls: ClsService,
  ) {}

  @Get('dashboard')
  @ApiOperation({
    summary:
      "Dashboard: alunos hoje, presença média, next-class hero, today's classes, eventos futuros",
    description:
      'The "eventos futuros" stat tile + list are read-only academy-wide data (spec 008): the ' +
      'professor has no event write route — the "Criar eventos" toggle stays render-only in v1.',
  })
  @ApiOkResponse({ type: ProfessorDashboardResponseDto })
  async dashboard() {
    const ctx = requireTenantContext(this.cls);
    const [dashboard, upcoming] = await Promise.all([
      this.stats.professorDashboard(ctx),
      this.eventsQuery.professorUpcoming(ctx),
    ]);
    return {
      ...dashboard,
      upcomingEventsCount: upcoming.count,
      upcomingEvents: upcoming.items,
    };
  }

  @Get('students')
  @ApiOperation({
    summary:
      'Academy students — optional filter: not enrolled in one of my classes',
    description:
      'notEnrolledInClassId must reference a class the caller teaches (else 404).',
  })
  @ApiOkResponse({ type: ProfessorStudentsResponseDto })
  async students(@Query() query: ProfessorStudentsQueryDto) {
    const ctx = requireTenantContext(this.cls);
    return {
      students: await this.directory.professorStudents(
        ctx,
        query.notEnrolledInClassId,
      ),
    };
  }
}
