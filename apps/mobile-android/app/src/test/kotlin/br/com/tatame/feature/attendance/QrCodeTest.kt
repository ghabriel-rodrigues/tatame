package br.com.tatame.feature.attendance

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** ATT.20 — ZXing-backed QR module matrix (pure JVM; the canvas only draws it). */
class QrCodeTest {

    @Test
    fun `matrix is square non-empty and stable for a token`() {
        val matrix = QrCode.matrix("opaque-live-code-token-128-bits")

        assertTrue(matrix.isNotEmpty())
        matrix.forEach { row -> assertEquals(matrix.size, row.size) }
        // QR versions are 21 + 4k modules per side.
        assertEquals(0, (matrix.size - 21) % 4)
        assertTrue(matrix.any { row -> row.any { it } })
        assertTrue(matrix.any { row -> row.any { !it } })
    }

    @Test
    fun `blank content yields an empty matrix instead of crashing`() {
        assertTrue(QrCode.matrix("").isEmpty())
        assertTrue(QrCode.matrix("   ").isEmpty())
    }
}
