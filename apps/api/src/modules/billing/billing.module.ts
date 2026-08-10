import { Module } from '@nestjs/common';
import { DbModule } from '../../infra/db/db.module.js';
import { PaymentsModule } from '../../infra/payments/payments.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { AdminBillingController } from './controllers/admin-billing.controller.js';
import { AdminPlansController } from './controllers/admin-plans.controller.js';
import { AlunoWalletController } from './controllers/aluno-wallet.controller.js';
import { BillingSharedController } from './controllers/billing-shared.controller.js';
import { PlatformRepassesController } from './controllers/platform-repasses.controller.js';
import { ResponsavelPaymentsController } from './controllers/responsavel-payments.controller.js';
import { AdminOverviewService } from './services/admin-overview.service.js';
import { EventChargesService } from './services/event-charges.service.js';
import { OrderChargesService } from './services/order-charges.service.js';
import { GuardianPaymentsService } from './services/guardian-payments.service.js';
import { MaterializationService } from './services/materialization.service.js';
import { PaymentFlowService } from './services/payment-flow.service.js';
import { PlansService } from './services/plans.service.js';
import { ProviderEventsService } from './services/provider-events.service.js';
import { RepassesService } from './services/repasses.service.js';
import { WalletService } from './services/wallet.service.js';

/**
 * Billing feature module (spec 006, BIL.7–BIL.11): the aluno Carteira, the
 * responsável Pagamentos, the admin Visão financeira + Planos de mensalidade,
 * and the plataforma repasses read model. The only consumer of the
 * PaymentProviderPort (infra/payments); everything downstream of the
 * normalized-event handler is provider-agnostic by construction. No
 * professor controller exists here — the charter denies professors financial
 * access, and the CI route-metadata assertion enforces it structurally.
 */
@Module({
  imports: [DbModule, PaymentsModule, IdentityModule],
  controllers: [
    AlunoWalletController,
    ResponsavelPaymentsController,
    BillingSharedController,
    AdminBillingController,
    AdminPlansController,
    PlatformRepassesController,
  ],
  providers: [
    ProviderEventsService,
    MaterializationService,
    PaymentFlowService,
    WalletService,
    GuardianPaymentsService,
    AdminOverviewService,
    PlansService,
    RepassesService,
    EventChargesService,
    OrderChargesService,
  ],
  // EventChargesService / OrderChargesService are the internal seams the
  // events (spec 008) and store (spec 009) modules use to issue/cancel their
  // origin charges — money stays billing's. PaymentFlowService is exported for
  // the store module's persona-neutral payment route and the admin Cancelado
  // refund path (same audited rails as every other settlement).
  exports: [
    ProviderEventsService,
    MaterializationService,
    EventChargesService,
    OrderChargesService,
    PaymentFlowService,
  ],
})
export class BillingModule {}
