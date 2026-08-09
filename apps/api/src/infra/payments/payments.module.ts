import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { PAYMENT_PROVIDER_PORT, type PaymentProviderPort } from './payment-provider.port.js';
import { SimulatedPaymentProvider } from './simulated-payment.provider.js';
import { StripePaymentProvider } from './stripe-payment.provider.js';

/**
 * Payments infra seam (spec 006, BIL.6) — config factory on
 * `PAYMENTS_PROVIDER` (default `simulated`), mirroring the notifications
 * driver factory. The billing module consumes the port token only; provider
 * SDKs never leak past this module.
 */
@Module({
  providers: [
    {
      provide: PAYMENT_PROVIDER_PORT,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): PaymentProviderPort =>
        config.paymentsProvider === 'stripe'
          ? new StripePaymentProvider()
          : new SimulatedPaymentProvider(),
    },
  ],
  exports: [PAYMENT_PROVIDER_PORT],
})
export class PaymentsModule {}
