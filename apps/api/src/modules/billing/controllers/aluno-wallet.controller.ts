import {
  Body,
  Controller,
  Delete,
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
  PaymentCreatedResponseDto,
  WalletResponseDto,
} from '../dto/responses.dto.js';
import { PaymentFlowService } from '../services/payment-flow.service.js';
import { WalletService } from '../services/wallet.service.js';

/**
 * Aluno Carteira (spec 006, BIL.8 — aluno-12/13/14/15). Payment-flow
 * mutations carry @BypassReadOnly: the academy's debt to the platform never
 * blocks a student from paying theirs (story 16).
 */
@ApiTags('aluno')
@ApiBearerAuth()
@Roles('student')
@Controller('aluno/wallet')
export class AlunoWalletController {
  constructor(
    private readonly wallet: WalletService,
    private readonly paymentFlow: PaymentFlowService,
    private readonly cls: ClsService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Carteira: plan header, current mensalidade, recurrence banner, histórico',
    description:
      'Money-displaying entry point — runs the idempotent current-cycle materialization for the ' +
      'caller before reading. No assigned plan → clean empty state (billing never invents money).',
  })
  @ApiOkResponse({ type: WalletResponseDto })
  async getWallet() {
    const ctx = requireTenantContext(this.cls);
    return this.wallet.getWallet(ctx);
  }

  @Post('charges/:id/payments')
  @BypassReadOnly()
  @HttpCode(201)
  @ApiOperation({
    summary:
      'Open a settlement attempt (pix / boleto / cartão + recurrence toggle)',
    description:
      'Pix/boleto return the render-ready provider payload and stay pending until "Simular ' +
      'pagamento" (or the future webhook); cartão settles inline through the normalized-event ' +
      'handler. The recurrence toggle creates the card mandate in the same gesture.',
  })
  @ApiCreatedResponse({ type: PaymentCreatedResponseDto })
  async pay(
    @Param('id', ParseUUIDPipe) chargeId: string,
    @Body() dto: CreateChargePaymentDto,
  ) {
    const ctx = requireTenantContext(this.cls);
    return this.paymentFlow.createPayment(ctx, 'student', chargeId, {
      method: dto.method,
      recurrence: dto.recurrence,
      card: dto.card,
    });
  }

  @Delete('mandate')
  @BypassReadOnly()
  @HttpCode(204)
  @ApiOperation({
    summary: 'Cancelar recorrência no cartão (audited; 404 when none active)',
  })
  async cancelMandate(): Promise<void> {
    const ctx = requireTenantContext(this.cls);
    await this.paymentFlow.cancelMandate(ctx);
  }
}
