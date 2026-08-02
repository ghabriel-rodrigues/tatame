package br.com.tatame.core.designsystem.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable

/**
 * Tatame theme scaffold — wraps [MaterialTheme] with the Lumira token mapping
 * (ColorScheme from LumiraTokens, Quicksand typography placeholder, pill shapes).
 *
 * Later slices add: white-label overlay via derivePalette (ds-03),
 * TatameExtendedColors/TatameMotion CompositionLocals, glass surfaces.
 */
@Composable
fun TatameTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) TatameDarkColorScheme else TatameLightColorScheme,
        typography = TatameTypography,
        shapes = TatameShapes,
        content = content,
    )
}
