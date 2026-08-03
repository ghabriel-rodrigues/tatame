import { Module } from '@nestjs/common';
import { DbModule } from '../../infra/db/db.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { AdminClassesController } from './controllers/admin-classes.controller.js';
import { AdminGuardiansController } from './controllers/admin-guardians.controller.js';
import { AdminProfessorsController } from './controllers/admin-professors.controller.js';
import { AdminStudentsController } from './controllers/admin-students.controller.js';
import { ProfessorClassesController } from './controllers/professor-classes.controller.js';
import { ResponsavelDependentsController } from './controllers/responsavel-dependents.controller.js';
import { ClassService } from './services/class.service.js';
import { DependentsService } from './services/dependents.service.js';
import { EnrollmentService } from './services/enrollment.service.js';
import { ProfessorRegistryService } from './services/professor-registry.service.js';
import { RegistryService } from './services/registry.service.js';

/**
 * Enrollment feature module (spec 003): owns the student ↔ guardian ↔ turma
 * triangle with persona-scoped controllers per the module-layout decision
 * (be-01). Depends on identity only through its exported seams (password
 * reset for the professor set-your-password email); invite-accept persistence
 * runs inside identity's SECURITY DEFINER seam, not through this module.
 */
@Module({
  imports: [DbModule, IdentityModule],
  controllers: [
    AdminStudentsController,
    AdminGuardiansController,
    AdminProfessorsController,
    AdminClassesController,
    ProfessorClassesController,
    ResponsavelDependentsController,
  ],
  providers: [
    RegistryService,
    ProfessorRegistryService,
    ClassService,
    EnrollmentService,
    DependentsService,
  ],
  exports: [EnrollmentService, ClassService],
})
export class EnrollmentModule {}
