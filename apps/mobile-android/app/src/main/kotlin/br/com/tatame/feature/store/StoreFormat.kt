package br.com.tatame.feature.store

import br.com.tatame.core.network.dto.OrderStatuses
import br.com.tatame.feature.events.EventFormat

/**
 * Pure PT-BR label building + the purchase state machine for the storefront
 * surfaces (STO.12/13) — JVM-testable, mirrors the handoff copy (aluno-16/17,
 * professor-13). PT-BR scaffolding is data here because it composes with
 * server-sent display data, same precedent as
 * [br.com.tatame.feature.events.EventFormat] /
 * [br.com.tatame.feature.billing.BillingFormat].
 */
object StoreFormat {

    /**
     * The store slice of the design-system gradient catalog — mirror of
     * `apps/api/.../store.types.ts#STORE_GRADIENT_PRESETS`. Unknown slugs fall
     * back to the first preset, never a blank tile.
     */
    val GRADIENT_PRESETS = listOf(
        "store-blue-purple",
        "store-teal-green",
        "store-orange-red",
        "store-pink-purple",
    )

    /** The gallery is always the preset + 2 catalog-neighbor variants. */
    const val GALLERY_SIZE = 3

    /** PT-BR status chip labels (spec 009 — fixed copy, enums stay English). */
    fun statusLabel(status: String): String = when (status) {
        OrderStatuses.PENDING -> "Aguardando pagamento"
        OrderStatuses.PAID -> "Recebido"
        OrderStatuses.READY -> "Em andamento"
        OrderStatuses.DELIVERED -> "Entregue"
        OrderStatuses.CANCELED -> "Cancelado"
        else -> status
    }

    /** "R$ 389" / "R$ 120,50" — grid cards, detail price and CTAs (compact). */
    fun priceBRL(amountCents: Long): String = EventFormat.compactBRL(amountCents)

    /** CTA total: unit price × quantity from the live selection. */
    fun totalCents(priceCents: Long, quantity: Int): Long = priceCents * quantity

    /**
     * The detail's 3 deterministic "fotos": the product's preset plus the next
     * 2 catalog neighbors, cycling (spec 009 — gallery is derivation, not
     * schema). Unknown presets start the cycle at the catalog head.
     */
    fun galleryPresets(gradientPreset: String?): List<String> {
        val start = GRADIENT_PRESETS.indexOf(gradientPreset).coerceAtLeast(0)
        return List(GALLERY_SIZE) { GRADIENT_PRESETS[(start + it) % GRADIENT_PRESETS.size] }
    }

    /** "#2431" — the per-tenant order number rendering. */
    fun orderNumber(number: Int): String = "#$number"

    /** "#2431 · Kimono oficial Horizonte" (Meus pedidos card title). */
    fun pedidoTitle(number: Int, productName: String?): String =
        listOfNotNull(orderNumber(number), productName).joinToString(" · ")

    /** "Tam M · 1 un · R$ 389" — size omitted for sizeless products. */
    fun itemLine(size: String?, quantity: Int, totalCents: Long): String =
        listOfNotNull(size?.let { "Tam $it" }, "$quantity un", priceBRL(totalCents))
            .joinToString(" · ")

    /** "Pedido #2431 · Kimono oficial" — the Pix sheet addressing (spec 009). */
    fun pixSubtitle(number: Int, productName: String): String =
        "Pedido ${orderNumber(number)} · $productName"

    /** "12 em estoque · retirada na recepção da academia" (aluno-17 line). */
    fun estoqueLine(stockQty: Int): String =
        "$stockQty em estoque · retirada na recepção da academia"

    /** "#kimono" chip text from a raw tag. */
    fun tagChip(tag: String): String = "#$tag"

    // ---- purchase state machine (aluno-17, spec 009 stories 23–25) --------

    /** Size pills render only when the product defines sizes. */
    fun sizeRequired(sizes: List<String>): Boolean = sizes.isNotEmpty()

    /** Stepper cap: never above stock, never below 1 (esgotado disables all). */
    fun clampQuantity(desired: Int, stockQty: Int): Int =
        desired.coerceIn(1, maxOf(1, stockQty))

    /**
     * "Comprar com Pix" is tappable only with stock available and a size
     * chosen whenever the product has sizes (required-when-present).
     */
    fun canBuy(sizes: List<String>, selectedSize: String?, stockQty: Int): Boolean =
        stockQty > 0 && (!sizeRequired(sizes) || selectedSize != null)
}
