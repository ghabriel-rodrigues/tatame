import { Module } from '@nestjs/common';
import { DbModule } from '../../infra/db/db.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { PlatformConsoleController } from './controllers/platform-console.controller.js';
import { PlatformAcademiesService } from './services/platform-academies.service.js';
import { PlatformOverviewService } from './services/platform-overview.service.js';
import { PlatformPlansService } from './services/platform-plans.service.js';
import { PlatformTeamService } from './services/platform-team.service.js';

/**
 * Plataforma console module (spec 012). Owns the cross-tenant read models
 * and writes of the SaaS-owner persona. The two platform routes that shipped
 * earlier stay with the services they use — impersonation in identity,
 * repasses in billing — and register under the same `/v1/platform` prefix.
 *
 * Imports IdentityModule for the three seams it reuses rather than
 * duplicates: the audit append, the academy-status cache (a suspension has
 * to bite immediately) and the set-password email path.
 */
@Module({
  imports: [DbModule, IdentityModule],
  controllers: [PlatformConsoleController],
  providers: [
    PlatformOverviewService,
    PlatformAcademiesService,
    PlatformPlansService,
    PlatformTeamService,
  ],
})
export class PlatformModule {}
