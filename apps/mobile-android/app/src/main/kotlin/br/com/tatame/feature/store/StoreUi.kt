package br.com.tatame.feature.store

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import br.com.tatame.R
import br.com.tatame.core.designsystem.theme.PillShape
import br.com.tatame.core.network.dto.OrderStatuses
import br.com.tatame.core.network.dto.ProductCard
import com.tatame.designsystem.tokens.LumiraTokens

/**
 * Shared store visuals (STO.12/13): the design-system gradient catalog for
 * `gradientPreset` slugs, the monogram tile, the vitrine grid card and the
 * pedido status chip — Lumira tokens only, mirror of the backend
 * `STORE_GRADIENT_PRESETS` catalog (unknown slugs fall back to the first
 * preset, never a blank tile).
 */

/** `gradientPreset` slug → gradient brush (135° like the prototype tiles). */
fun storeGradientBrush(slug: String?): Brush = when (slug) {
    "store-teal-green" -> Brush.linearGradient(
        colors = listOf(LumiraTokens.Colors.Success500, LumiraTokens.Colors.Info500),
    )
    "store-orange-red" -> Brush.linearGradient(
        colors = listOf(LumiraTokens.Colors.Warning500, LumiraTokens.Colors.Danger500),
    )
    "store-pink-purple" -> Brush.linearGradient(
        colors = listOf(LumiraTokens.Colors.Pink500, LumiraTokens.Colors.Purple600),
    )
    // "store-blue-purple" and every unknown slug: the default blue→purple.
    else -> Brush.linearGradient(
        colors = listOf(LumiraTokens.Colors.Info500, LumiraTokens.Colors.Purple600),
    )
}

/** The GI/RG/FX letter-monogram gradient tile (v1 visual identity, spec 009). */
@Composable
internal fun MonogramTile(
    monogram: String,
    gradientPreset: String?,
    modifier: Modifier = Modifier,
    large: Boolean = false,
) {
    Box(
        modifier = modifier.background(
            brush = storeGradientBrush(gradientPreset),
            shape = RoundedCornerShape(LumiraTokens.Radius.Md),
        ),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = monogram,
            style = if (large) {
                MaterialTheme.typography.headlineMedium
            } else {
                MaterialTheme.typography.titleMedium
            },
            color = LumiraTokens.Colors.FgOnColor,
        )
    }
}

/**
 * One vitrine grid card (aluno-16/professor-13): gradient monogram tile, name,
 * price + category label — fully visible, never clipped (the prototype's
 * clipped grid is a recorded bug explicitly not reproduced).
 */
@Composable
internal fun ProductGridCard(
    product: ProductCard,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        shape = RoundedCornerShape(LumiraTokens.Radius.Lg),
        color = MaterialTheme.colorScheme.surface,
        modifier = modifier.clickable(onClick = onClick),
    ) {
        Column(modifier = Modifier.padding(LumiraTokens.Space.S2)) {
            MonogramTile(
                monogram = product.monogram,
                gradientPreset = product.gradientPreset,
                large = true,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(LumiraTokens.Space.S24),
            )
            Spacer(Modifier.height(LumiraTokens.Space.S2))
            Text(
                text = product.name,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(horizontal = LumiraTokens.Space.S1),
            )
            Spacer(Modifier.height(LumiraTokens.Space.S1))
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = LumiraTokens.Space.S1),
            ) {
                Text(
                    text = StoreFormat.priceBRL(product.priceCents),
                    style = MaterialTheme.typography.labelSmall,
                    color = LumiraTokens.Colors.Purple700,
                    modifier = Modifier.weight(1f),
                )
                product.categoryName?.let {
                    Spacer(Modifier.width(LumiraTokens.Space.S1))
                    Text(
                        text = it,
                        style = MaterialTheme.typography.labelSmall,
                        color = LumiraTokens.Colors.Fg4,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

/** PT-BR pedido status chip (spec 009 fixed copy via [StoreFormat.statusLabel]). */
@Composable
internal fun OrderStatusChip(status: String, modifier: Modifier = Modifier) {
    val container = when (status) {
        OrderStatuses.PAID -> LumiraTokens.Colors.Success100
        OrderStatuses.READY -> LumiraTokens.Colors.Info100
        OrderStatuses.PENDING -> LumiraTokens.Colors.Warning100
        OrderStatuses.CANCELED -> LumiraTokens.Colors.Danger100
        else -> LumiraTokens.Colors.Gray100 // delivered + unknown future states
    }
    val content = when (status) {
        OrderStatuses.PAID -> LumiraTokens.Colors.Success500
        OrderStatuses.READY -> LumiraTokens.Colors.Info500
        OrderStatuses.PENDING -> LumiraTokens.Colors.Warning500
        OrderStatuses.CANCELED -> LumiraTokens.Colors.Danger500
        else -> LumiraTokens.Colors.Fg3
    }
    Box(
        modifier = modifier
            .background(color = container, shape = PillShape)
            .padding(horizontal = LumiraTokens.Space.S3, vertical = LumiraTokens.Space.S1),
    ) {
        Text(
            text = StoreFormat.statusLabel(status),
            style = MaterialTheme.typography.labelSmall,
            color = content,
        )
    }
}

/**
 * The perfil "Loja da academia" row — the dead handoff shortcut finally
 * working (spec 009 stories 16–17). [showNovoPill] renders the aluno
 * prototype's "Novo" pill; the professor row goes without it (professor-13).
 */
@Composable
fun StorePerfilRow(
    onOpen: () -> Unit,
    modifier: Modifier = Modifier,
    showNovoPill: Boolean = false,
) {
    Surface(
        shape = RoundedCornerShape(LumiraTokens.Radius.Lg),
        color = MaterialTheme.colorScheme.surface,
        modifier = modifier.fillMaxWidth().clickable(onClick = onOpen),
    ) {
        Row(
            modifier = Modifier.padding(LumiraTokens.Space.S3),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(LumiraTokens.Space.S10)
                    .background(
                        brush = storeGradientBrush(null),
                        shape = RoundedCornerShape(LumiraTokens.Radius.Md),
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "⌂",
                    style = MaterialTheme.typography.titleMedium,
                    color = LumiraTokens.Colors.FgOnColor,
                )
            }
            Spacer(Modifier.width(LumiraTokens.Space.S3))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = stringResource(R.string.store_perfil_row_title),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = stringResource(R.string.store_subtitle),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (showNovoPill) {
                Spacer(Modifier.width(LumiraTokens.Space.S2))
                Box(
                    modifier = Modifier
                        .background(color = LumiraTokens.Colors.Pink100, shape = PillShape)
                        .padding(
                            horizontal = LumiraTokens.Space.S2,
                            vertical = LumiraTokens.Space.S1,
                        ),
                ) {
                    Text(
                        text = stringResource(R.string.store_perfil_novo),
                        style = MaterialTheme.typography.labelSmall,
                        color = LumiraTokens.Colors.Pink600,
                    )
                }
            }
            Spacer(Modifier.width(LumiraTokens.Space.S2))
            Text(
                text = "›",
                style = MaterialTheme.typography.titleMedium,
                color = LumiraTokens.Colors.Fg3,
            )
        }
    }
}

/** Small circular back affordance on plain (non-gradient) store headers. */
@Composable
internal fun StoreBackBubble(onBack: () -> Unit, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .size(LumiraTokens.Space.S10)
            .background(color = LumiraTokens.Colors.Gray100, shape = PillShape)
            .clickable(onClick = onBack),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = "‹",
            style = MaterialTheme.typography.titleMedium,
            color = LumiraTokens.Colors.Fg1,
        )
    }
}
