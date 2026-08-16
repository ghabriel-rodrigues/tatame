import { Module } from '@nestjs/common';
import { DbModule } from '../../infra/db/db.module.js';
import { BillingModule } from '../billing/billing.module.js';
import { AdminReportsController } from './controllers/admin-reports.controller.js';
import { RankingsController } from './controllers/rankings.controller.js';
import { RankingsService } from './services/rankings.service.js';
import { ReportsCsvService } from './services/reports-csv.service.js';
import { ReportsService } from './services/reports.service.js';

/**
 * Reports & rankings feature module (spec 013, REP.3–REP.5): the admin
 * Relatórios read models with their CSV serializations, and the academy-wide
 * ranking endpoint both the aluno and professor screens consume. Owns the
 * cross-slice read models spec 004 deferred here ("admin reports slice owns
 * the console reporting surface"); imports billing only for the idempotent
 * charge-materialization pass the financeiro report must run first.
 */
@Module({
  imports: [DbModule, BillingModule],
  controllers: [AdminReportsController, RankingsController],
  providers: [ReportsService, ReportsCsvService, RankingsService],
})
export class ReportsModule {}
