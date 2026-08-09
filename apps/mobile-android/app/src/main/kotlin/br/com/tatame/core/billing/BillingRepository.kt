package br.com.tatame.core.billing

import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.BillingApi
import br.com.tatame.core.network.ProblemJson
import br.com.tatame.core.network.apiCall
import br.com.tatame.core.network.dto.CardDetails
import br.com.tatame.core.network.dto.CreateChargePaymentRequest
import br.com.tatame.core.network.dto.GuardianPaymentsResponse
import br.com.tatame.core.network.dto.PaymentCreatedResponse
import br.com.tatame.core.network.dto.PaymentMethods
import br.com.tatame.core.network.dto.ReceiptResponse
import br.com.tatame.core.network.dto.SimulatePaymentResponse
import br.com.tatame.core.network.dto.WalletResponse
import kotlinx.serialization.json.Json

/**
 * Seam the billing feature ViewModels talk through (fakeable in JVM tests) —
 * same convention as [br.com.tatame.core.graduation.GraduationRepository].
 * One method per payment method keeps the request-shape rules (`recurrence`
 * and `card` are card-only) in one place.
 */
interface BillingRepository {
    // aluno Carteira (BIL.19/20)
    suspend fun wallet(): ApiResult<WalletResponse>
    suspend fun payPix(chargeId: String): ApiResult<PaymentCreatedResponse>
    suspend fun payBoleto(chargeId: String): ApiResult<PaymentCreatedResponse>
    suspend fun payCard(
        chargeId: String,
        recurrence: Boolean,
        card: CardDetails?,
    ): ApiResult<PaymentCreatedResponse>
    suspend fun cancelMandate(): ApiResult<Unit>

    // responsável Pagamentos (BIL.21)
    suspend fun guardianPayments(): ApiResult<GuardianPaymentsResponse>
    suspend fun guardianPayPix(chargeId: String): ApiResult<PaymentCreatedResponse>

    // shared (simulate + comprovante)
    suspend fun simulate(paymentId: String): ApiResult<SimulatePaymentResponse>
    suspend fun receipt(paymentId: String): ApiResult<ReceiptResponse>
}

class BillingRepositoryImpl(
    private val api: BillingApi,
    private val json: Json = ProblemJson,
) : BillingRepository {

    override suspend fun wallet(): ApiResult<WalletResponse> = apiCall(json) { api.wallet() }

    override suspend fun payPix(chargeId: String): ApiResult<PaymentCreatedResponse> =
        apiCall(json) { api.pay(chargeId, CreateChargePaymentRequest(method = PaymentMethods.PIX)) }

    override suspend fun payBoleto(chargeId: String): ApiResult<PaymentCreatedResponse> =
        apiCall(json) {
            api.pay(chargeId, CreateChargePaymentRequest(method = PaymentMethods.BOLETO))
        }

    override suspend fun payCard(
        chargeId: String,
        recurrence: Boolean,
        card: CardDetails?,
    ): ApiResult<PaymentCreatedResponse> = apiCall(json) {
        api.pay(
            chargeId,
            CreateChargePaymentRequest(
                method = PaymentMethods.CARD,
                recurrence = recurrence,
                card = card,
            ),
        )
    }

    override suspend fun cancelMandate(): ApiResult<Unit> = apiCall(json) { api.cancelMandate() }

    override suspend fun guardianPayments(): ApiResult<GuardianPaymentsResponse> =
        apiCall(json) { api.guardianPayments() }

    override suspend fun guardianPayPix(chargeId: String): ApiResult<PaymentCreatedResponse> =
        apiCall(json) {
            api.guardianPay(chargeId, CreateChargePaymentRequest(method = PaymentMethods.PIX))
        }

    override suspend fun simulate(paymentId: String): ApiResult<SimulatePaymentResponse> =
        apiCall(json) { api.simulate(paymentId) }

    override suspend fun receipt(paymentId: String): ApiResult<ReceiptResponse> =
        apiCall(json) { api.receipt(paymentId) }
}
