package br.com.tatame.core.designsystem.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Tatame belt mark drawn in Compose (no bitmap assets): a rounded belt bar
 * plus degree stripes, inside a rounded-square container — the app icon motif
 * from the handoff (aluno-01 splash / aluno-02 login).
 */
@Composable
fun BeltLogo(
    size: Dp,
    containerColor: Color,
    markColor: Color,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .size(size)
            .background(color = containerColor, shape = RoundedCornerShape(size * 0.3f)),
    ) {
        Canvas(
            modifier = Modifier
                .fillMaxSize()
                .padding(size * 0.26f),
        ) {
            val barHeight = this.size.height * 0.62f
            val top = (this.size.height - barHeight) / 2f
            val corner = CornerRadius(barHeight / 2.6f, barHeight / 2.6f)
            // Belt bar (left block).
            drawRoundRect(
                color = markColor,
                topLeft = Offset(0f, top),
                size = Size(this.size.width * 0.52f, barHeight),
                cornerRadius = corner,
            )
            // Degree stripes (right).
            val stripeWidth = this.size.width * 0.10f
            val stripeCorner = CornerRadius(stripeWidth / 2f, stripeWidth / 2f)
            listOf(0.66f, 0.86f).forEach { x ->
                drawRoundRect(
                    color = markColor,
                    topLeft = Offset(this.size.width * x, top),
                    size = Size(stripeWidth, barHeight),
                    cornerRadius = stripeCorner,
                )
            }
        }
    }
}
