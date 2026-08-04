import { Module } from '@nestjs/common';
import { DbModule } from '../../infra/db/db.module.js';
import { GraduationAwardService } from './services/graduation-award.service.js';
import { GraduationProgressService } from './services/graduation-progress.service.js';
import { GraduationQueryService } from './services/graduation-query.service.js';
import { GraduationRulesService } from './services/graduation-rules.service.js';
import { StudentNotesService } from './services/student-notes.service.js';

/**
 * Leaf slice of the graduation module (spec 005): derivation, rules, progress,
 * awards and notes — no dependency on any other feature module, so enrollment
 * and attendance can fold the belt/progress payloads into their existing
 * responses (GRD.6) without an import cycle. Controllers and the screen
 * assemblies that DO consume attendance stats live in `GraduationModule`.
 */
@Module({
  imports: [DbModule],
  providers: [
    GraduationQueryService,
    GraduationRulesService,
    GraduationProgressService,
    GraduationAwardService,
    StudentNotesService,
  ],
  exports: [
    GraduationQueryService,
    GraduationRulesService,
    GraduationProgressService,
    GraduationAwardService,
    StudentNotesService,
  ],
})
export class GraduationCoreModule {}
