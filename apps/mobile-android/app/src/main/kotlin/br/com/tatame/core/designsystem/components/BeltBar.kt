package br.com.tatame.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.tatame.designsystem.tokens.LumiraTokens

/**
 * `BeltDef`-shaped belt payload the design system renders (GRD.18). Mirrors
 * the API's `currentBelt` contract — components are keyed by data (slugs),
 * never by hardcoded belt names (resolved ticket design-system/04).
 */
data class BeltDisplay(
    val colorSlug: String, // "belt.blue" (or bare "blue")
    val tipColorSlug: String? = null, // null = default belt.tip; black belt sends "belt.red"
    val degrees: Int,
    val maxDegrees: Int, // 0 = no degree stripes (red belt in v1)
)

/** BeltBar sizes per the resolved anatomy: sm list rows, md cards, lg hero. */
enum class BeltBarSize(val height: Dp, val stripeWidth: Dp) {
    Sm(10.dp, 2.dp),
    Md(14.dp, 3.dp),
    Lg(20.dp, 4.dp),
}

/**
 * Pure layout/color rules of the BeltBar anatomy — JVM-unit-testable, no
 * Compose runtime (resolved ticket design-system/04 `## Answer` §4).
 */
object BeltBarLayout {

    /** Ponteira occupies ~22% of the bar width. */
    const val TIP_WIDTH_FRACTION = 0.22f

    /** Static, brand-independent belt color map — exempt from white-label AND dark remix. */
    val BELT_COLORS: Map<String, Color> = mapOf(
        "white" to LumiraTokens.Colors.BeltWhite,
        "gray" to LumiraTokens.Colors.BeltGray,
        "yellow" to LumiraTokens.Colors.BeltYellow,
        "orange" to LumiraTokens.Colors.BeltOrange,
        "green" to LumiraTokens.Colors.BeltGreen,
        "blue" to LumiraTokens.Colors.BeltBlue,
        "purple" to LumiraTokens.Colors.BeltPurple,
        "brown" to LumiraTokens.Colors.BeltBrown,
        "black" to LumiraTokens.Colors.BeltBlack,
        "red" to LumiraTokens.Colors.BeltRed,
    )

    /** Accepts both token-slug (`belt.blue`) and bare (`blue`) spellings. */
    fun normalizeSlug(slug: String): String = slug.removePrefix("belt.")

    /** null = unknown slug (caller falls back to gray + logs a warning). */
    fun barColor(colorSlug: String): Color? = BELT_COLORS[normalizeSlug(colorSlug)]

    /** Defensive gray fallback keeps old clients alive if the catalog grows first. */
    fun barColorOrFallback(colorSlug: String): Color =
        barColor(colorSlug) ?: LumiraTokens.Colors.BeltGray

    /** `tipColorSlug ?? belt.tip` — black belt sends `belt.red` (IBJJF red ponteira). */
    fun tipColor(tipColorSlug: String?): Color =
        tipColorSlug?.let { BELT_COLORS[normalizeSlug(it)] } ?: LumiraTokens.Colors.BeltTip

    /**
     * White degree stripes drawn ON the ponteira: clamped to `maxDegrees`;
     * `maxDegrees == 0` (red belt in v1) renders no stripes at all.
     */
    fun stripeCount(degrees: Int, maxDegrees: Int): Int =
        if (maxDegrees <= 0) 0 else degrees.coerceIn(0, maxDegrees)
}

/**
 * The belt drawn with primitives per the resolved anatomy (GRD.18): rounded
 * bar (radius-xs) filled by the belt color, inset `belt.outline` hairline
 * (what keeps Branca visible — never "fixed" with a gray fill), ~22% ponteira
 * in `tipColorSlug ?? belt.tip`, white degree stripes on the ponteira. Black
 * belt renders white dan stripes on the red tip; red belt renders no stripes;
 * unknown `colorSlug` falls back to gray with a logged warning. Width is
 * fluid (caller's modifier); height fixed per [BeltBarSize].
 */
@Composable
fun BeltBar(
    belt: BeltDisplay,
    modifier: Modifier = Modifier,
    size: BeltBarSize = BeltBarSize.Md,
) {
    val barColor = BeltBarLayout.barColor(belt.colorSlug)
    remember(belt.colorSlug) {
        if (barColor == null) {
            android.util.Log.w(
                "BeltBar",
                "Unknown belt colorSlug '${belt.colorSlug}' — falling back to gray",
            )
        }
        belt.colorSlug
    }
    val shape = RoundedCornerShape(LumiraTokens.Radius.Xs)
    Box(
        modifier = modifier
            .height(size.height)
            .clip(shape)
            .background(barColor ?: LumiraTokens.Colors.BeltGray),
    ) {
        // Ponteira with the degree stripes.
        Row(
            modifier = Modifier
                .align(Alignment.CenterEnd)
                .fillMaxHeight()
                .fillMaxWidth(BeltBarLayout.TIP_WIDTH_FRACTION)
                .background(BeltBarLayout.tipColor(belt.tipColorSlug)),
            horizontalArrangement = Arrangement.SpaceEvenly,
        ) {
            repeat(BeltBarLayout.stripeCount(belt.degrees, belt.maxDegrees)) {
                Box(
                    modifier = Modifier
                        .width(size.stripeWidth)
                        .fillMaxHeight()
                        .background(LumiraTokens.Colors.BeltStripe),
                )
            }
        }
        // Inset hairline outline over bar + ponteira (uniformly applied).
        Box(Modifier.matchParentSize().border(1.dp, LumiraTokens.Colors.BeltOutline, shape))
    }
}

/**
 * Chip variant (GRD.18): mini belt swatch + PT-BR label in a pill — profile
 * belt chips ("Faixa preta · 2º dan") and Graduações válidas régua chips.
 * [enabled] = false dims the chip (kids belt toggled off by the admin).
 */
@Composable
fun BeltChip(
    label: String,
    belt: BeltDisplay,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    Row(
        modifier = modifier
            .alpha(if (enabled) 1f else 0.45f)
            .background(
                color = LumiraTokens.Colors.BgSurface,
                shape = RoundedCornerShape(LumiraTokens.Radius.Pill),
            )
            .border(
                width = 1.dp,
                color = LumiraTokens.Colors.Border1,
                shape = RoundedCornerShape(LumiraTokens.Radius.Pill),
            )
            .padding(horizontal = LumiraTokens.Space.S3, vertical = LumiraTokens.Space.S1),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S2),
    ) {
        BeltBar(belt = belt, size = BeltBarSize.Sm, modifier = Modifier.width(28.dp))
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = LumiraTokens.Colors.Fg2,
        )
    }
}
