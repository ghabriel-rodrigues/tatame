package br.com.tatame.feature.billing

import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import com.tatame.designsystem.tokens.LumiraTokens

/**
 * Striped ITF-style barcode rendering for the boleto sheet (aluno-14).
 * The simulated provider's `barcodePayload` is decorative truth — the sheet's
 * copyable artifact is the linha digitável — so the stripes only need to be
 * deterministic per payload, not scannable. Pure module builder (JVM-testable)
 * + a Compose canvas, same split as [br.com.tatame.feature.attendance.QrCode].
 */
object BoletoBarcode {

    /**
     * Alternating bar/space module widths (1 = narrow, 2 = wide) derived from
     * the payload digits: each digit's parity picks the width, guard bars at
     * both ends. Empty payload yields an empty pattern.
     */
    fun modules(payload: String): List<Int> {
        val digits = payload.filter(Char::isDigit)
        if (digits.isEmpty()) return emptyList()
        val guard = listOf(1, 1, 1, 1)
        val body = digits.map { if ((it - '0') % 2 == 0) 1 else 2 }
        return guard + body + guard
    }
}

/** Draws the payload as vertical stripes (odd indexes are gaps). */
@Composable
fun BoletoBarcodeCanvas(
    payload: String,
    modifier: Modifier = Modifier,
    barColor: Color = LumiraTokens.Colors.Purple950,
) {
    val modules = remember(payload) { BoletoBarcode.modules(payload) }
    Canvas(modifier = modifier) {
        if (modules.isEmpty()) return@Canvas
        val totalUnits = modules.sum().toFloat()
        val unit = size.width / totalUnits
        var x = 0f
        modules.forEachIndexed { index, width ->
            val barWidth = width * unit
            if (index % 2 == 0) {
                drawRect(
                    color = barColor,
                    topLeft = Offset(x, 0f),
                    size = Size(barWidth, size.height),
                )
            }
            x += barWidth
        }
    }
}
