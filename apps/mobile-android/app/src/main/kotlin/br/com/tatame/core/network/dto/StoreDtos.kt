// Hand-written mirror of the store surface of packages/shared/src/api/openapi.json
// (fallback per ticket mobile-android/02 — see app/build.gradle.kts `generateApiClient`).
// Field names MUST stay 1:1 with the spec; regenerate-by-hand on contract changes.

package br.com.tatame.core.network.dto

import kotlinx.serialization.Serializable

/**
 * `order_status` enum values (schema/enums stay English per charter). PT-BR
 * chip labels are client copy — see `StoreFormat.statusLabel` (spec 009):
 * pending = "Aguardando pagamento" (buyer-side only), paid = "Recebido",
 * ready = "Em andamento", delivered = "Entregue", canceled = "Cancelado".
 */
object OrderStatuses {
    const val PENDING = "pending"
    const val PAID = "paid"
    const val READY = "ready"
    const val DELIVERED = "delivered"
    const val CANCELED = "canceled"
}

/**
 * `ProductCardDto` — vitrine grid / home strip card. The tile is a letter
 * monogram on a design-system gradient preset (no image upload in v1 —
 * recorded debt). No stock fields here by contract: stock states live on the
 * detail (`ProductDetail.stockQty`).
 */
@Serializable
data class ProductCard(
    val id: String,
    val name: String,
    val priceCents: Long,
    val monogram: String, // 1–3 letters on the gradient tile
    val gradientPreset: String, // design-system gradient slug
    val categoryId: String? = null,
    val categoryName: String? = null,
)

/** `VitrineCategoryDto` — one chip of the "Tudo + chips" carousel. */
@Serializable
data class VitrineCategory(
    val id: String,
    val name: String,
)

/** `VitrineResponseDto` — active products only + the chip carousel data. */
@Serializable
data class VitrineResponse(
    val products: List<ProductCard> = emptyList(),
    val categories: List<VitrineCategory> = emptyList(),
)

/**
 * `ProductDetailDto` — gallery derivation inputs (`gradientPreset` +
 * `monogram`), size pills, stock and price. The 3 "fotos" are deterministic
 * monogram-tile variants computed client-side (spec 009). `stockQty` caps the
 * quantity stepper; may go negative (recorded oversell).
 */
@Serializable
data class ProductDetail(
    val id: String,
    val name: String,
    val priceCents: Long,
    val monogram: String,
    val gradientPreset: String,
    val categoryId: String? = null,
    val categoryName: String? = null,
    val description: String? = null,
    val tags: List<String> = emptyList(), // rendered as #chips
    val sizes: List<String> = emptyList(), // size pills; empty = no sizes
    val stockQty: Int = 0,
)

/** `OrderItemDto` — the price snapshot at purchase, never the live price. */
@Serializable
data class StoreOrderItem(
    val productId: String,
    val productName: String,
    val monogram: String,
    val gradientPreset: String,
    val size: String? = null, // null for sizeless products
    val quantity: Int,
    val unitPriceCents: Long,
)

/**
 * `OrderDto` — one single-product purchase. `number` renders `#2431`;
 * `chargeId` is the open order charge to pay (pending only) — it drives the
 * Pix sheet retry without re-ordering.
 */
@Serializable
data class StoreOrder(
    val id: String,
    val number: Int,
    val status: String, // pending | paid | ready | delivered | canceled
    val totalCents: Long,
    val pickupNote: String, // "Retirada na recepção" (fixed copy in v1)
    val createdAt: String,
    val item: StoreOrderItem? = null,
    val chargeId: String? = null,
)

/** `CreateOrderDto` — `size` required iff the product defines sizes. */
@Serializable
data class CreateOrderRequest(
    val productId: String,
    val size: String? = null,
    val quantity: Int,
)

/**
 * `CreateOrderResponseDto` — the pending order + its order-origin charge to
 * pay via POST /store/charges/{id}/payments (Pix) and the existing simulate
 * button — addressed "Pedido #NNNN · <produto>" (spec 009).
 */
@Serializable
data class CreateOrderResponse(
    val order: StoreOrder,
    val chargeId: String,
)

/** `OrdersResponseDto` — Meus pedidos: own orders, newest first. */
@Serializable
data class OrdersResponse(
    val orders: List<StoreOrder> = emptyList(),
)
