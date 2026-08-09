package br.com.tatame.core.designsystem.components

import com.tatame.designsystem.tokens.LumiraTokens
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * GRD.18 — pure BeltBar anatomy rules (resolved ticket design-system/04):
 * stripe clamping, red-belt no stripes, black-dan red tip, gray fallback,
 * slug normalization. Rendering itself is primitives over these values.
 */
class BeltBarLayoutTest {

    // ---- color resolution ------------------------------------------------

    @Test
    fun `every catalog slug resolves with and without the token prefix`() {
        BeltBarLayout.BELT_COLORS.forEach { (slug, color) ->
            assertEquals(color, BeltBarLayout.barColor(slug))
            assertEquals(color, BeltBarLayout.barColor("belt.$slug"))
        }
    }

    @Test
    fun `belt colors are the Lumira belt tokens never brand colors`() {
        assertEquals(LumiraTokens.Colors.BeltBlue, BeltBarLayout.barColor("belt.blue"))
        assertEquals(LumiraTokens.Colors.BeltWhite, BeltBarLayout.barColor("belt.white"))
        assertEquals(LumiraTokens.Colors.BeltBlack, BeltBarLayout.barColor("belt.black"))
    }

    @Test
    fun `unknown slug returns null and the fallback renders gray`() {
        assertNull(BeltBarLayout.barColor("belt.coral"))
        assertEquals(
            LumiraTokens.Colors.BeltGray,
            BeltBarLayout.barColorOrFallback("belt.coral"),
        )
    }

    // ---- ponteira --------------------------------------------------------

    @Test
    fun `default tip is the belt tip token and black belt overrides to red`() {
        assertEquals(LumiraTokens.Colors.BeltTip, BeltBarLayout.tipColor(null))
        assertEquals(LumiraTokens.Colors.BeltRed, BeltBarLayout.tipColor("belt.red"))
        // Unknown tip slug falls back to the default ponteira, never crashes.
        assertEquals(LumiraTokens.Colors.BeltTip, BeltBarLayout.tipColor("belt.hologram"))
    }

    @Test
    fun `ponteira occupies roughly 22 percent of the bar`() {
        assertEquals(0.22f, BeltBarLayout.TIP_WIDTH_FRACTION, 0.0001f)
    }

    // ---- degree stripes --------------------------------------------------

    @Test
    fun `stripe count clamps to the belt maximum`() {
        assertEquals(2, BeltBarLayout.stripeCount(degrees = 2, maxDegrees = 4))
        assertEquals(4, BeltBarLayout.stripeCount(degrees = 7, maxDegrees = 4))
        assertEquals(0, BeltBarLayout.stripeCount(degrees = -1, maxDegrees = 4))
    }

    @Test
    fun `red belt renders no stripes and black belt renders dan stripes`() {
        // Red belt: maxDegrees 0 in v1 — no degree stripes at all.
        assertEquals(0, BeltBarLayout.stripeCount(degrees = 9, maxDegrees = 0))
        // Black belt: dan stripes up to 6 in v1.
        assertEquals(2, BeltBarLayout.stripeCount(degrees = 2, maxDegrees = 6))
        assertEquals(6, BeltBarLayout.stripeCount(degrees = 8, maxDegrees = 6))
    }
}
