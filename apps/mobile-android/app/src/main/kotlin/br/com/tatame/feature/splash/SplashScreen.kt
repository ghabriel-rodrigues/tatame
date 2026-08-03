package br.com.tatame.feature.splash

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.res.stringResource
import br.com.tatame.R
import br.com.tatame.core.designsystem.components.BeltLogo
import com.tatame.designsystem.tokens.LumiraTokens

/**
 * Splash per handoff aluno-01: full-bleed purple gradient (deep top → vibrant
 * bottom), belt logo in a translucent rounded square, wordmark + tagline.
 * Auto-advance (~1.9s, gated on session bootstrap) is owned by AppRoot.
 */
@Composable
fun SplashScreen(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(
                        LumiraTokens.Colors.Purple900,
                        LumiraTokens.Colors.Purple700,
                        LumiraTokens.Colors.Purple500,
                    ),
                ),
            ),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S2),
        ) {
            BeltLogo(
                size = LumiraTokens.Space.S16,
                containerColor = LumiraTokens.Colors.White.copy(alpha = 0.16f),
                markColor = LumiraTokens.Colors.White,
            )
            Box(modifier = Modifier.height(LumiraTokens.Space.S2))
            Text(
                text = stringResource(R.string.app_name),
                style = MaterialTheme.typography.headlineLarge,
                color = LumiraTokens.Colors.FgOnColor,
            )
            Text(
                text = stringResource(R.string.splash_tagline),
                style = MaterialTheme.typography.labelSmall,
                color = LumiraTokens.Colors.FgOnColor.copy(alpha = 0.72f),
            )
        }
    }
}
