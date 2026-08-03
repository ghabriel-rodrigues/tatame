import { Body, Controller, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../../../common/decorators.js';
import { InviteService } from '../services/invite.service.js';
import { AcceptInviteDto } from '../dto/invite.dto.js';
import { InviteAcceptResponseDto, InviteLandingResponseDto } from '../dto/responses.dto.js';

@ApiTags('public')
@Controller('public/invites')
export class PublicInvitesController {
  constructor(private readonly invitesService: InviteService) {}

  @Public()
  @Get(':token')
  @ApiOperation({ summary: 'Invite landing: academy branding + inherited bindings' })
  @ApiOkResponse({ type: InviteLandingResponseDto })
  async landing(@Param('token') token: string) {
    return this.invitesService.landing(token);
  }

  @Public()
  @Post(':token/accept')
  @HttpCode(201)
  @ApiOperation({ summary: 'The only signup: atomic accept, ends logged in' })
  @ApiCreatedResponse({ type: InviteAcceptResponseDto })
  async accept(
    @Param('token') token: string,
    @Body() dto: AcceptInviteDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const payload = await this.invitesService.publicAccept(token, dto, {
      ip: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
    // Signup is used by web (invite landing) and mobile; return the pair in
    // the body — the client stores it per its platform contract.
    return {
      user: payload.user,
      memberships: payload.memberships,
      activeMembershipId: payload.activeMembershipId,
      accessToken: payload.tokens.accessToken,
      accessExpiresIn: payload.tokens.accessExpiresIn,
      refreshToken: payload.tokens.refreshToken,
      // Story 39: a full invite-bound class never fails the signup — the
      // skipped enrollment is surfaced (admin sees an unassigned student).
      enrollmentSkipped: payload.enrollmentSkipped,
    };
  }
}
