import { Module } from '@nestjs/common';
import { DbModule } from '../../infra/db/db.module.js';
import { BillingModule } from '../billing/billing.module.js';
import { AdminEventsController } from './controllers/admin-events.controller.js';
import { AlunoEventsController } from './controllers/aluno-events.controller.js';
import { ResponsavelEventsController } from './controllers/responsavel-events.controller.js';
import { AdminEventsService } from './services/admin-events.service.js';
import { EventRegistrationsService } from './services/event-registrations.service.js';
import { EventsQueryService } from './services/events-query.service.js';

/**
 * Events feature module (spec 008): the admin Eventos console, the aluno
 * detail/confirm/pay flows and the responsável per-dependent confirmation.
 * Money stays in billing — this module consumes the EventChargesService seam
 * and never touches the provider port; settlement flows back through the
 * normalized-event handler (succeeded → confirmed, refunded → canceled).
 *
 * No professor controller exists here — the professor surface is read-only
 * (dashboard tile + calendar dots), enforced structurally by the CI
 * route-metadata assertion, and the admin "Criar eventos" permission toggle
 * stays render-only in v1.
 */
@Module({
  imports: [DbModule, BillingModule],
  controllers: [AdminEventsController, AlunoEventsController, ResponsavelEventsController],
  providers: [AdminEventsService, EventRegistrationsService, EventsQueryService],
  // EventsQueryService feeds the AGD `events` contracts (agenda module) and
  // the home/dashboard enrichments (attendance module).
  exports: [EventsQueryService],
})
export class EventsModule {}
