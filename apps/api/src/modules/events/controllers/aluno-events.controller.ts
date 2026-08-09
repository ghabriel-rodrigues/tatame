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
import { AlunoEventDetailResponseDto, RegisterEventResponseDto } from '../dto/responses.dto.js';
import { EventRegistrationsService } from '../services/event-registrations.service.js';
import { EventsQueryService } from '../services/events-query.service.js';

/**
 * Aluno event surface (spec 008, EVT.5 — aluno-10): detail, "Confirmar
 * presença" / "Pagar inscrição" and "Cancelar participação". Paid inscriptions
 * are settled through the EXISTING wallet rails (Pix sheet + simulate) — the
 * POST here only returns the chargeId. New registrations are blocked for
 * read-only academies (no @BypassReadOnly); paying an existing charge is not.
 */
@ApiTags('aluno')
@ApiBearerAuth()
@Roles('student')
@Controller('aluno/events')
export class AlunoEventsController {
  constructor(
    private readonly query: EventsQueryService,
    private readonly registrations: EventRegistrationsService,
    private readonly cls: ClsService,
  ) {}

  @Get(':id')
  @ApiOperation({
    summary: 'Event detail: banner, data/local/responsável, valor chip, own state',
    description: 'Published events only — drafts and canceled events behave as 404.',
  })
  @ApiOkResponse({ type: AlunoEventDetailResponseDto })
  async detail(@Param('id', ParseUUIDPipe) id: string) {
    const ctx = requireTenantContext(this.cls);
    return this.query.alunoDetail(ctx, id);
  }

  @Post(':id/registration')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Confirmar presença (free) / Pagar inscrição (paid → chargeId)',
    description:
      'Gratuito = confirmed on the spot. Paid = pending_payment + an event-origin charge paid ' +
      'via POST /aluno/wallet/charges/{chargeId}/payments (same Pix sheet, same simulate). ' +
      'Cancel-and-reconfirm reuses the same row — one registration per (event, student).',
  })
  @ApiCreatedResponse({ type: RegisterEventResponseDto })
  async register(@Param('id', ParseUUIDPipe) id: string) {
    const ctx = requireTenantContext(this.cls);
    return this.registrations.register(ctx, id, { kind: 'self' });
  }

  @Delete(':id/registration')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Cancelar participação (free or not-yet-paid)',
    description:
      'Canceling a pending registration voids its open charge. A paid, confirmed registration ' +
      'is only undone by an admin refund (409 event.registration_settled).',
  })
  async cancel(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    const ctx = requireTenantContext(this.cls);
    await this.registrations.cancel(ctx, id, { kind: 'self' });
  }
}
