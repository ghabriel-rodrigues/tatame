// GENERATED DATA — do not edit by hand.
// Source: packages/design-system/tokens/palette-recipe.json (design-system token pipeline).
// Embedded at token-build time so the recipe can never drift between platforms (DS.8 / ds-03).
// Regenerate whenever palette-recipe.json changes.
package br.com.tatame.core.designsystem.palette

/**
 * One mix rule: `base` (a [BrandInput] slot) mixed at [pct]% with [anchor] in OKLab,
 * matching CSS `color-mix(in oklab, base pct%, anchor)`.
 * [anchor] is a literal hex, an input slot name (`deep`|`vibrant`|`accent`),
 * the symbolic `"W"` (resolved per mode via [PaletteRecipe.anchorW]), or `null`
 * (pct 100, plain copy of `base`).
 */
internal data class RecipeRule(
    val base: String,
    val pct: Double,
    val anchor: String?,
)

/** One recipe entry: either a single [rule] or per-mode [modes] rules. */
internal data class RecipeEntry(
    val token: String,
    val rule: RecipeRule? = null,
    val modes: Map<Mode, RecipeRule>? = null,
)

internal object PaletteRecipe {

    /** Symbolic "W" anchor, resolved per mode. */
    val anchorW: Map<Mode, String> = mapOf(
        Mode.LIGHT to "#FFFFFF",
        Mode.DARK to "#241E3A",
    )

    val entries: List<RecipeEntry> = listOf(
        RecipeEntry("purple-700", RecipeRule("deep", 100.0, null)),
        RecipeEntry("purple-500", RecipeRule("vibrant", 100.0, null)),
        RecipeEntry("pink-500", RecipeRule("accent", 100.0, null)),
        RecipeEntry("purple-600", RecipeRule("deep", 50.0, "vibrant")),
        RecipeEntry("purple-800", RecipeRule("deep", 72.0, "#12061F")),
        RecipeEntry("purple-900", RecipeRule("deep", 52.0, "#0E0518")),
        RecipeEntry("purple-950", RecipeRule("deep", 34.0, "#0A0512")),
        RecipeEntry("purple-400", RecipeRule("vibrant", 72.0, "W")),
        RecipeEntry("purple-300", RecipeRule("vibrant", 46.0, "W")),
        RecipeEntry("purple-200", RecipeRule("vibrant", 27.0, "W")),
        RecipeEntry("purple-100", RecipeRule("vibrant", 14.0, "W")),
        RecipeEntry("purple-50", RecipeRule("vibrant", 6.0, "W")),
        RecipeEntry(
            "purple-ink",
            modes = mapOf(
                Mode.LIGHT to RecipeRule("deep", 100.0, null),
                Mode.DARK to RecipeRule("vibrant", 65.0, "#FFFFFF"),
            ),
        ),
        RecipeEntry(
            "pink-ink",
            modes = mapOf(
                Mode.LIGHT to RecipeRule("accent", 64.0, "#3B0A24"),
                Mode.DARK to RecipeRule("accent", 60.0, "#FFFFFF"),
            ),
        ),
        RecipeEntry("pink-700", RecipeRule("accent", 64.0, "#3B0A24")),
        RecipeEntry("pink-600", RecipeRule("accent", 80.0, "#3B0A24")),
        RecipeEntry("pink-400", RecipeRule("accent", 72.0, "W")),
        RecipeEntry("pink-300", RecipeRule("accent", 46.0, "W")), // extrapolated
        RecipeEntry("pink-200", RecipeRule("accent", 27.0, "W")), // extrapolated
        RecipeEntry("pink-100", RecipeRule("accent", 13.0, "W")),
        RecipeEntry("pink-50", RecipeRule("accent", 6.0, "W")),
    )
}
