import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../../common/decorators.js';
import { RepassesResponseDto } from '../dto/responses.dto.js';
import { RepassesService } from '../services/repasses.service.js';

/**
 * Plataforma Faturamento e repasses (spec 006, BIL.11 — plataforma-09).
 * Money is finance-scoped platform RBAC: owner/finance only — support is
 * denied (403) by the roles guard.
 */
@ApiTags('platform')
@ApiBearerAuth()
@Controller('platform/billing')
export class PlatformRepassesController {
  constructor(private readonly repasses: RepassesService) {}

  @Get('repasses')
  @Roles('owner', 'finance')
  @ApiOperation({
    summary:
      'Repasse read model: gross − fee_bps = net, Retido on delinquent academies',
    description:
      'Pure query — no ledger writes, no money movement in v1. At the Stripe stage the same ' +
      'view reconciles Connect transfers/payouts and Retido becomes payout pausing.',
  })
  @ApiOkResponse({ type: RepassesResponseDto })
  async list() {
    return this.repasses.repasses();
  }
}
