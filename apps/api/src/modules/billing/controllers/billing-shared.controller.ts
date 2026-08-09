import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClsService } from 'nestjs-cls';
import { BypassReadOnly, Roles } from '../../../common/decorators.js';
import { requireTenantContext } from '../../enrollment/controllers/context.js';
import { ReceiptResponseDto, SimulatePaymentResponseDto } from '../dto/responses.dto.js';
import { PaymentFlowService } from '../services/payment-flow.service.js';

/**
 * Method-agnostic payment routes shared by aluno and responsável (spec 006,
 * BIL.8): the "Simular pagamento"/"Simular compensação" driver affordance
 * and the comprovante data route.
 */
@ApiTags('billing')
@ApiBearerAuth()
@Controller('billing/payments')
export class BillingSharedController {
  constructor(
    private readonly paymentFlow: PaymentFlowService,
    private readonly cls: ClsService,
  ) {}

  @Post(':id/simulate')
  @Roles('student', 'guardian')
  @BypassReadOnly()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Simular pagamento — settles a pending attempt instantly',
    description:
      'Exists ONLY when the simulated provider is configured (404 otherwise — a driver ' +
      'affordance, never a production backdoor). Synthesizes `payment.succeeded` through the ' +
      'exact normalized-event handler the Stripe webhook will use.',
  })
  @ApiOkResponse({ type: SimulatePaymentResponseDto })
  async simulate(@Param('id', ParseUUIDPipe) paymentId: string) {
    const ctx = requireTenantContext(this.cls);
    return this.paymentFlow.simulate(ctx, paymentId);
  }

  @Get(':id/receipt')
  @Roles('student', 'guardian', 'admin')
  @ApiOperation({
    summary: 'Comprovante data for a settled payment',
    description:
      'Aluno sees their own, responsável their dependents’, admin any tenant payment. Unsettled ' +
      'or foreign payments are 404 — no existence leak.',
  })
  @ApiOkResponse({ type: ReceiptResponseDto })
  async receipt(@Param('id', ParseUUIDPipe) paymentId: string) {
    const ctx = requireTenantContext(this.cls);
    return this.paymentFlow.receipt(ctx, paymentId);
  }
}
