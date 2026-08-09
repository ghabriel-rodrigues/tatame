package br.com.tatame.testutil

import br.com.tatame.core.billing.BillingRepository
import br.com.tatame.core.network.ApiError
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.dto.CardDetails
import br.com.tatame.core.network.dto.Charge
import br.com.tatame.core.network.dto.ChargeStatuses
import br.com.tatame.core.network.dto.ChargeWithPayments
import br.com.tatame.core.network.dto.DependentPayments
import br.com.tatame.core.network.dto.GuardianHistoryEntry
import br.com.tatame.core.network.dto.GuardianPaymentsResponse
import br.com.tatame.core.network.dto.HistoryEntry
import br.com.tatame.core.network.dto.Payment
import br.com.tatame.core.network.dto.PaymentCreatedResponse
import br.com.tatame.core.network.dto.PaymentMethods
import br.com.tatame.core.network.dto.PaymentProviderData
import br.com.tatame.core.network.dto.PaymentProviders
import br.com.tatame.core.network.dto.PaymentStatuses
import br.com.tatame.core.network.dto.Plan
import br.com.tatame.core.network.dto.ReceiptResponse
import br.com.tatame.core.network.dto.SimulatePaymentResponse
import br.com.tatame.core.network.dto.WalletRecurrence
import br.com.tatame.core.network.dto.WalletResponse
import br.com.tatame.core.network.dto.WalletStudent

/** Configurable in-memory [BillingRepository] for ViewModel tests. */
class FakeBillingRepository : BillingRepository {

    var walletResult: ApiResult<WalletResponse> = ApiResult.Failure(ApiError.Network)
    var payPixResult: ApiResult<PaymentCreatedResponse> = ApiResult.Failure(ApiError.Network)
    var payBoletoResult: ApiResult<PaymentCreatedResponse> = ApiResult.Failure(ApiError.Network)
    var payCardResult: ApiResult<PaymentCreatedResponse> = ApiResult.Failure(ApiError.Network)
    var cancelMandateResult: ApiResult<Unit> = ApiResult.Success(Unit)
    var guardianPaymentsResult: ApiResult<GuardianPaymentsResponse> =
        ApiResult.Failure(ApiError.Network)
    var guardianPayPixResult: ApiResult<PaymentCreatedResponse> =
        ApiResult.Failure(ApiError.Network)
    var simulateResult: ApiResult<SimulatePaymentResponse> = ApiResult.Failure(ApiError.Network)
    var receiptResult: ApiResult<ReceiptResponse> = ApiResult.Failure(ApiError.Network)

    var walletCalls = 0
    val payPixCalls = mutableListOf<String>()
    val payBoletoCalls = mutableListOf<String>()
    val payCardCalls = mutableListOf<Triple<String, Boolean, CardDetails?>>()
    var cancelMandateCalls = 0
    var guardianPaymentsCalls = 0
    val guardianPayPixCalls = mutableListOf<String>()
    val simulateCalls = mutableListOf<String>()
    val receiptCalls = mutableListOf<String>()

    override suspend fun wallet(): ApiResult<WalletResponse> {
        walletCalls++
        return walletResult
    }

    override suspend fun payPix(chargeId: String): ApiResult<PaymentCreatedResponse> {
        payPixCalls += chargeId
        return payPixResult
    }

    override suspend fun payBoleto(chargeId: String): ApiResult<PaymentCreatedResponse> {
        payBoletoCalls += chargeId
        return payBoletoResult
    }

    override suspend fun payCard(
        chargeId: String,
        recurrence: Boolean,
        card: CardDetails?,
    ): ApiResult<PaymentCreatedResponse> {
        payCardCalls += Triple(chargeId, recurrence, card)
        return payCardResult
    }

    override suspend fun cancelMandate(): ApiResult<Unit> {
        cancelMandateCalls++
        return cancelMandateResult
    }

    override suspend fun guardianPayments(): ApiResult<GuardianPaymentsResponse> {
        guardianPaymentsCalls++
        return guardianPaymentsResult
    }

    override suspend fun guardianPayPix(chargeId: String): ApiResult<PaymentCreatedResponse> {
        guardianPayPixCalls += chargeId
        return guardianPayPixResult
    }

    override suspend fun simulate(paymentId: String): ApiResult<SimulatePaymentResponse> {
        simulateCalls += paymentId
        return simulateResult
    }

    override suspend fun receipt(paymentId: String): ApiResult<ReceiptResponse> {
        receiptCalls += paymentId
        return receiptResult
    }
}

// ---- fixture builders ----------------------------------------------------

fun plan(
    id: String = "pl1",
    name: String = "Mensal",
    amountCents: Long = 18_000,
    recurrence: String = "monthly",
    dueDay: Int = 10,
    isActive: Boolean = true,
) = Plan(
    id = id,
    name = name,
    amountCents = amountCents,
    currency = "BRL",
    recurrence = recurrence,
    dueDay = dueDay,
    isActive = isActive,
)

fun charge(
    id: String = "ch1",
    studentId: String = "st1",
    status: String = ChargeStatuses.OPEN,
    overdue: Boolean = false,
    amountCents: Long = 18_000,
    dueDate: String = "2026-08-10",
    periodStart: String? = "2026-08-01",
    guardianId: String? = null,
) = Charge(
    id = id,
    studentId = studentId,
    guardianId = guardianId,
    status = status,
    overdue = overdue,
    amountCents = amountCents,
    currency = "BRL",
    dueDate = dueDate,
    periodStart = periodStart,
    periodEnd = "2026-08-31",
    academyPlanId = "pl1",
)

fun chargeWithPayments(
    id: String = "ch1",
    studentId: String = "st1",
    status: String = ChargeStatuses.OPEN,
    overdue: Boolean = false,
    amountCents: Long = 18_000,
    dueDate: String = "2026-08-10",
    periodStart: String? = "2026-08-01",
    payments: List<Payment> = emptyList(),
) = ChargeWithPayments(
    id = id,
    studentId = studentId,
    guardianId = null,
    status = status,
    overdue = overdue,
    amountCents = amountCents,
    currency = "BRL",
    dueDate = dueDate,
    periodStart = periodStart,
    periodEnd = "2026-08-31",
    academyPlanId = "pl1",
    payments = payments,
)

fun payment(
    id: String = "pay1",
    chargeId: String = "ch1",
    method: String = PaymentMethods.PIX,
    status: String = PaymentStatuses.PENDING,
    amountCents: Long = 18_000,
    provider: String = PaymentProviders.SIMULATED,
    providerData: PaymentProviderData? = PaymentProviderData(
        qrPayload = "TATAME-SIM-PIX-ch1",
        copiaECola = "TATAME-SIM-PIX-ch1",
    ),
    paidAt: String? = null,
    receiptUrl: String? = null,
) = Payment(
    id = id,
    chargeId = chargeId,
    method = method,
    status = status,
    amountCents = amountCents,
    currency = "BRL",
    provider = provider,
    providerData = providerData,
    paidAt = paidAt,
    receiptUrl = receiptUrl,
)

fun walletResponse(
    plan: Plan? = plan(),
    currentCharge: ChargeWithPayments? = chargeWithPayments(),
    recurrence: WalletRecurrence = WalletRecurrence(active = false),
    history: List<HistoryEntry> = emptyList(),
) = WalletResponse(
    student = WalletStudent(id = "st1", fullName = "Lucas Almeida"),
    plan = plan,
    currentCharge = currentCharge,
    recurrence = recurrence,
    history = history,
)

fun historyEntry(
    chargeId: String = "ch0",
    paymentId: String = "pay0",
    periodStart: String? = "2026-07-01",
    method: String = PaymentMethods.PIX,
    chargeStatus: String = ChargeStatuses.PAID,
    paidAt: String? = "2026-07-08T12:00:00.000Z",
) = HistoryEntry(
    studentId = "st1",
    chargeId = chargeId,
    periodStart = periodStart,
    amountCents = 18_000,
    currency = "BRL",
    chargeStatus = chargeStatus,
    paymentId = paymentId,
    method = method,
    paidAt = paidAt,
    receiptUrl = null,
)

fun paymentCreated(
    payment: Payment = payment(),
    charge: Charge = charge(),
    mandateCreated: Boolean = false,
) = PaymentCreatedResponse(payment = payment, charge = charge, mandateCreated = mandateCreated)

fun simulateResponse(
    payment: Payment = payment(status = PaymentStatuses.SUCCEEDED, paidAt = "2026-08-02T12:00:00.000Z"),
    charge: Charge = charge(status = ChargeStatuses.PAID),
) = SimulatePaymentResponse(payment = payment, charge = charge)

fun receiptResponse(
    payment: Payment = payment(status = PaymentStatuses.SUCCEEDED, paidAt = "2026-08-02T12:00:00.000Z"),
    charge: Charge = charge(status = ChargeStatuses.PAID),
    studentName: String = "Lucas Almeida",
    planName: String? = "Mensal",
    academyName: String? = "Horizonte BJJ",
) = ReceiptResponse(
    payment = payment,
    charge = charge,
    studentName = studentName,
    planName = planName,
    academyName = academyName,
)

fun dependentPayments(
    studentId: String = "dst1",
    fullName: String = "Pedro Silveira",
    plan: Plan? = plan(id = "pl-kids", name = "Kids", amountCents = 15_000),
    currentCharge: ChargeWithPayments? = chargeWithPayments(
        id = "dch1",
        studentId = studentId,
        amountCents = 15_000,
    ),
    recurrenceActive: Boolean = false,
) = DependentPayments(
    studentId = studentId,
    fullName = fullName,
    plan = plan,
    currentCharge = currentCharge,
    recurrenceActive = recurrenceActive,
)

fun guardianHistoryEntry(
    studentId: String = "dst1",
    studentName: String = "Pedro Silveira",
    chargeId: String = "dch0",
    paymentId: String = "dpay0",
    method: String = PaymentMethods.PIX,
    periodStart: String? = "2026-07-01",
    paidAt: String? = "2026-07-08T12:00:00.000Z",
) = GuardianHistoryEntry(
    studentId = studentId,
    chargeId = chargeId,
    periodStart = periodStart,
    amountCents = 15_000,
    currency = "BRL",
    chargeStatus = ChargeStatuses.PAID,
    paymentId = paymentId,
    method = method,
    paidAt = paidAt,
    receiptUrl = null,
    studentName = studentName,
)

fun guardianPayments(
    dependents: List<DependentPayments> = listOf(dependentPayments()),
    history: List<GuardianHistoryEntry> = listOf(guardianHistoryEntry()),
) = GuardianPaymentsResponse(dependents = dependents, history = history)
