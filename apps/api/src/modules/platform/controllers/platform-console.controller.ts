import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ClsService } from 'nestjs-cls';
import { requireAuthContext } from '../../../common/auth-context.js';
import { Roles } from '../../../common/decorators.js';
import { APP_CONFIG, type AppConfig } from '../../../infra/config/app-config.js';
import { Inject } from '@nestjs/common';
import {
  InviteTeamMemberDto,
  PlatformPlanWriteDto,
  RegisterAcademyDto,
  SchedulePlanChangeDto,
} from '../dto/platform.dto.js';
import {
  InviteTeamMemberResponseDto,
  PlatformAcademyDetailDto,
  PlatformAcademyListResponseDto,
  PlatformIntegrationsResponseDto,
  PlatformOverviewResponseDto,
  PlatformPlanCatalogResponseDto,
  PlatformPlanRowDto,
  PlatformTeamResponseDto,
  RegisterAcademyResponseDto,
} from '../dto/responses.dto.js';
import { PlatformAcademiesService } from '../services/platform-academies.service.js';
import { PlatformOverviewService } from '../services/platform-overview.service.js';
import { PlatformPlansService } from '../services/platform-plans.service.js';
import { PlatformTeamService } from '../services/platform-team.service.js';

/**
 * The plataforma console (spec 012). RBAC follows the charter's role split,
 * which the Equipe screen states in prose: **owner** owns money and catalog
 * writes, **support** works academies and impersonation but never money,
 * **finance** sees money but never impersonates (that grant lives in the
 * identity module and is owner/support).
 */
@ApiTags('platform')
@ApiBearerAuth()
@Controller('platform')
export class PlatformConsoleController {
  constructor(
    private readonly overviewService: PlatformOverviewService,
    private readonly academies: PlatformAcademiesService,
    private readonly plans: PlatformPlansService,
    private readonly team: PlatformTeamService,
    private readonly cls: ClsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // ---------------------------------------------------------------- overview

  @Get('overview')
  @Roles('owner', 'finance')
  @ApiOperation({
    summary: 'Visão geral: MRR + delta, academias/alunos/inadimplência, 6-month series, atenção',
    description:
      'Pure read model. The series is reconstructed from subscription lifetimes against current ' +
      'plan prices — see spec 012 for the recorded limitation. Support is denied: the screen is ' +
      'revenue, and support lands on Academias instead.',
  })
  @ApiOkResponse({ type: PlatformOverviewResponseDto })
  async overview() {
    return this.overviewService.overview();
  }

  // --------------------------------------------------------------- academies

  @Get('academies')
  @Roles('owner', 'support', 'finance')
  @ApiOperation({ summary: 'Academies with city, student count, plan and status' })
  @ApiOkResponse({ type: PlatformAcademyListResponseDto })
  async listAcademies() {
    return this.academies.list();
  }

  @Post('academies')
  @Roles('owner')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Register an academy on Trial and invite its admin by email',
    description:
      'Academy + trialing subscription + admin membership in one transaction; the set-password ' +
      'email goes out after it commits, so a mail failure never rolls back a created customer.',
  })
  @ApiCreatedResponse({ type: RegisterAcademyResponseDto })
  async registerAcademy(@Body() dto: RegisterAcademyDto) {
    return this.academies.register(requireAuthContext(this.cls), {
      name: dto.name,
      city: dto.city,
      adminEmail: dto.adminEmail,
      adminFullName: dto.adminFullName ?? null,
      platformPlanId: dto.platformPlanId,
    });
  }

  @Get('academies/:id')
  @Roles('owner', 'support', 'finance')
  @ApiOperation({ summary: 'Academy detail: stats, subscription and pending plan change' })
  @ApiOkResponse({ type: PlatformAcademyDetailDto })
  async academyDetail(@Param('id', ParseUUIDPipe) academyId: string) {
    return this.academies.detail(academyId);
  }

  @Put('academies/:id/plan')
  @Roles('owner')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Schedule the academy plan change for the next cycle',
    description:
      'Writes `pending_platform_plan_id` only — the current plan and price are never touched ' +
      '(charter: a plan change applies at the next billing cycle). `null` clears a scheduled ' +
      'change, and picking the plan the academy is already on does the same.',
  })
  @ApiOkResponse({ type: PlatformAcademyDetailDto })
  async schedulePlanChange(
    @Param('id', ParseUUIDPipe) academyId: string,
    @Body() dto: SchedulePlanChangeDto,
  ) {
    return this.academies.schedulePlanChange(
      requireAuthContext(this.cls),
      academyId,
      dto.platformPlanId,
    );
  }

  @Post('academies/:id/suspend')
  @Roles('owner')
  @HttpCode(200)
  @ApiOperation({ summary: 'Suspend the academy — blocks access immediately (audited)' })
  @ApiOkResponse({ type: PlatformAcademyDetailDto })
  async suspend(@Param('id', ParseUUIDPipe) academyId: string) {
    return this.academies.setSuspended(requireAuthContext(this.cls), academyId, true);
  }

  @Post('academies/:id/reactivate')
  @Roles('owner')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Reactivate the academy — restores the status its subscription justifies',
  })
  @ApiOkResponse({ type: PlatformAcademyDetailDto })
  async reactivate(@Param('id', ParseUUIDPipe) academyId: string) {
    return this.academies.setSuspended(requireAuthContext(this.cls), academyId, false);
  }

  // ------------------------------------------------------------------- plans

  @Get('plans')
  @Roles('owner', 'support', 'finance')
  @ApiOperation({
    summary: 'Plan catalog with derived "mais assinado" + feature inheritance, and the registry',
  })
  @ApiOkResponse({ type: PlatformPlanCatalogResponseDto })
  async planCatalog() {
    return this.plans.catalog();
  }

  @Post('plans')
  @Roles('owner')
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a plan — available for new academy subscriptions immediately' })
  @ApiCreatedResponse({ type: PlatformPlanRowDto })
  async createPlan(@Body() dto: PlatformPlanWriteDto) {
    return this.plans.create(requireAuthContext(this.cls), dto);
  }

  @Put('plans/:id')
  @Roles('owner')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Edit a plan (name, price, limit, features)',
    description: 'Current subscribers keep their price until the next cycle.',
  })
  @ApiOkResponse({ type: PlatformPlanRowDto })
  async updatePlan(@Param('id', ParseUUIDPipe) planId: string, @Body() dto: PlatformPlanWriteDto) {
    return this.plans.update(requireAuthContext(this.cls), planId, dto);
  }

  // -------------------------------------------------------------------- team

  @Get('team')
  @Roles('owner', 'support', 'finance')
  @ApiOperation({ summary: 'Platform team roster with roles' })
  @ApiOkResponse({ type: PlatformTeamResponseDto })
  async listTeam() {
    return { members: await this.team.list() };
  }

  @Post('team')
  @Roles('owner')
  @HttpCode(201)
  @ApiOperation({ summary: 'Invite a team member — same set-password email as academy admins' })
  @ApiCreatedResponse({ type: InviteTeamMemberResponseDto })
  async inviteTeamMember(@Body() dto: InviteTeamMemberDto) {
    return this.team.invite(requireAuthContext(this.cls), dto);
  }

  // ------------------------------------------------------------ integrations

  @Get('integrations')
  @Roles('owner', 'support', 'finance')
  @ApiOperation({
    summary: 'Payment rails (read-only stub)',
    description:
      'plataforma-11 as the handoff describes it — "(stubs)". The rails reflect the configured ' +
      'payment provider and carry `configurable: false`, so the switches render disabled ' +
      'instead of pretending to pause anything.',
  })
  @ApiOkResponse({ type: PlatformIntegrationsResponseDto })
  integrations() {
    return {
      provider: this.config.paymentsProvider,
      integrations: [
        {
          key: 'pix',
          initials: 'PIX',
          name: 'Pix · PSP TatamePay',
          detail: 'Liquidação instantânea · taxa 0,9%',
          enabled: true,
          configurable: false,
        },
        {
          key: 'boleto',
          initials: 'BOL',
          name: 'Boleto · registradora',
          detail: 'Compensação em 1–2 dias úteis · R$ 2,90/boleto',
          enabled: true,
          configurable: false,
        },
        {
          key: 'card',
          initials: 'CRT',
          name: 'Cartão · adquirente',
          detail: 'Recorrência e parcelamento · 2,9% + R$ 0,30',
          enabled: true,
          configurable: false,
        },
      ],
    };
  }
}
