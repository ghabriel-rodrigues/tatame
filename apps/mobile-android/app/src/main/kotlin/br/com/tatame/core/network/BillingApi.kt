package br.com.tatame.core.network

import br.com.tatame.core.network.dto.CreateChargePaymentRequest
import br.com.tatame.core.network.dto.GuardianPaymentsResponse
import br.com.tatame.core.network.dto.PaymentCreatedResponse
import br.com.tatame.core.network.dto.ReceiptResponse
import br.com.tatame.core.network.dto.SimulatePaymentResponse
import br.com.tatame.core.network.dto.WalletResponse
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/**
 * Hand-written thin Retrofit interface over the billing surface (spec 006,
 * BIL.19–21) — same fallback convention as [AuthApi]/[GraduationApi]
 * (rationale in app/build.gradle.kts `generateApiClient`).
 *
 * Wallet/payments GETs are money-displaying entry points: the server runs the
 * idempotent current-cycle materialization before reading. The simulate route
 * exists only when the simulated provider is configured (404 otherwise) —
 * clients additionally gate the button on `payment.provider == simulated`.
 * Admin/platform billing surfaces are web-console only and NOT mirrored here.
 */
interface BillingApi {

    // ---- aluno Carteira (BIL.19/20) --------------------------------------

    @GET("v1/aluno/wallet")
    suspend fun wallet(): WalletResponse

    @POST("v1/aluno/wallet/charges/{id}/payments")
    suspend fun pay(
        @Path("id") chargeId: String,
        @Body body: CreateChargePaymentRequest,
    ): PaymentCreatedResponse

    /** 204 on success; 404 when no mandate is active (thrown as HttpException). */
    @DELETE("v1/aluno/wallet/mandate")
    suspend fun cancelMandate()

    // ---- responsável Pagamentos (BIL.21) ---------------------------------

    @GET("v1/responsavel/payments")
    suspend fun guardianPayments(): GuardianPaymentsResponse

    @POST("v1/responsavel/payments/charges/{id}/payments")
    suspend fun guardianPay(
        @Path("id") chargeId: String,
        @Body body: CreateChargePaymentRequest,
    ): PaymentCreatedResponse

    // ---- shared (simulate + comprovante) ---------------------------------

    @POST("v1/billing/payments/{id}/simulate")
    suspend fun simulate(@Path("id") paymentId: String): SimulatePaymentResponse

    @GET("v1/billing/payments/{id}/receipt")
    suspend fun receipt(@Path("id") paymentId: String): ReceiptResponse
}
