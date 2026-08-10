package br.com.tatame.core.network

import br.com.tatame.core.network.dto.CreateChargePaymentRequest
import br.com.tatame.core.network.dto.CreateOrderRequest
import br.com.tatame.core.network.dto.CreateOrderResponse
import br.com.tatame.core.network.dto.OrdersResponse
import br.com.tatame.core.network.dto.PaymentCreatedResponse
import br.com.tatame.core.network.dto.ProductDetail
import br.com.tatame.core.network.dto.VitrineResponse
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Hand-written thin Retrofit interface over the shared storefront surface
 * (spec 009, STO.5) — same fallback convention as [AuthApi]/[BillingApi]
 * (rationale in app/build.gradle.kts `generateApiClient`). One feature, two
 * shells: every route is role-gated to student + professor server-side.
 *
 * Money stays on the billing rails: order creation returns a `chargeId`, the
 * payment route is the persona-neutral wallet twin, and settlement flows only
 * through the existing gated simulate endpoint ([BillingApi.simulate], which
 * gained the professor role in STO.5). Admin store routes are web-console
 * only and NOT mirrored here (professor is strictly consumer-side).
 */
interface StoreApi {

    /** Vitrine: `?search=` over name+tags, `?categoryId=` one-chip filter. */
    @GET("v1/store/products")
    suspend fun vitrine(
        @Query("search") search: String? = null,
        @Query("categoryId") categoryId: String? = null,
    ): VitrineResponse

    @GET("v1/store/products/{id}")
    suspend fun productDetail(@Path("id") productId: String): ProductDetail

    /** "Comprar com Pix · R$ X" — pending order + order-origin charge. */
    @POST("v1/store/orders")
    suspend fun createOrder(@Body body: CreateOrderRequest): CreateOrderResponse

    @GET("v1/store/orders")
    suspend fun myOrders(): OrdersResponse

    /** 204; pending only — a paid order is undone solely by the admin refund. */
    @DELETE("v1/store/orders/{id}")
    suspend fun cancelOrder(@Path("id") orderId: String)

    /** Pix payment on an own order charge (@BypassReadOnly server-side). */
    @POST("v1/store/charges/{id}/payments")
    suspend fun pay(
        @Path("id") chargeId: String,
        @Body body: CreateChargePaymentRequest,
    ): PaymentCreatedResponse
}
