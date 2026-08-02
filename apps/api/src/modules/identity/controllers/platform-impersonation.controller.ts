import { Controller, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ClsService } from 'nestjs-cls';
import { requireAuthContext } from '../../../common/auth-context.js';
import { DenyImpersonated, Roles } from '../../../common/decorators.js';
import { ImpersonationService } from '../services/impersonation.service.js';

@ApiTags('platform')
@ApiBearerAuth()
@Controller('platform/academies')
export class PlatformImpersonationController {
  constructor(
    private readonly impersonation: ImpersonationService,
    private readonly cls: ClsService,
  ) {}

  /** "Entrar como admin" — owner/support only (finance excluded), no chaining. */
  @Roles('owner', 'support')
  @DenyImpersonated()
  @Post(':id/impersonate')
  @HttpCode(201)
  @ApiOperation({ summary: 'Audited 1-hour impersonated admin session for the academy' })
  async impersonate(@Param('id', ParseUUIDPipe) academyId: string, @Req() req: Request) {
    return this.impersonation.impersonate(requireAuthContext(this.cls), academyId, {
      ip: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
  }
}
