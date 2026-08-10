import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClsService } from 'nestjs-cls';
import { RequiresPermission, Roles } from '../../../common/decorators.js';
import { requireTenantContext } from '../../enrollment/controllers/context.js';
import { EventsQueryService } from '../../events/services/events-query.service.js';
import { StorefrontService } from '../../store/services/storefront.service.js';
import { CheckinRequestDto } from '../dto/requests.dto.js';
import { AlunoHomeResponseDto, CheckinResponseDto } from '../dto/responses.dto.js';
import { CheckinService } from '../services/checkin.service.js';
import { StatsService } from '../services/stats.service.js';

/**
 * Aluno surface (spec 004, ATT.7/ATT.11): the check-in sheet's single write
 * path and the Início hero + stat tiles. Read-only academies are blocked on
 * the POST by the academy-status guard (no @BypassReadOnly — story 45).
 */
@ApiTags('aluno')
@ApiBearerAuth()
@Roles('student')
@Controller('aluno')
export class AlunoAttendanceController {
  constructor(
    private readonly checkins: CheckinService,
    private readonly stats: StatsService,
    private readonly eventsQuery: EventsQueryService,
    private readonly storefront: StorefrontService,
    private readonly cls: ClsService,
  ) {}

  @Post('checkins')
  @HttpCode(200)
  @RequiresPermission('checkin.self')
  @ApiOperation({
    summary: 'Fazer check-in (qr / code / manual)',
    description:
      'One validated INSERT for all three methods. A duplicate attempt returns status ' +
      '`already_checked_in` (200) — never an error and never a second row.',
  })
  @ApiOkResponse({ type: CheckinResponseDto })
  async checkIn(@Body() dto: CheckinRequestDto) {
    const ctx = requireTenantContext(this.cls);
    return this.checkins.checkIn(ctx, {
      method: dto.method,
      qrToken: dto.qrToken,
      code: dto.code,
      classId: dto.classId,
    });
  }

  @Get('home')
  @ApiOperation({
    summary: 'Início: today-class hero, presença %, streak, graduation card, próximos eventos',
    description:
      'Streak is null when the academy disabled the gamification.streak toggle. The graduation ' +
      'card carries the derived belt and the progress against the academy rule (GRD.7). ' +
      '`upcomingEvents` is the "Próximos eventos" section: the next 2 published events with the ' +
      'caller\'s own registration state (spec 008 — additive). `storeStrip` is the "Loja da ' +
      'academia" strip: the first 3 active store products + "Ver tudo" (spec 009 — additive).',
  })
  @ApiOkResponse({ type: AlunoHomeResponseDto })
  async home() {
    const ctx = requireTenantContext(this.cls);
    const [home, upcomingEvents, storeStrip] = await Promise.all([
      this.stats.alunoHome(ctx),
      this.eventsQuery.alunoUpcoming(ctx, 2),
      this.storefront.storeStrip(ctx, 3),
    ]);
    return { ...home, upcomingEvents, storeStrip };
  }
}
