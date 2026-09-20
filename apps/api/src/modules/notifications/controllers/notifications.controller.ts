import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ClsService } from 'nestjs-cls';
import { AnyRole, BypassReadOnly } from '../../../common/decorators.js';
import { requireTenantContext } from '../../enrollment/controllers/context.js';
import { UpdateNotificationSettingsDto } from '../dto/requests.dto.js';
import {
  MarkAllReadResponseDto,
  MarkReadResponseDto,
  NotificationSettingsResponseDto,
  NotificationsListResponseDto,
  UnreadCountResponseDto,
} from '../dto/responses.dto.js';
import { NotificationsService } from '../services/notifications.service.js';

/**
 * Persona-neutral feed surface (spec 010, NOT.5): any authenticated tenant
 * membership reads its own rows — @AnyRole, with the tenant context required
 * (platform sessions have no tenant and no bell in v1; they get the standard
 * 403). Mark-read and settings carry @BypassReadOnly (payment-routes
 * precedent): a delinquent academy's members still read and clear their own
 * inbox.
 */
@ApiTags('notifications')
@ApiBearerAuth()
@AnyRole()
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly service: NotificationsService,
    private readonly cls: ClsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Own notifications, newest first — the Notificações screen feed',
    description:
      'Cursor-paged (~30). Rows are render-ready PT-BR (title/body/chip composed at insert ' +
      "time); `route` is a semantic hint mapped to each shell's navigation client-side.",
  })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiOkResponse({ type: NotificationsListResponseDto })
  async list(@Query('cursor') cursor?: string) {
    return this.service.list(requireTenantContext(this.cls), cursor);
  }

  @Get('unread-count')
  @ApiOperation({
    summary: 'Unread badge count — 0 while the membership is muted',
    description:
      'The bell dot source, refetched on screen focus. Mute suppresses the count only: rows ' +
      'keep being written underneath (the feed doubles as the receipt trail).',
  })
  @ApiOkResponse({ type: UnreadCountResponseDto })
  async unreadCount() {
    return this.service.unreadCount(requireTenantContext(this.cls));
  }

  @Get('settings')
  @ApiOperation({
    summary: 'The perfil "Notificações" switch state (active membership)',
  })
  @ApiOkResponse({ type: NotificationSettingsResponseDto })
  async getSettings() {
    return this.service.getSettings(requireTenantContext(this.cls));
  }

  @Put('settings')
  @BypassReadOnly()
  @ApiOperation({
    summary: 'Flip the per-membership mute switch',
    description:
      "@BypassReadOnly: a delinquent (read-only) academy's members still manage their own switch.",
  })
  @ApiOkResponse({ type: NotificationSettingsResponseDto })
  async updateSettings(@Body() dto: UpdateNotificationSettingsDto) {
    return this.service.updateSettings(
      requireTenantContext(this.cls),
      dto.enabled,
    );
  }

  @Post('read-all')
  @BypassReadOnly()
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Mark every own notification read — fired on screen open, kills the dot',
  })
  @ApiOkResponse({ type: MarkAllReadResponseDto })
  async readAll() {
    return this.service.markAllRead(requireTenantContext(this.cls));
  }

  @Post(':id/read')
  @BypassReadOnly()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Mark one notification read (idempotent)',
    description:
      'Foreign or cross-tenant ids behave as 404 — no existence leak.',
  })
  @ApiOkResponse({ type: MarkReadResponseDto })
  async read(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.markRead(requireTenantContext(this.cls), id);
  }
}
