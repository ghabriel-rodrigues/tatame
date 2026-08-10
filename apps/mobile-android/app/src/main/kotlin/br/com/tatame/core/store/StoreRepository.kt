package br.com.tatame.core.store

import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.ProblemJson
import br.com.tatame.core.network.StoreApi
import br.com.tatame.core.network.apiCall
import br.com.tatame.core.network.dto.CreateChargePaymentRequest
import br.com.tatame.core.network.dto.CreateOrderRequest
import br.com.tatame.core.network.dto.CreateOrderResponse
import br.com.tatame.core.network.dto.OrdersResponse
import br.com.tatame.core.network.dto.PaymentCreatedResponse
import br.com.tatame.core.network.dto.PaymentMethods
import br.com.tatame.core.network.dto.ProductDetail
import br.com.tatame.core.network.dto.VitrineResponse
import kotlinx.serialization.json.Json

/**
 * Seam the store feature ViewModels talk through (fakeable in JVM tests) —
 * same convention as [br.com.tatame.core.events.EventsRepository]. [payPix]
 * hits the store's persona-neutral payment route (professor has no Carteira);
 * settlement (simulate) stays on [br.com.tatame.core.billing.BillingRepository]
 * — spec 009: the store never touches the provider port.
 */
interface StoreRepository {
    suspend fun vitrine(
        search: String? = null,
        categoryId: String? = null,
    ): ApiResult<VitrineResponse>

    suspend fun productDetail(productId: String): ApiResult<ProductDetail>

    suspend fun createOrder(
        productId: String,
        size: String?,
        quantity: Int,
    ): ApiResult<CreateOrderResponse>

    suspend fun myOrders(): ApiResult<OrdersResponse>

    suspend fun cancelOrder(orderId: String): ApiResult<Unit>

    suspend fun payPix(chargeId: String): ApiResult<PaymentCreatedResponse>
}

class StoreRepositoryImpl(
    private val api: StoreApi,
    private val json: Json = ProblemJson,
) : StoreRepository {

    override suspend fun vitrine(
        search: String?,
        categoryId: String?,
    ): ApiResult<VitrineResponse> =
        apiCall(json) { api.vitrine(search = search, categoryId = categoryId) }

    override suspend fun productDetail(productId: String): ApiResult<ProductDetail> =
        apiCall(json) { api.productDetail(productId) }

    override suspend fun createOrder(
        productId: String,
        size: String?,
        quantity: Int,
    ): ApiResult<CreateOrderResponse> = apiCall(json) {
        api.createOrder(CreateOrderRequest(productId = productId, size = size, quantity = quantity))
    }

    override suspend fun myOrders(): ApiResult<OrdersResponse> = apiCall(json) { api.myOrders() }

    override suspend fun cancelOrder(orderId: String): ApiResult<Unit> =
        apiCall(json) { api.cancelOrder(orderId) }

    override suspend fun payPix(chargeId: String): ApiResult<PaymentCreatedResponse> =
        apiCall(json) { api.pay(chargeId, CreateChargePaymentRequest(method = PaymentMethods.PIX)) }
}
