package br.com.tatame.feature.store

import br.com.tatame.core.network.dto.OrderStatuses
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * STO.12/13 — pure PT-BR store labels and the purchase state machine
 * (spec 009 fixed copy + stories 23–25).
 */
class StoreFormatTest {

    // ---- status chips (spec 009 fixed PT-BR copy) ------------------------

    @Test
    fun `status labels match the spec copy`() {
        assertEquals("Aguardando pagamento", StoreFormat.statusLabel(OrderStatuses.PENDING))
        assertEquals("Recebido", StoreFormat.statusLabel(OrderStatuses.PAID))
        assertEquals("Em andamento", StoreFormat.statusLabel(OrderStatuses.READY))
        assertEquals("Entregue", StoreFormat.statusLabel(OrderStatuses.DELIVERED))
        assertEquals("Cancelado", StoreFormat.statusLabel(OrderStatuses.CANCELED))
    }

    @Test
    fun `unknown status renders raw — registry growth never crashes`() {
        assertEquals("archived", StoreFormat.statusLabel("archived"))
    }

    // ---- money + lines ---------------------------------------------------

    @Test
    fun `price drops trailing cents like the prototype chips`() {
        assertEquals("R$ 389", StoreFormat.priceBRL(38_900))
        assertEquals("R$ 120,50", StoreFormat.priceBRL(12_050))
    }

    @Test
    fun `cta total is unit price times quantity`() {
        assertEquals(77_800L, StoreFormat.totalCents(38_900, 2))
    }

    @Test
    fun `pedido title and item line compose the card copy`() {
        assertEquals("#2431 · Kimono oficial", StoreFormat.pedidoTitle(2431, "Kimono oficial"))
        assertEquals("#2431", StoreFormat.pedidoTitle(2431, null))
        assertEquals("Tam M · 1 un · R$ 389", StoreFormat.itemLine("M", 1, 38_900))
        assertEquals("2 un · R$ 158", StoreFormat.itemLine(null, 2, 15_800)) // sizeless
    }

    @Test
    fun `pix sheet is addressed Pedido number produto`() {
        assertEquals(
            "Pedido #2431 · Kimono oficial",
            StoreFormat.pixSubtitle(2431, "Kimono oficial"),
        )
    }

    @Test
    fun `estoque line carries the retirada copy`() {
        assertEquals(
            "12 em estoque · retirada na recepção da academia",
            StoreFormat.estoqueLine(12),
        )
    }

    // ---- gallery derivation (spec — derivation, not schema) --------------

    @Test
    fun `gallery is the preset plus 2 catalog neighbors cycling`() {
        assertEquals(
            listOf("store-blue-purple", "store-teal-green", "store-orange-red"),
            StoreFormat.galleryPresets("store-blue-purple"),
        )
        assertEquals(
            listOf("store-pink-purple", "store-blue-purple", "store-teal-green"),
            StoreFormat.galleryPresets("store-pink-purple"),
        )
    }

    @Test
    fun `unknown preset starts the cycle at the catalog head`() {
        assertEquals(
            listOf("store-blue-purple", "store-teal-green", "store-orange-red"),
            StoreFormat.galleryPresets("store-future-preset"),
        )
    }

    // ---- purchase state machine (stories 23–25) --------------------------

    @Test
    fun `size is required exactly when the product defines sizes`() {
        val sizes = listOf("P", "M")
        assertFalse(StoreFormat.canBuy(sizes, selectedSize = null, stockQty = 5))
        assertTrue(StoreFormat.canBuy(sizes, selectedSize = "M", stockQty = 5))
        assertTrue(StoreFormat.canBuy(emptyList(), selectedSize = null, stockQty = 5))
    }

    @Test
    fun `esgotado disables the purchase regardless of size`() {
        assertFalse(StoreFormat.canBuy(emptyList(), selectedSize = null, stockQty = 0))
        assertFalse(StoreFormat.canBuy(listOf("M"), selectedSize = "M", stockQty = 0))
    }

    @Test
    fun `quantity clamps between 1 and the available stock`() {
        assertEquals(1, StoreFormat.clampQuantity(0, 12))
        assertEquals(12, StoreFormat.clampQuantity(99, 12))
        assertEquals(3, StoreFormat.clampQuantity(3, 12))
        // Esgotado (or oversold negative stock) floors at 1 — the CTA is
        // disabled anyway, the stepper never shows 0.
        assertEquals(1, StoreFormat.clampQuantity(5, 0))
    }
}
