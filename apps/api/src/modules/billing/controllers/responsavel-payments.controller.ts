import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
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
import { BypassReadOnly, Roles } from '../../../common/decorators.js';
import { requireTenantContext } from '../../enrollment/controllers/context.js';
import { CreateChargePaymentDto } from '../dto/requests.dto.js';
import {
  GuardianPaymentsResponseDto,
  PaymentCreatedResponseDto,
} from '../dto/responses.dto.js';
import { GuardianPaymentsService } from '../services/guardian-payments.service.js';
import { PaymentFlowService } from '../services/payment-flow.service.js';

/**
 * Responsável Pagamentos (spec 006, BIL.9 — responsavel-04/05): one card per
 * dependent addressed to the guardian bill-to, Pix per child, consolidated
 * histórico. Ownership is the charge's `guardian_id` — a foreign dependent's
 * charge behaves as 404, never 403.
 */
@ApiTags('responsavel')
@ApiBearerAuth()
@Roles('guardian')
@Controller('responsavel/payments')
export class ResponsavelPaymentsController {
  constructor(
    private readonly guardianPayments: GuardianPaymentsService,
    private readonly paymentFlow: PaymentFlowService,
    private readonly cls: ClsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Per-dependent mensalidade cards + consolidated histórico',
    description:
      'Money-displaying entry point — materializes the current cycle for the caller’s dependents ' +
      'before reading.',
  })
  @ApiOkResponse({ type: GuardianPaymentsResponseDto })
  async list() {
    const ctx = requireTenantContext(this.cls);
    return this.guardianPayments.getPayments(ctx);
  }

  @Post('charges/:id/payments')
  @BypassReadOnly()
  @HttpCode(201)
  @ApiOperation({
    summary: 'Pay a dependent’s charge (same methods as the aluno sheet)',
    description:
      'The charge must be billed to the calling guardian (bill-to). Card recurrence opt-in ' +
      'creates the mandate with the responsável as payer.',
  })
  @ApiCreatedResponse({ type: PaymentCreatedResponseDto })
  async pay(
    @Param('id', ParseUUIDPipe) chargeId: string,
    @Body() dto: CreateChargePaymentDto,
  ) {
    const ctx = requireTenantContext(this.cls);
    return this.paymentFlow.createPayment(ctx, 'guardian', chargeId, {
      method: dto.method,
      recurrence: dto.recurrence,
      card: dto.card,
    });
  }
}
