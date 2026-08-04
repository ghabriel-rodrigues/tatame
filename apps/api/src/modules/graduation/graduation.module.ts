import { Module } from '@nestjs/common';
import { DbModule } from '../../infra/db/db.module.js';
import { AttendanceModule } from '../attendance/attendance.module.js';
import { AdminGraduationController } from './controllers/admin-graduation.controller.js';
import { AlunoGraduationController } from './controllers/aluno-graduation.controller.js';
import { ProfessorGraduationController } from './controllers/professor-graduation.controller.js';
import { GraduationCoreModule } from './graduation-core.module.js';
import { GraduationProfileService } from './services/graduation-profile.service.js';

/**
 * Graduation feature module (spec 005): persona-scoped controllers under the
 * global guard chain (default-deny roles, academy-status read-only block,
 * RLS backstop; foreign ids are 404, never 403). Depends on attendance only
 * for the exported Phase-4 stats (the professor-11 tiles); the derivation
 * core lives in `GraduationCoreModule` so list surfaces can reuse it.
 */
@Module({
  imports: [DbModule, GraduationCoreModule, AttendanceModule],
  controllers: [AlunoGraduationController, ProfessorGraduationController, AdminGraduationController],
  providers: [GraduationProfileService],
})
export class GraduationModule {}
