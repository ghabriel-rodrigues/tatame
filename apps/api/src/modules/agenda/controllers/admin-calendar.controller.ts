import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClsService } from 'nestjs-cls';
import { Roles } from '../../../common/decorators.js';
import { requireTenantContext } from '../../enrollment/controllers/context.js';
import { CalendarQueryDto } from '../dto/requests.dto.js';
import { CalendarResponseDto } from '../dto/responses.dto.js';
import { AgendaService } from '../services/agenda.service.js';

/** Admin console calendar (spec 007, AGD.2) — every active turma, archived excluded. */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin')
export class AdminCalendarController {
  constructor(
    private readonly agenda: AgendaService,
    private readonly cls: ClsService,
  ) {}

  @Get('calendar')
  @ApiOperation({
    summary: 'Month calendar: all-active-turma weekly recurrence buckets ("aulas recorrentes")',
    description: 'Schedule-derived — no session reads. The client expands dots over the grid.',
  })
  @ApiOkResponse({ type: CalendarResponseDto })
  async calendar(@Query() query: CalendarQueryDto) {
    const ctx = requireTenantContext(this.cls);
    return this.agenda.calendar(ctx, 'admin', query.month);
  }
}
