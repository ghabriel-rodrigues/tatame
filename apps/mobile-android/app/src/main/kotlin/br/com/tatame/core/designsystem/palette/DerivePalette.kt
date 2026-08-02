/**
 * White-label palette derivation — line-for-line Kotlin port of the canonical
 * TypeScript executor `packages/design-system/src/theme/derive-palette.ts` (ds-03 / DS.8).
 *
 * Mix semantics match CSS `color-mix(in oklab, c1 p%, c2)`: both colors are
 * converted sRGB -> OKLab, linearly interpolated at p (weight of c1), converted
 * back, clamped to sRGB, and emitted as uppercase hex.
 *
 * Pinned byte-equal to the TS executor by `palette-fixtures.json` golden
 * fixtures (see DerivePaletteTest). Any change here must keep the fixtures green.
 */
package br.com.tatame.core.designsystem.palette

import kotlin.math.cbrt
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt

/** 3-color academy brand input. */
data class BrandInput(
    /** Primary deep brand color (maps to purple-700). */
    val deep: String,
    /** Vibrant brand color (maps to purple-500). */
    val vibrant: String,
    /** Accent color (maps to pink-500). */
    val accent: String,
) {
    internal fun slot(name: String): String = when (name) {
        "deep" -> deep
        "vibrant" -> vibrant
        "accent" -> accent
        else -> throw IllegalArgumentException("derivePalette: unknown brand slot \"$name\"")
    }
}

enum class Mode { LIGHT, DARK }

/* ------------------------------------------------------------------ */
/* sRGB <-> OKLab (Björn Ottosson's reference constants)               */
/* ------------------------------------------------------------------ */

private fun srgbChannelToLinear(c: Double): Double =
    if (c <= 0.04045) c / 12.92 else ((c + 0.055) / 1.055).pow(2.4)

private fun linearChannelToSrgb(c: Double): Double =
    if (c <= 0.0031308) c * 12.92 else 1.055 * c.pow(1 / 2.4) - 0.055

internal fun hexToOklab(hex: String): DoubleArray {
    val n = hex.replace("#", "")
    val full = if (n.length == 3) n.map { "$it$it" }.joinToString("") else n
    val int = full.toIntOrNull(16)
    if (full.length != 6 || int == null) {
        throw IllegalArgumentException("derivePalette: invalid hex color \"$hex\"")
    }
    val r = srgbChannelToLinear(((int shr 16) and 0xFF) / 255.0)
    val g = srgbChannelToLinear(((int shr 8) and 0xFF) / 255.0)
    val b = srgbChannelToLinear((int and 0xFF) / 255.0)

    val l = cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
    val m = cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
    val s = cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)

    return doubleArrayOf(
        0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    )
}

internal fun oklabToHex(lab: DoubleArray): String {
    val (labL, a, b) = Triple(lab[0], lab[1], lab[2])
    val l = (labL + 0.3963377774 * a + 0.2158037573 * b).pow(3)
    val m = (labL - 0.1055613458 * a - 0.0638541728 * b).pow(3)
    val s = (labL - 0.0894841775 * a - 1.291485548 * b).pow(3)

    val channels = doubleArrayOf(
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    ).map { lin ->
        val srgb = linearChannelToSrgb(lin)
        val clamped = min(1.0, max(0.0, srgb))
        (clamped * 255).roundToInt()
    }

    return "#" + channels.joinToString("") { c ->
        c.toString(16).padStart(2, '0')
    }.uppercase()
}

/**
 * CSS `color-mix(in oklab, c1 pct%, c2)` equivalent.
 * `pct` is the weight of `c1` (0-100).
 */
internal fun mixOklab(c1: String, pct: Double, c2: String): String {
    val w = pct / 100
    val (l1, a1, b1) = hexToOklab(c1).let { Triple(it[0], it[1], it[2]) }
    val (l2, a2, b2) = hexToOklab(c2).let { Triple(it[0], it[1], it[2]) }
    return oklabToHex(
        doubleArrayOf(
            l1 * w + l2 * (1 - w),
            a1 * w + a2 * (1 - w),
            b1 * w + b2 * (1 - w),
        ),
    )
}

/* ------------------------------------------------------------------ */
/* Recipe execution                                                    */
/* ------------------------------------------------------------------ */

private fun normalizeHex(hex: String): String {
    // Normalize any valid input to uppercase #RRGGBB via a round trip-free path.
    val n = hex.replace("#", "")
    val full = if (n.length == 3) n.map { "$it$it" }.joinToString("") else n
    return "#" + full.uppercase()
}

private fun resolveAnchor(anchor: String, input: BrandInput, mode: Mode): String {
    if (anchor == "W") return PaletteRecipe.anchorW.getValue(mode)
    if (anchor == "deep" || anchor == "vibrant" || anchor == "accent") {
        return input.slot(anchor)
    }
    return anchor
}

private fun applyRule(rule: RecipeRule, input: BrandInput, mode: Mode): String {
    val base = input.slot(rule.base)
    // Plain copy (anchor null) skips the OKLab round trip entirely so the
    // brand inputs pass through bit-exact (only normalized to #RRGGBB upper).
    if (rule.anchor == null) return normalizeHex(base)
    return mixOklab(base, rule.pct, resolveAnchor(rule.anchor, input, mode))
}

/**
 * Derive the full brand scale (purple-50..950, pink-50..700, purple-ink,
 * pink-ink) from a 3-color academy brand, for the given mode.
 *
 * Neutrals, semantics, belts, and glass are static tokens and are NOT
 * derived — see `tokens/tokens.json` (exported here as LumiraTokens.kt).
 */
fun derivePalette(input: BrandInput, mode: Mode): Map<String, String> {
    val out = LinkedHashMap<String, String>()
    for (entry in PaletteRecipe.entries) {
        val rule = entry.modes?.getValue(mode) ?: entry.rule!!
        out[entry.token] = applyRule(rule, input, mode)
    }
    return out
}
