import { Module } from '@nestjs/common';
import { DbModule } from '../../infra/db/db.module.js';
import { GraduationCoreModule } from '../graduation/graduation-core.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { AdminAttendanceController } from './controllers/admin-attendance.controller.js';
import { AlunoAttendanceController } from './controllers/aluno-attendance.controller.js';
import { ProfessorDashboardController } from './controllers/professor-dashboard.controller.js';
import { ProfessorLiveController } from './controllers/professor-live.controller.js';
import { ProfessorRollCallController } from './controllers/professor-roll-call.controller.js';
import { AttendanceEventsBridge } from './realtime/attendance-events.bridge.js';
import { LiveRoomRegistry } from './realtime/live-room.registry.js';
import { StreamTicketService } from './realtime/stream-ticket.service.js';
import { CheckinService } from './services/checkin.service.js';
import { DirectoryService } from './services/directory.service.js';
import { LiveCodeService } from './services/live-code.service.js';
import { RollCallService } from './services/roll-call.service.js';
import { SessionService } from './services/session.service.js';
import { StatsService } from './services/stats.service.js';

/**
 * Attendance feature module (spec 004): owns class sessions, live codes,
 * attendances, derived stats and the SSE stream (module-layout decision
 * be-01). Depends on identity only through its exported seams (permissions
 * for the gamification toggle; the guard chain is global). Side effects ride
 * the `@nestjs/event-emitter` bus, emitted post-commit and bridged to the
 * in-process live rooms (realtime decision be-09).
 */
@Module({
  imports: [DbModule, IdentityModule, GraduationCoreModule],
  controllers: [
    AlunoAttendanceController,
    ProfessorLiveController,
    ProfessorRollCallController,
    ProfessorDashboardController,
    AdminAttendanceController,
  ],
  providers: [
    SessionService,
    StatsService,
    CheckinService,
    LiveCodeService,
    RollCallService,
    DirectoryService,
    StreamTicketService,
    LiveRoomRegistry,
    AttendanceEventsBridge,
  ],
  // StatsService is exported for graduation's professor-11 stat tiles
  // (GRD.10) — the reuse seam of the resolved module-layout decision.
  exports: [StreamTicketService, StatsService],
})
export class AttendanceModule {}
