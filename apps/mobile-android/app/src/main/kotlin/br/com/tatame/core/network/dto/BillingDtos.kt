// Hand-written mirror of the billing surface of packages/shared/src/api/openapi.json
// (fallback per ticket mobile-android/02 — see app/build.gradle.kts `generateApiClient`).
// Field names MUST stay 1:1 with the spec; regenerate-by-hand on contract changes.

package br.com.tatame.core.network.dto

import kotlinx.serialization.Serializable

/** `payment_method` enum values (schema/enums stay English per charter). */
object PaymentMethods {
    const val PIX = "pix"
    const val BOLETO = "boleto"
    const val CARD = "card"
}

/** `payment_provider` enum values — the simulate button renders only for [SIMULATED]. */
object PaymentProviders {
    const val SIMULATED = "simulated"
    const val STRIPE = "stripe"
}

/** `charge_status` enum values. */
object ChargeStatuses {
    const val OPEN = "open"
    const val PAID = "paid"
    const val OVERDUE = "overdue"
    const val CANCELED = "canceled"
    const val REFUNDED = "refunded"
}

/** `payment_status` enum values. */
object PaymentStatuses {
    const val PENDING = "pending"
    const val SUCCEEDED = "succeeded"
    const val FAILED = "failed"
    const val REFUNDED = "refunded"
}

/** `PlanDto` — the aluno's academy mensalidade plan (header line on the Carteira). */
@Serializable
data class Plan(
    val id: String,
    val name: String,
    val amountCents: Long,
    val currency: String, // "BRL"
    val recurrence: String, // monthly | quarterly | semiannual | yearly
    val dueDay: Int,
    val isActive: Boolean,
)

/**
 * `ChargeDto` — `overdue` is the derived truth (never the lazy status flip).
 * `studentId` is null only on order-origin charges of a professor buyer
 * (spec 009 relaxed the column; the shape here follows the contract).
 */
@Serializable
data class Charge(
    val id: String,
    val studentId: String? = null,
    val guardianId: String? = null,
    val status: String, // open | paid | overdue | canceled | refunded
    val overdue: Boolean,
    val amountCents: Long,
    val currency: String,
    val dueDate: String, // "2026-08-10"
    val periodStart: String? = null,
    val periodEnd: String? = null,
    val academyPlanId: String? = null,
)

/**
 * `PaymentDto.providerData` — render-ready provider snapshot (Pix QR payload +
 * copia-e-cola, boleto linha digitável + barcode, card brand/last4). Typed
 * optional mirror of the jsonb column; unknown keys are ignored.
 */
@Serializable
data class PaymentProviderData(
    val qrPayload: String? = null,
    val copiaECola: String? = null,
    val linhaDigitavel: String? = null,
    val barcodePayload: String? = null,
    val brand: String? = null,
    val last4: String? = null,
)

/** `PaymentDto` — one settlement attempt on a charge. */
@Serializable
data class Payment(
    val id: String,
    val chargeId: String,
    val method: String, // pix | boleto | card
    val status: String, // pending | succeeded | failed | refunded
    val amountCents: Long,
    val currency: String,
    val provider: String, // simulated | stripe
    val providerData: PaymentProviderData? = null,
    val paidAt: String? = null,
    val receiptUrl: String? = null,
)

/** `ChargeWithPaymentsDto` — the Carteira's current-cycle charge + its attempts. */
@Serializable
data class ChargeWithPayments(
    val id: String,
    val studentId: String,
    val guardianId: String? = null,
    val status: String,
    val overdue: Boolean,
    val amountCents: Long,
    val currency: String,
    val dueDate: String,
    val periodStart: String? = null,
    val periodEnd: String? = null,
    val academyPlanId: String? = null,
    val payments: List<Payment> = emptyList(),
)

/** `WalletStudentDto` */
@Serializable
data class WalletStudent(
    val id: String,
    val fullName: String,
)

/** `WalletRecurrenceDto` — the "Cobrança recorrente ativa" banner switch. */
@Serializable
data class WalletRecurrence(
    val active: Boolean,
    val nextChargeDueDate: String? = null, // "2026-09-01"
)

/** `HistoryEntryDto` — one settled Histórico row (aluno wallet). */
@Serializable
data class HistoryEntry(
    val studentId: String,
    val chargeId: String,
    val periodStart: String? = null,
    val amountCents: Long,
    val currency: String,
    val chargeStatus: String, // paid | refunded
    val paymentId: String,
    val method: String,
    val paidAt: String? = null,
    val receiptUrl: String? = null,
)

/** `WalletResponseDto` — `plan` null = no assigned plan → clean empty state. */
@Serializable
data class WalletResponse(
    val student: WalletStudent,
    val plan: Plan? = null,
    val currentCharge: ChargeWithPayments? = null,
    val recurrence: WalletRecurrence,
    val history: List<HistoryEntry> = emptyList(),
)

/** `CardDetailsDto` — display metadata only, never a PAN (client-derived last4). */
@Serializable
data class CardDetails(
    val holderName: String? = null,
    val last4: String? = null,
)

/**
 * `CreateChargePaymentDto` — `recurrence` is card-only (422
 * `billing.method_mandate_mismatch` otherwise) and creates the mandate in the
 * same gesture.
 */
@Serializable
data class CreateChargePaymentRequest(
    val method: String,
    val recurrence: Boolean? = null,
    val card: CardDetails? = null,
)

/** `PaymentCreatedResponseDto` — `mandateCreated` true when the toggle made a mandate. */
@Serializable
data class PaymentCreatedResponse(
    val payment: Payment,
    val charge: Charge,
    val mandateCreated: Boolean,
)

/** `SimulatePaymentResponseDto` — the settled attempt + the paid charge. */
@Serializable
data class SimulatePaymentResponse(
    val payment: Payment,
    val charge: Charge,
)

/** `ReceiptResponseDto` — comprovante data for a settled payment. */
@Serializable
data class ReceiptResponse(
    val payment: Payment,
    val charge: Charge,
    val studentName: String,
    val planName: String? = null,
    val academyName: String? = null,
)

/** `DependentPaymentsDto` — one per-dependent mensalidade card (responsavel-04). */
@Serializable
data class DependentPayments(
    val studentId: String,
    val fullName: String,
    val plan: Plan? = null,
    val currentCharge: ChargeWithPayments? = null,
    val recurrenceActive: Boolean,
)

/** `GuardianHistoryEntryDto` — consolidated Histórico row (carries the child's name). */
@Serializable
data class GuardianHistoryEntry(
    val studentId: String,
    val chargeId: String,
    val periodStart: String? = null,
    val amountCents: Long,
    val currency: String,
    val chargeStatus: String, // paid | refunded
    val paymentId: String,
    val method: String,
    val paidAt: String? = null,
    val receiptUrl: String? = null,
    val studentName: String,
)

/** `GuardianPaymentsResponseDto` */
@Serializable
data class GuardianPaymentsResponse(
    val dependents: List<DependentPayments> = emptyList(),
    val history: List<GuardianHistoryEntry> = emptyList(),
)

/**
 * `MensalidadeAlertDto` — the real "mensalidade em aberto" alert payload folded
 * into the aluno home and the responsável dependent cards (spec 006, stories
 * 7/22); `chargeId` deep-links into the Carteira.
 */
@Serializable
data class MensalidadeAlert(
    val chargeId: String,
    val amountCents: Long,
    val currency: String,
    val dueDate: String, // "2026-08-10"
    val overdue: Boolean,
    val periodStart: String? = null,
)
