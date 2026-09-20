import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ClsService } from 'nestjs-cls';
import { requireAuthContext } from '../../../common/auth-context.js';
import {
  AnyRole,
  DenyImpersonated,
  RequiresPermission,
  Roles,
} from '../../../common/decorators.js';
import { InviteService } from '../services/invite.service.js';
import { CreateInviteDto } from '../dto/invite.dto.js';
import {
  AttachInviteResponseDto,
  CreateInviteResponseDto,
} from '../dto/responses.dto.js';

@ApiTags('invites')
@ApiBearerAuth()
@Controller('invites')
export class InvitesController {
  constructor(
    private readonly invitesService: InviteService,
    private readonly cls: ClsService,
  ) {}

  /** Invite-link generation (stories 19/24) — toggleable for professors. */
  @Roles('professor', 'admin')
  @RequiresPermission('invites.create')
  @Post()
  @HttpCode(201)
  @ApiOperation({
    summary: 'Generate an invite link bound to the academy (7-day validity)',
  })
  @ApiCreatedResponse({ type: CreateInviteResponseDto })
  async create(@Body() dto: CreateInviteDto) {
    return this.invitesService.create(requireAuthContext(this.cls), dto);
  }

  /**
   * BOSS ruling: an existing account accepts an invite by attaching a new
   * membership to itself (public accept answers 409 invite.email_exists).
   */
  @AnyRole()
  @DenyImpersonated()
  @Post(':token/accept')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Attach the invite membership to the authenticated account',
  })
  @ApiCreatedResponse({ type: AttachInviteResponseDto })
  async accept(@Param('token') token: string) {
    return this.invitesService.attachToCurrentUser(
      requireAuthContext(this.cls),
      token,
    );
  }
}
