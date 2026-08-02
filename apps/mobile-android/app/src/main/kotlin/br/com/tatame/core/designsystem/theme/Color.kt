package br.com.tatame.core.designsystem.theme

import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import com.tatame.designsystem.tokens.LumiraTokens

/**
 * Material3 ColorScheme mapped from Lumira tokens (default Tatame brand).
 * White-label overlays (DerivePalette) land in a later slice — this maps the
 * static token sets only. No raw hex allowed here (BOSS checklist #4).
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
