package br.com.tatame.core.designsystem.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import br.com.tatame.core.designsystem.palette.BrandInput

/**
 * Tatame theme scaffold — wraps [MaterialTheme] with the Lumira token mapping
 * (ColorScheme via [brandColorScheme], Quicksand typography placeholder, pill
 * shapes).
 *
 * CFG.14: [brand] is the session academy's white-label triplet — null renders
 * the default Tatame brand. CFG.15 (decision recorded, design-system ticket
 * 06): [darkTheme] defaults to `false`, NOT `isSystemInDarkTheme()` — dark
 * mode is an explicit per-user DataStore-persisted preference in v1;
 * following the system scheme is recorded debt.
 *
 * Later slices add: TatameExtendedColors/TatameMotion CompositionLocals,
 * glass surfaces.
 */
@Composable
fun TatameTheme(
    brand: BrandInput? = null,
    darkTheme: Boolean = false,
    content: @Composable () -> Unit,
) {
    val colorScheme = remember(brand, darkTheme) { brandColorScheme(brand, darkTheme) }
    MaterialTheme(
        colorScheme = colorScheme,
        typography = TatameTypography,
        shapes = TatameShapes,
        content = content,
    )
}
