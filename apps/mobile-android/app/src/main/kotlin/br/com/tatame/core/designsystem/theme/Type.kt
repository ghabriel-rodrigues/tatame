package br.com.tatame.core.designsystem.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import com.tatame.designsystem.tokens.LumiraTokens

/**
 * Quicksand typography scaffold.
 *
 * TODO(DS): Quicksand font files land later (res/font + FontFamily wiring);
 * until then this maps the Lumira type scale onto the default family so the
 * scale, weights, and tracking are already token-driven.
 */
internal val QuicksandFamily: FontFamily = FontFamily.Default // placeholder — swap for Quicksand

internal val TatameTypography = Typography(
    displayLarge = TextStyle(
        fontFamily = QuicksandFamily,
        fontWeight = LumiraTokens.FontWeights.Bold,
        fontSize = LumiraTokens.FontSize.Text3xl,
        lineHeight = LumiraTokens.FontSize.Text3xl * LumiraTokens.LineHeight.Tight,
    ),
    headlineLarge = TextStyle(
        fontFamily = QuicksandFamily,
        fontWeight = LumiraTokens.FontWeights.Bold,
        fontSize = LumiraTokens.FontSize.Text2xl,
        lineHeight = LumiraTokens.FontSize.Text2xl * LumiraTokens.LineHeight.Tight,
    ),
    headlineMedium = TextStyle(
        fontFamily = QuicksandFamily,
        fontWeight = LumiraTokens.FontWeights.Bold,
        fontSize = LumiraTokens.FontSize.TextXl,
        lineHeight = LumiraTokens.FontSize.TextXl * LumiraTokens.LineHeight.Snug,
    ),
    titleLarge = TextStyle(
        fontFamily = QuicksandFamily,
        fontWeight = LumiraTokens.FontWeights.Semibold,
        fontSize = LumiraTokens.FontSize.TextLg,
        lineHeight = LumiraTokens.FontSize.TextLg * LumiraTokens.LineHeight.Snug,
    ),
    titleMedium = TextStyle(
        fontFamily = QuicksandFamily,
        fontWeight = LumiraTokens.FontWeights.Semibold,
        fontSize = LumiraTokens.FontSize.TextMd,
        lineHeight = LumiraTokens.FontSize.TextMd * LumiraTokens.LineHeight.Snug,
    ),
    bodyLarge = TextStyle(
        fontFamily = QuicksandFamily,
        fontWeight = LumiraTokens.FontWeights.Medium,
        fontSize = LumiraTokens.FontSize.TextBase,
        lineHeight = LumiraTokens.FontSize.TextBase * LumiraTokens.LineHeight.Normal,
    ),
    bodyMedium = TextStyle(
        fontFamily = QuicksandFamily,
        fontWeight = LumiraTokens.FontWeights.Medium,
        fontSize = LumiraTokens.FontSize.TextSm,
        lineHeight = LumiraTokens.FontSize.TextSm * LumiraTokens.LineHeight.Normal,
    ),
    labelLarge = TextStyle(
        fontFamily = QuicksandFamily,
        fontWeight = LumiraTokens.FontWeights.Semibold,
        fontSize = LumiraTokens.FontSize.TextSm,
        lineHeight = LumiraTokens.FontSize.TextSm * LumiraTokens.LineHeight.Snug,
    ),
    labelSmall = TextStyle(
        fontFamily = QuicksandFamily,
        fontWeight = LumiraTokens.FontWeights.Semibold,
        fontSize = LumiraTokens.FontSize.Text2xs,
        lineHeight = LumiraTokens.FontSize.Text2xs * LumiraTokens.LineHeight.Snug,
    ),
)
