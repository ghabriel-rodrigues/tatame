import { Module } from '@nestjs/common';
import { DbModule } from '../../infra/db/db.module.js';
import { BillingModule } from '../billing/billing.module.js';
import { AdminStoreController } from './controllers/admin-store.controller.js';
import { StorefrontController } from './controllers/storefront.controller.js';
import { StoreAdminService } from './services/store-admin.service.js';
import { StoreOrdersService } from './services/store-orders.service.js';
import { StorefrontService } from './services/storefront.service.js';

/**
 * Store feature module (spec 009): the admin Loja console (categorias,
 * produtos, pedidos board, stat tiles) and the shared aluno + professor
 * storefront (vitrine, detail, purchase, Meus pedidos). Money stays in
 * billing — this module consumes the OrderChargesService / PaymentFlowService
 * seams and never touches the provider port; settlement flows back through
 * the normalized-event handler (succeeded → paid + stock decrement,
 * refunded → canceled + restore).
 *
 * The professor surface is strictly consumer-side — zero /admin/store routes
 * reach the professor role, enforced structurally by the CI route-metadata
 * assertion (story 35): "professor has no financial access" survives the
 * professor buying a kimono.
 */
@Module({
  imports: [DbModule, BillingModule],
  controllers: [AdminStoreController, StorefrontController],
  providers: [StoreAdminService, StorefrontService, StoreOrdersService],
  // StorefrontService feeds the aluno home "Loja da academia" strip
  // (attendance module — spec 009, additive).
  exports: [StorefrontService],
})
export class StoreModule {}
