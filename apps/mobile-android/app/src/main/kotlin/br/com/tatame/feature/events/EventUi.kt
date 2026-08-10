package br.com.tatame.feature.events

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import br.com.tatame.R
import br.com.tatame.core.designsystem.theme.PillShape
import br.com.tatame.core.network.dto.EventRegistrationStatuses
import com.tatame.designsystem.tokens.LumiraTokens

/**
 * Shared event visuals (EVT.12/13): the design-system gradient catalog for
 * `bannerPreset` slugs, the date square, and the valor/Confirmado chips —
 * Lumira tokens only, mirror of packages/design-system event-gradients
 * (unknown slugs fall back to the default preset, never a blank banner).
 */

/** `bannerPreset` slug → gradient brush (135° like the prototype banners). */
fun eventBannerBrush(slug: String?): Brush = when (slug) {
    "event-blue-teal" -> Brush.linearGradient(
        colors = listOf(LumiraTokens.Colors.Info500, LumiraTokens.Colors.Success500),
    )
    // "event-purple-pink" and every unknown slug: the default purple→pink.
    else -> Brush.linearGradient(
        colors = listOf(
            LumiraTokens.Colors.Purple700,
            LumiraTokens.Colors.Purple500,
            LumiraTokens.Colors.Pink500,
        ),
    )
}

/** White pill chip over the gradient banner: "Gratuito" / "R$ 60". */
@Composable
internal fun EventValorChip(priceCents: Long?, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .background(color = LumiraTokens.Colors.White.copy(alpha = 0.85f), shape = PillShape)
            .padding(horizontal = LumiraTokens.Space.S3, vertical = LumiraTokens.Space.S1),
    ) {
        Text(
            text = EventFormat.valorChip(priceCents),
            style = MaterialTheme.typography.labelSmall,
            color = LumiraTokens.Colors.Purple800,
        )
    }
}

/**
 * Trailing card chip — own state wins over the valor chip (aluno-03):
 * green "Confirmado", amber "Pagamento pendente", or the gray valor chip.
 */
@Composable
internal fun EventStateChip(
    priceCents: Long?,
    registrationStatus: String?,
    modifier: Modifier = Modifier,
) {
    val confirmed = registrationStatus == EventRegistrationStatuses.CONFIRMED
    val pending = registrationStatus == EventRegistrationStatuses.PENDING_PAYMENT
    val container = when {
        confirmed -> LumiraTokens.Colors.Success100
        pending -> LumiraTokens.Colors.Warning100
        else -> LumiraTokens.Colors.Gray100
    }
    val content = when {
        confirmed -> LumiraTokens.Colors.Success500
        pending -> LumiraTokens.Colors.Warning500
        else -> LumiraTokens.Colors.Fg3
    }
    Box(
        modifier = modifier
            .background(color = container, shape = PillShape)
            .padding(horizontal = LumiraTokens.Space.S3, vertical = LumiraTokens.Space.S1),
    ) {
        Text(
            text = when {
                confirmed -> stringResource(R.string.event_chip_confirmado)
                pending -> stringResource(R.string.event_chip_pending)
                else -> EventFormat.valorChip(priceCents)
            },
            style = MaterialTheme.typography.labelSmall,
            color = content,
        )
    }
}

/**
 * Shared event list card (home "Próximos eventos" / agenda "Eventos do mês" /
 * professor "Eventos futuros"): date square + name + time·local line, with a
 * caller-chosen trailing slot (state chip for the aluno, nothing for the
 * professor whose subtitle already carries "N confirmados · valor").
 */
@Composable
internal fun EventListCard(
    name: String,
    date: String?,
    subtitle: String,
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    trailing: (@Composable () -> Unit)? = null,
) {
    Surface(
        shape = RoundedCornerShape(LumiraTokens.Radius.Lg),
        color = MaterialTheme.colorScheme.surface,
        modifier = modifier
            .fillMaxWidth()
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier),
    ) {
        Row(
            modifier = Modifier.padding(LumiraTokens.Space.S3),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            EventDateSquare(date = date)
            Spacer(Modifier.width(LumiraTokens.Space.S3))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = name,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            trailing?.let {
                Spacer(Modifier.width(LumiraTokens.Space.S2))
                it()
            }
        }
    }
}

/**
 * 48dp date square (day number over month abbreviation). [gradient] renders
 * the agenda variant (purple→pink fill, white text); the flat variant is the
 * home/professor purple-50 square.
 */
@Composable
internal fun EventDateSquare(
    date: String?,
    modifier: Modifier = Modifier,
    gradient: Boolean = false,
) {
    val shape = RoundedCornerShape(LumiraTokens.Radius.Md)
    val background = if (gradient) {
        Modifier.background(
            brush = Brush.linearGradient(
                colors = listOf(LumiraTokens.Colors.Purple600, LumiraTokens.Colors.Pink500),
            ),
            shape = shape,
        )
    } else {
        Modifier.background(color = LumiraTokens.Colors.Purple50, shape = shape)
    }
    Column(
        modifier = modifier.size(LumiraTokens.Space.S12).then(background),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = EventFormat.dayNumber(date),
            style = MaterialTheme.typography.titleMedium,
            color = if (gradient) LumiraTokens.Colors.FgOnColor else LumiraTokens.Colors.InkPurple,
        )
        Text(
            text = EventFormat.monthAbbrev(date),
            style = MaterialTheme.typography.labelSmall,
            color = if (gradient) {
                LumiraTokens.Colors.FgOnColor.copy(alpha = 0.85f)
            } else {
                LumiraTokens.Colors.Purple500
            },
        )
    }
}

/** Semi-transparent white back bubble over the gradient banner (aluno-10). */
@Composable
internal fun BannerBackBubble(onBack: () -> Unit, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .size(LumiraTokens.Space.S10)
            .background(color = Color.White.copy(alpha = 0.25f), shape = PillShape)
            .clickable(onClick = onBack),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = "‹",
            style = MaterialTheme.typography.titleMedium,
            color = LumiraTokens.Colors.White,
        )
    }
}
