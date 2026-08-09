import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClsService } from 'nestjs-cls';
import { Roles } from '../../../common/decorators.js';
import { requireTenantContext } from '../../enrollment/controllers/context.js';
import { CalendarQueryDto } from '../dto/requests.dto.js';
import { CalendarResponseDto } from '../dto/responses.dto.js';
import { AgendaService } from '../services/agenda.service.js';

/** Professor month calendar (spec 007, AGD.2) — own classes only. */
@ApiTags('professor')
@ApiBearerAuth()
@Roles('professor')
@Controller('professor')
export class ProfessorCalendarController {
  constructor(
    private readonly agenda: AgendaService,
    private readonly cls: ClsService,
  ) {}

  @Get('calendar')
  @ApiOperation({
    summary: 'Month calendar: own-class weekly recurrence buckets ("aula recorrente")',
    description: 'Schedule-derived — no session reads. The client expands dots over the grid.',
  })
  @ApiOkResponse({ type: CalendarResponseDto })
  async calendar(@Query() query: CalendarQueryDto) {
    const ctx = requireTenantContext(this.cls);
    return this.agenda.calendar(ctx, 'professor', query.month);
  }
}
