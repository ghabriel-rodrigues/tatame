import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ClsService } from 'nestjs-cls';
import { Roles } from '../../../common/decorators.js';
import { requireTenantContext } from '../../enrollment/controllers/context.js';
import { RegisterEventResponseDto, ResponsavelEventsResponseDto } from '../dto/responses.dto.js';
import { EventRegistrationsService } from '../services/event-registrations.service.js';
import { EventsQueryService } from '../services/events-query.service.js';

/**
 * Responsável Eventos (spec 008, EVT.6 — responsavel-06): per-dependent
 * confirmation, per the charter — Pedro confirmed never implies Júlia
 * confirmed. Paid registrations bill the guardian (like a mensalidade) and
 * ride the existing responsável payment rails. A foreign/unknown dependent id
 * behaves as 404, never 403.
 */
@ApiTags('responsavel')
@ApiBearerAuth()
@Roles('guardian')
@Controller('responsavel/events')
export class ResponsavelEventsController {
  constructor(
    private readonly query: EventsQueryService,
    private readonly registrations: EventRegistrationsService,
    private readonly cls: ClsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Published events as gradient cards with one chip per dependent',
  })
  @ApiOkResponse({ type: ResponsavelEventsResponseDto })
  async list() {
    const ctx = requireTenantContext(this.cls);
    return this.query.responsavelEvents(ctx);
  }

  @Post(':id/registrations/:studentId')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Confirm (free) / start paying (paid) for one dependent',
    description:
      'Same free/paid semantics as the aluno flow, billed to the guardian. Paid: pay the ' +
      'returned chargeId via POST /responsavel/payments/charges/{chargeId}/payments.',
  })
  @ApiCreatedResponse({ type: RegisterEventResponseDto })
  async register(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    const ctx = requireTenantContext(this.cls);
    return this.registrations.register(ctx, id, { kind: 'dependent', studentId });
  }

  @Delete(':id/registrations/:studentId')
  @HttpCode(204)
  @ApiOperation({
    summary: "Cancel one dependent's registration (free or not-yet-paid)",
  })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ): Promise<void> {
    const ctx = requireTenantContext(this.cls);
    await this.registrations.cancel(ctx, id, { kind: 'dependent', studentId });
  }
}
