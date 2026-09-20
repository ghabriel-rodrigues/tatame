import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ClsService } from 'nestjs-cls';
import { Roles } from '../../../common/decorators.js';
import { requireTenantContext } from '../../enrollment/controllers/context.js';
import { CreatePlanDto, UpdatePlanDto } from '../dto/requests.dto.js';
import { PlanListResponseDto, PlanResponseDto } from '../dto/responses.dto.js';
import { PlansService } from '../services/plans.service.js';

/**
 * Planos de mensalidade CRUD (spec 006, BIL.10 — admin-15 in Configurações).
 * Plan management is a normal tenant mutation: a read-only (delinquent)
 * academy is blocked here — only the payment flow bypasses read-only.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/billing/plans')
export class AdminPlansController {
  constructor(
    private readonly plans: PlansService,
    private readonly cls: ClsService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Plan catalog including archived (soft-archive is a filter, not a delete)',
  })
  @ApiOkResponse({ type: PlanListResponseDto })
  async list() {
    const ctx = requireTenantContext(this.cls);
    return { plans: await this.plans.list(ctx) };
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({
    summary:
      'Novo plano (nome, valor em centavos, recorrência chip, vencimento chip)',
    description:
      'Duplicate name in the academy → 409 `plan.name_taken` (UNIQUE tenant+name).',
  })
  @ApiCreatedResponse({ type: PlanResponseDto })
  async create(@Body() dto: CreatePlanDto) {
    const ctx = requireTenantContext(this.cls);
    return { plan: await this.plans.create(ctx, dto) };
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Edit a plan (existing charges keep their issued amounts)',
  })
  @ApiOkResponse({ type: PlanResponseDto })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePlanDto,
  ) {
    const ctx = requireTenantContext(this.cls);
    return { plan: await this.plans.update(ctx, id, dto) };
  }

  @Post(':id/archive')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Soft archive: refuses new assignment, history stays intact (never hard-delete)',
  })
  @ApiOkResponse({ type: PlanResponseDto })
  async archive(@Param('id', ParseUUIDPipe) id: string) {
    const ctx = requireTenantContext(this.cls);
    return { plan: await this.plans.archive(ctx, id) };
  }
}
