/**
 * Local aliases over the generated contract for the billing RN slice
 * (BIL.16-18). Wallet/payment shapes are aliased here (same pattern as the
 * enrollment slice) until a shared alias bump.
 */

import type { ApiSchemas } from '@tatame/shared';

export type WalletResponse = ApiSchemas['WalletResponseDto'];
export type WalletPlan = ApiSchemas['PlanDto'];
export type ChargeWithPayments = ApiSchemas['ChargeWithPaymentsDto'];
export type ChargeView = ApiSchemas['ChargeDto'];
export type PaymentView = ApiSchemas['PaymentDto'];
export type PaymentMethod = PaymentView['method'];
export type PaymentCreatedResponse = ApiSchemas['PaymentCreatedResponseDto'];
export type SimulatePaymentResponse = ApiSchemas['SimulatePaymentResponseDto'];
export type ReceiptResponse = ApiSchemas['ReceiptResponseDto'];
export type HistoryEntry = ApiSchemas['HistoryEntryDto'];
export type GuardianHistoryEntry = ApiSchemas['GuardianHistoryEntryDto'];
export type GuardianPaymentsResponse =
  ApiSchemas['GuardianPaymentsResponseDto'];
export type DependentPayments = ApiSchemas['DependentPaymentsDto'];
export type MensalidadeAlert = ApiSchemas['MensalidadeAlertDto'];
