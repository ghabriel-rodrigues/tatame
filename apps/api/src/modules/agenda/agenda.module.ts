import { Module } from '@nestjs/common';
import { DbModule } from '../../infra/db/db.module.js';
import { EventsModule } from '../events/events.module.js';
import { GraduationCoreModule } from '../graduation/graduation-core.module.js';
import { AdminCalendarController } from './controllers/admin-calendar.controller.js';
import { AlunoAgendaController } from './controllers/aluno-agenda.controller.js';
import { ProfessorCalendarController } from './controllers/professor-calendar.controller.js';
import { AgendaService } from './services/agenda.service.js';

/**
 * Agenda feature module (spec 007): read models only over Phase 3/4 data —
 * the aluno weekday agenda and the three persona month calendars. Zero
 * migrations, zero writes; write paths stay with their owning modules. Since
 * spec 008 the `events` arrays are real (EventsQueryService month buckets).
 */
@Module({
  imports: [DbModule, GraduationCoreModule, EventsModule],
  controllers: [AlunoAgendaController, ProfessorCalendarController, AdminCalendarController],
  providers: [AgendaService],
})
export class AgendaModule {}
