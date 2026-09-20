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
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ClsService } from 'nestjs-cls';
import { Roles } from '../../../common/decorators.js';
import { requireTenantContext } from '../../enrollment/controllers/context.js';
import { CreateEventDto, UpdateEventDto } from '../dto/requests.dto.js';
import {
  AdminEventDto,
  AdminEventRegistrationsResponseDto,
  AdminEventsResponseDto,
  AnnounceResponseDto,
} from '../dto/responses.dto.js';
import { AdminEventsService } from '../services/admin-events.service.js';

/**
 * Admin Eventos console (spec 008, EVT.4 — admin-13): gradient-banner cards,
 * criar/editar, the draft → published → canceled lifecycle, inscritos view
 * and Comunicar. All writes blocked for read-only (delinquent) academies by
 * the academy-status guard — no @BypassReadOnly here.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/events')
export class AdminEventsController {
  constructor(
    private readonly adminEvents: AdminEventsService,
    private readonly cls: ClsService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Eventos: gradient cards with valor chip, date, inscritos/arrecadado totals',
    description:
      'Drafts first ("Rascunho · Data a definir"), then chronological.',
  })
  @ApiOkResponse({ type: AdminEventsResponseDto })
  async list() {
    const ctx = requireTenantContext(this.cls);
    return this.adminEvents.list(ctx);
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({
    summary:
      'Create an event (Rascunho by default; publishing is a separate gesture)',
    description:
      'Valor vazio = gratuito. status=published requires date + local (422 event.publish_requirements).',
  })
  @ApiCreatedResponse({ type: AdminEventDto })
  async create(@Body() dto: CreateEventDto) {
    const ctx = requireTenantContext(this.cls);
    return this.adminEvents.create(ctx, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Edit an event (canceled events are frozen history — 409)',
    description:
      'A published event must keep its date and local (422 event.publish_requirements).',
  })
  @ApiOkResponse({ type: AdminEventDto })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEventDto,
  ) {
    const ctx = requireTenantContext(this.cls);
    return this.adminEvents.update(ctx, id, dto);
  }

  @Post(':id/publish')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Publish a draft (audited) — requires date + local',
    description:
      'Students never see an undated event: missing date/local → 422 event.publish_requirements.',
  })
  @ApiOkResponse({ type: AdminEventDto })
  async publish(@Param('id', ParseUUIDPipe) id: string) {
    const ctx = requireTenantContext(this.cls);
    return this.adminEvents.publish(ctx, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Cancel an event (never hard-delete; audited)',
    description:
      'Voids the open event charges and cancels pending registrations — nobody is billed for a ' +
      'dead event. Confirmed rows keep their history.',
  })
  @ApiOkResponse({ type: AdminEventDto })
  async cancel(@Param('id', ParseUUIDPipe) id: string) {
    const ctx = requireTenantContext(this.cls);
    return this.adminEvents.cancel(ctx, id);
  }

  @Get(':id/registrations')
  @ApiOperation({
    summary:
      'Inscritos: who registered, status, who confirmed, paid amount + totals',
  })
  @ApiOkResponse({ type: AdminEventRegistrationsResponseDto })
  async registrations(@Param('id', ParseUUIDPipe) id: string) {
    const ctx = requireTenantContext(this.cls);
    return this.adminEvents.registrations(ctx, id);
  }

  @Post(':id/announce')
  @HttpCode(202)
  @ApiOperation({
    summary:
      'Comunicar: queue an announcement to the inscritos (published only)',
    description:
      'Emits events.announcement.requested + one audit row and NOTHING else — delivery is the ' +
      'notifications phase. Clients show "Comunicado enviado aos inscritos." on 202.',
  })
  @ApiAcceptedResponse({ type: AnnounceResponseDto })
  async announce(@Param('id', ParseUUIDPipe) id: string) {
    const ctx = requireTenantContext(this.cls);
    return this.adminEvents.announce(ctx, id);
  }
}
