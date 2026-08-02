package br.com.tatame.feature.splash

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import br.com.tatame.core.designsystem.theme.PillShape
import com.tatame.designsystem.tokens.LumiraTokens

/**
 * Splash-ish landing screen — proves TatameTheme compiles and renders token
 * swatches. Replaced by the real auth flow in the first feature slice.
 */
@Composable
fun SplashScreen(modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background,
    ) {
        Column(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = "Tatame",
                style = MaterialTheme.typography.displayLarge,
                color = MaterialTheme.colorScheme.primary,
            )
            Text(
                text = "Jiu-jitsu, organizado.",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row(
                modifier = Modifier,
                horizontalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S2),
            ) {
                TokenSwatch(LumiraTokens.Colors.Purple700)
                TokenSwatch(LumiraTokens.Colors.Purple500)
                TokenSwatch(LumiraTokens.Colors.Pink500)
                TokenSwatch(LumiraTokens.Colors.Success500)
                TokenSwatch(LumiraTokens.Colors.BeltBlue)
                TokenSwatch(LumiraTokens.Colors.BeltPurple)
            }
        }
    }
}

@Composable
private fun TokenSwatch(color: Color) {
    Box(
        modifier = Modifier
            .size(LumiraTokens.Space.S6)
            .background(color = color, shape = PillShape),
    )
}
