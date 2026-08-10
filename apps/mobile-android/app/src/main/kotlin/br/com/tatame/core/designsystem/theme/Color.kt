package br.com.tatame.core.designsystem.theme

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.graphics.Color
import br.com.tatame.core.designsystem.palette.BrandInput
import br.com.tatame.core.designsystem.palette.Mode
import br.com.tatame.core.designsystem.palette.derivePalette
import com.tatame.designsystem.tokens.LumiraTokens

/**
 * Material3 ColorScheme mapped from Lumira tokens (default Tatame brand),
 * plus the white-label overlay ([brandColorScheme], CFG.14): the branded
 * scheme replaces every purple/pink slot with the DerivePalette output for
 * the academy's 3-color brand — same slot mapping, fixture-pinned derivation.
 * Neutrals/semantics stay static per the token contract.
 * No raw hex allowed here (BOSS checklist #4).
 */
internal val TatameLightColorScheme = lightColorScheme(
    primary = LumiraTokens.Colors.Purple700,
    onPrimary = LumiraTokens.Colors.FgOnColor,
    primaryContainer = LumiraTokens.Colors.Purple100,
    onPrimaryContainer = LumiraTokens.Colors.Purple900,
    secondary = LumiraTokens.Colors.Purple500,
    onSecondary = LumiraTokens.Colors.FgOnColor,
    secondaryContainer = LumiraTokens.Colors.Purple50,
    onSecondaryContainer = LumiraTokens.Colors.Purple800,
    tertiary = LumiraTokens.Colors.Pink500,
    onTertiary = LumiraTokens.Colors.FgOnColor,
    tertiaryContainer = LumiraTokens.Colors.Pink100,
    onTertiaryContainer = LumiraTokens.Colors.Pink700,
    error = LumiraTokens.Colors.Danger500,
    onError = LumiraTokens.Colors.FgOnColor,
    errorContainer = LumiraTokens.Colors.Danger100,
    onErrorContainer = LumiraTokens.Colors.Danger500,
    background = LumiraTokens.Colors.BgApp,
    onBackground = LumiraTokens.Colors.Fg1,
    surface = LumiraTokens.Colors.BgSurface,
    onSurface = LumiraTokens.Colors.Fg1,
    surfaceVariant = LumiraTokens.Colors.BgSunken,
    onSurfaceVariant = LumiraTokens.Colors.Fg3,
    outline = LumiraTokens.Colors.Border2,
    outlineVariant = LumiraTokens.Colors.Border1,
    scrim = LumiraTokens.Colors.BgOverlay,
)

internal val TatameDarkColorScheme = darkColorScheme(
    primary = LumiraTokens.DarkColors.InkPurple,
    onPrimary = LumiraTokens.Colors.Purple950,
    primaryContainer = LumiraTokens.DarkColors.Purple100,
    onPrimaryContainer = LumiraTokens.DarkColors.Fg1,
    secondary = LumiraTokens.Colors.Purple500,
    onSecondary = LumiraTokens.Colors.FgOnColor,
    secondaryContainer = LumiraTokens.DarkColors.Purple50,
    onSecondaryContainer = LumiraTokens.DarkColors.Fg2,
    tertiary = LumiraTokens.DarkColors.InkPink,
    onTertiary = LumiraTokens.Colors.Purple950,
    tertiaryContainer = LumiraTokens.DarkColors.Pink100,
    onTertiaryContainer = LumiraTokens.DarkColors.Fg1,
    error = LumiraTokens.Colors.Danger500,
    onError = LumiraTokens.Colors.FgOnColor,
    errorContainer = LumiraTokens.DarkColors.Danger100,
    onErrorContainer = LumiraTokens.Colors.Danger500,
    background = LumiraTokens.DarkColors.BgApp,
    onBackground = LumiraTokens.DarkColors.Fg1,
    surface = LumiraTokens.DarkColors.BgSurface,
    onSurface = LumiraTokens.DarkColors.Fg1,
    surfaceVariant = LumiraTokens.DarkColors.Gray100,
    onSurfaceVariant = LumiraTokens.DarkColors.Fg3,
    outline = LumiraTokens.DarkColors.Border2,
    outlineVariant = LumiraTokens.DarkColors.Border1,
    scrim = LumiraTokens.Colors.BgOverlay,
)

/** Uppercase `#RRGGBB` (DerivePalette output contract) → Compose [Color]. */
private fun paletteColor(hex: String): Color =
    Color(0xFF000000L or hex.removePrefix("#").toLong(16))

/**
 * Builds the Material3 ColorScheme for an academy brand (CFG.14).
 *
 * `brand == null` (academy never configured branding, platform surfaces,
 * logged out) returns the static default schemes above — null is
 * indistinguishable from the default Tatame brand by design (spec 011,
 * story 25). A non-null brand swaps every purple/pink slot for the
 * [derivePalette] output; the slot mapping mirrors the static schemes 1:1 so
 * the default brand and a branded scheme can never drift structurally.
 */
fun brandColorScheme(brand: BrandInput?, darkTheme: Boolean): ColorScheme {
    if (brand == null) return if (darkTheme) TatameDarkColorScheme else TatameLightColorScheme
    val palette = derivePalette(brand, if (darkTheme) Mode.DARK else Mode.LIGHT)
    fun token(name: String): Color = paletteColor(palette.getValue(name))
    return if (darkTheme) {
        TatameDarkColorScheme.copy(
            primary = token("purple-ink"),
            onPrimary = token("purple-950"),
            primaryContainer = token("purple-100"),
            secondary = token("purple-500"),
            secondaryContainer = token("purple-50"),
            tertiary = token("pink-ink"),
            onTertiary = token("purple-950"),
            tertiaryContainer = token("pink-100"),
        )
    } else {
        TatameLightColorScheme.copy(
            primary = token("purple-700"),
            primaryContainer = token("purple-100"),
            onPrimaryContainer = token("purple-900"),
            secondary = token("purple-500"),
            secondaryContainer = token("purple-50"),
            onSecondaryContainer = token("purple-800"),
            tertiary = token("pink-500"),
            tertiaryContainer = token("pink-100"),
            onTertiaryContainer = token("pink-700"),
        )
    }
}
