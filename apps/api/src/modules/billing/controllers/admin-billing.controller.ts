import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClsService } from 'nestjs-cls';
import { Roles } from '../../../common/decorators.js';
import { AuditService } from '../../identity/services/audit.service.js';
import { requireTenantContext } from '../../enrollment/controllers/context.js';
import { RefundPaymentDto } from '../dto/requests.dto.js';
import {
  AdminOverviewResponseDto,
  MaterializationResultDto,
  RefundResponseDto,
} from '../dto/responses.dto.js';
import { AdminOverviewService } from '../services/admin-overview.service.js';
import { MaterializationService } from '../services/materialization.service.js';
import { PaymentFlowService } from '../services/payment-flow.service.js';

/**
 * Admin Visão financeira + money operations (spec 006, BIL.10 — admin-02).
 * No professor route exists anywhere in billing (charter: professor has zero
 * financial access — enforced by the CI metadata assertion, not convention).
 */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/billing')
export class AdminBillingController {
  constructor(
    private readonly overview: AdminOverviewService,
    private readonly materialization: MaterializationService,
    private readonly paymentFlow: PaymentFlowService,
    private readonly audit: AuditService,
    private readonly cls: ClsService,
  ) {}

  @Get('overview')
  @ApiOperation({
    summary: 'Visão financeira: receita mês/ano, previsão, inadimplência %, série, vencimentos',
    description:
      'Runs the tenant-wide idempotent materialization pass first, so previsão reflects every ' +
      'plan — not just wallets already opened. All aggregates derived on read, tenant timezone.',
  })
  @ApiOkResponse({ type: AdminOverviewResponseDto })
  async getOverview() {
    const ctx = requireTenantContext(this.cls);
    return this.overview.overview(ctx);
  }

  @Post('charges/materialize')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Materialize the current cycle tenant-wide on demand (audited)',
    description: 'The ops lever and the test seam — same idempotent pass as the on-read entry points.',
  })
  @ApiOkResponse({ type: MaterializationResultDto })
  async materialize() {
    const ctx = requireTenantContext(this.cls);
    const result = await this.materialization.ensureCurrentCycleCharges({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      impersonatorUserId: ctx.impersonatorUserId,
    });
    await this.audit.append({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      impersonatorUserId: ctx.impersonatorUserId,
      action: 'billing.charge.materialized',
      targetType: 'tenant',
      targetId: ctx.tenantId,
      metadata: {
        created: result.created,
        flipped_overdue: result.flippedOverdue,
        auto_settled: result.autoSettled,
      },
    });
    return result;
  }

  @Post('payments/:id/refund')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Full refund of a settled payment via the provider path (audited)',
    description:
      'Corrects a wrong charge through the provider port, never by editing rows: the driver ' +
      'emits `payment.refunded` through the normalized handler (payment + charge flip refunded).',
  })
  @ApiOkResponse({ type: RefundResponseDto })
  async refund(@Param('id', ParseUUIDPipe) paymentId: string, @Body() dto: RefundPaymentDto) {
    const ctx = requireTenantContext(this.cls);
    return this.paymentFlow.refund(ctx, paymentId, dto.reason);
  }
}
