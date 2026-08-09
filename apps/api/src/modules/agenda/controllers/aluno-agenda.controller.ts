import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClsService } from 'nestjs-cls';
import { Roles } from '../../../common/decorators.js';
import { requireTenantContext } from '../../enrollment/controllers/context.js';
import { AlunoAgendaQueryDto, CalendarQueryDto } from '../dto/requests.dto.js';
import { AlunoAgendaResponseDto, CalendarResponseDto } from '../dto/responses.dto.js';
import { AgendaService } from '../services/agenda.service.js';

/**
 * Aluno agenda surface (spec 007, AGD.1/AGD.2): the Agenda tab's weekday view
 * and the month calendar. Pure reads — read-only academies stay served.
 */
@ApiTags('aluno')
@ApiBearerAuth()
@Roles('student')
@Controller('aluno')
export class AlunoAgendaController {
  constructor(
    private readonly agenda: AgendaService,
    private readonly cls: ClsService,
  ) {}

  @Get('agenda')
  @ApiOperation({
    summary: 'Agenda: enrolled classes of one weekday (default today) + check-in state',
    description:
      "Never creates class_sessions rows: `checkedIn` is a pure read of today's session and the " +
      'active attendance. `events` carries the current month\'s published events with own state ' +
      '("Eventos do mês", spec 008).',
  })
  @ApiOkResponse({ type: AlunoAgendaResponseDto })
  async agendaOf(@Query() query: AlunoAgendaQueryDto) {
    const ctx = requireTenantContext(this.cls);
    return this.agenda.alunoAgenda(ctx, query.weekday);
  }

  @Get('calendar')
  @ApiOperation({
    summary: 'Month calendar: enrolled-class weekly recurrence buckets ("sua aula")',
    description: 'Schedule-derived — no session reads. The client expands dots over the grid.',
  })
  @ApiOkResponse({ type: CalendarResponseDto })
  async calendar(@Query() query: CalendarQueryDto) {
    const ctx = requireTenantContext(this.cls);
    return this.agenda.calendar(ctx, 'aluno', query.month);
  }
}
