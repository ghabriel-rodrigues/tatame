package br.com.tatame.feature.attendance

import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.tatame.designsystem.tokens.LumiraTokens
import kotlin.math.floor

/**
 * QR rendering for the professor live code (ATT.20). ZXing core builds the
 * module matrix (pure JVM — unit-testable, no Android/bitmap deps); a Compose
 * canvas draws it. The QR encodes the opaque `qr_token` only, never the
 * 4-digit code (spec 004).
 */
object QrCode {

    /** `matrix[y][x]` == true for dark modules. Empty content yields an empty matrix. */
    fun matrix(content: String): Array<BooleanArray> {
        if (content.isBlank()) return emptyArray()
        val hints = mapOf(EncodeHintType.MARGIN to 0)
        val bits = runCatching {
            QRCodeWriter().encode(content, BarcodeFormat.QR_CODE, 0, 0, hints)
        }.getOrNull() ?: return emptyArray()
        return Array(bits.height) { y -> BooleanArray(bits.width) { x -> bits.get(x, y) } }
    }
}

/** Draws [content] as a QR of dark modules on a transparent background. */
@Composable
fun QrCodeCanvas(
    content: String,
    modifier: Modifier = Modifier,
    moduleColor: Color = LumiraTokens.Colors.Purple950,
) {
    val matrix = remember(content) { QrCode.matrix(content) }
    Canvas(modifier = modifier) {
        val modules = matrix.size
        if (modules == 0) return@Canvas
        val moduleSize = floor(minOf(size.width, size.height) / modules)
        val offsetX = (size.width - moduleSize * modules) / 2f
        val offsetY = (size.height - moduleSize * modules) / 2f
        for (y in 0 until modules) {
            val row = matrix[y]
            for (x in 0 until modules) {
                if (row[x]) {
                    drawRect(
                        color = moduleColor,
                        topLeft = Offset(offsetX + x * moduleSize, offsetY + y * moduleSize),
                        size = Size(moduleSize, moduleSize),
                    )
                }
            }
        }
    }
}
