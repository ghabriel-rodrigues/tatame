package br.com.tatame.testutil

import br.com.tatame.core.network.ApiError
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.dto.CreateOrderResponse
import br.com.tatame.core.network.dto.OrderStatuses
import br.com.tatame.core.network.dto.OrdersResponse
import br.com.tatame.core.network.dto.PaymentCreatedResponse
import br.com.tatame.core.network.dto.ProductCard
import br.com.tatame.core.network.dto.ProductDetail
import br.com.tatame.core.network.dto.StoreOrder
import br.com.tatame.core.network.dto.StoreOrderItem
import br.com.tatame.core.network.dto.VitrineCategory
import br.com.tatame.core.network.dto.VitrineResponse
import br.com.tatame.core.store.StoreRepository

/** Configurable in-memory [StoreRepository] for ViewModel tests (STO.12/13). */
class FakeStoreRepository : StoreRepository {

    var vitrineResult: ApiResult<VitrineResponse> = ApiResult.Failure(ApiError.Network)
    var detailResult: ApiResult<ProductDetail> = ApiResult.Failure(ApiError.Network)
    var createOrderResult: ApiResult<CreateOrderResponse> = ApiResult.Failure(ApiError.Network)
    var myOrdersResult: ApiResult<OrdersResponse> = ApiResult.Failure(ApiError.Network)
    var cancelOrderResult: ApiResult<Unit> = ApiResult.Success(Unit)
    var payPixResult: ApiResult<PaymentCreatedResponse> = ApiResult.Failure(ApiError.Network)

    val vitrineCalls = mutableListOf<Pair<String?, String?>>()
    val detailCalls = mutableListOf<String>()
    val createOrderCalls = mutableListOf<Triple<String, String?, Int>>()
    var myOrdersCalls = 0
    val cancelOrderCalls = mutableListOf<String>()
    val payPixCalls = mutableListOf<String>()

    override suspend fun vitrine(
        search: String?,
        categoryId: String?,
    ): ApiResult<VitrineResponse> {
        vitrineCalls += search to categoryId
        return vitrineResult
    }

    override suspend fun productDetail(productId: String): ApiResult<ProductDetail> {
        detailCalls += productId
        return detailResult
    }

    override suspend fun createOrder(
        productId: String,
        size: String?,
        quantity: Int,
    ): ApiResult<CreateOrderResponse> {
        createOrderCalls += Triple(productId, size, quantity)
        return createOrderResult
    }

    override suspend fun myOrders(): ApiResult<OrdersResponse> {
        myOrdersCalls++
        return myOrdersResult
    }

    override suspend fun cancelOrder(orderId: String): ApiResult<Unit> {
        cancelOrderCalls += orderId
        return cancelOrderResult
    }

    override suspend fun payPix(chargeId: String): ApiResult<PaymentCreatedResponse> {
        payPixCalls += chargeId
        return payPixResult
    }
}

// ---- fixture builders ----------------------------------------------------

fun productCard(
    id: String = "pr1",
    name: String = "Kimono oficial Horizonte",
    priceCents: Long = 38_900,
    monogram: String = "GI",
    gradientPreset: String = "store-blue-purple",
    categoryId: String? = "cat-kimonos",
    categoryName: String? = "Kimonos",
) = ProductCard(
    id = id,
    name = name,
    priceCents = priceCents,
    monogram = monogram,
    gradientPreset = gradientPreset,
    categoryId = categoryId,
    categoryName = categoryName,
)

fun vitrineCategory(id: String = "cat-kimonos", name: String = "Kimonos") =
    VitrineCategory(id = id, name = name)

fun vitrineResponse(
    products: List<ProductCard> = listOf(productCard()),
    categories: List<VitrineCategory> = listOf(vitrineCategory()),
) = VitrineResponse(products = products, categories = categories)

fun productDetail(
    id: String = "pr1",
    name: String = "Kimono oficial Horizonte",
    priceCents: Long = 38_900,
    monogram: String = "GI",
    gradientPreset: String = "store-blue-purple",
    sizes: List<String> = listOf("P", "M", "G", "GG"),
    tags: List<String> = listOf("kimono", "gi", "competição"),
    stockQty: Int = 12,
    categoryName: String? = "Kimonos",
) = ProductDetail(
    id = id,
    name = name,
    priceCents = priceCents,
    monogram = monogram,
    gradientPreset = gradientPreset,
    categoryId = categoryName?.let { "cat-kimonos" },
    categoryName = categoryName,
    description = "Trançado leve com bordados oficiais da equipe.",
    tags = tags,
    sizes = sizes,
    stockQty = stockQty,
)

fun storeOrderItem(
    productId: String = "pr1",
    productName: String = "Kimono oficial Horizonte",
    size: String? = "M",
    quantity: Int = 1,
    unitPriceCents: Long = 38_900,
) = StoreOrderItem(
    productId = productId,
    productName = productName,
    monogram = "GI",
    gradientPreset = "store-blue-purple",
    size = size,
    quantity = quantity,
    unitPriceCents = unitPriceCents,
)

fun storeOrder(
    id: String = "or1",
    number: Int = 2431,
    status: String = OrderStatuses.PENDING,
    totalCents: Long = 38_900,
    item: StoreOrderItem? = storeOrderItem(),
    chargeId: String? = "ch-or1",
) = StoreOrder(
    id = id,
    number = number,
    status = status,
    totalCents = totalCents,
    pickupNote = "Retirada na recepção",
    createdAt = "2026-08-10T12:00:00.000Z",
    item = item,
    chargeId = chargeId,
)

fun createOrderResponse(
    order: StoreOrder = storeOrder(),
    chargeId: String = "ch-or1",
) = CreateOrderResponse(order = order, chargeId = chargeId)

fun ordersResponse(vararg orders: StoreOrder) = OrdersResponse(orders = orders.toList())
