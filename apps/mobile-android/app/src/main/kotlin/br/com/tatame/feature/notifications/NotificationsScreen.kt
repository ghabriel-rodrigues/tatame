package br.com.tatame.feature.notifications

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import br.com.tatame.R
import br.com.tatame.core.designsystem.theme.PillShape
import br.com.tatame.core.network.dto.NotificationItem
import br.com.tatame.feature.enrollment.EnrollmentErrorState
import com.tatame.designsystem.tokens.LumiraTokens
import java.time.LocalDate
import org.koin.androidx.compose.koinViewModel

/**
 * The shared Notificações screen (NOT.10/11, aluno-20 / responsavel-09):
 * back-arrow header, card rows (38dp rounded icon chip in purple-50/600
 * tones, bold title, body, relative PT-BR timestamp), cursor pagination on
 * scroll, empty state. Opening fires `read-all` (in [NotificationsViewModel]);
 * the persona only picks the route map — rows whose semantic `route` resolves
 * navigate via [onNavigate], the rest are inert.
 */
@Composable
fun NotificationsScreen(
    persona: NotificationsPersona,
    onBack: () -> Unit,
    onNavigate: (NotificationDestination) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: NotificationsViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    Column(modifier = modifier.fillMaxSize()) {
        Spacer(Modifier.height(LumiraTokens.Space.S6))
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S3),
        ) {
            NotificationsBackBubble(onBack = onBack)
            Text(
                text = stringResource(R.string.notifications_title),
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onBackground,
            )
        }
        Spacer(Modifier.height(LumiraTokens.Space.S4))

        when (val list = state) {
            is NotificationsListState.Loading -> CenteredLoading()
            is NotificationsListState.Error ->
                EnrollmentErrorState(messageRes = list.messageRes, onRetry = viewModel::refresh)
            is NotificationsListState.Loaded -> {
                if (list.notifications.isEmpty()) {
                    EmptyState()
                } else {
                    NotificationsList(
                        state = list,
                        onLoadMore = viewModel::loadMore,
                        onTap = { item ->
                            mapNotificationRoute(persona, item.route)?.let(onNavigate)
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun NotificationsList(
    state: NotificationsListState.Loaded,
    onLoadMore: () -> Unit,
    onTap: (NotificationItem) -> Unit,
) {
    val today = LocalDate.now()
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S3),
    ) {
        items(state.notifications, key = { it.id }) { item ->
            NotificationCard(item = item, today = today, onTap = { onTap(item) })
        }
        // Footer sentinel: composing it means the list bottom is on screen —
        // fetch the next cursor page (no-op guards live in the ViewModel).
        if (state.nextCursor != null) {
            item(key = "next-page") {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = LumiraTokens.Space.S3),
                    contentAlignment = Alignment.Center,
                ) {
                    LaunchedEffect(state.nextCursor) { onLoadMore() }
                    CircularProgressIndicator(
                        modifier = Modifier.size(LumiraTokens.Space.S5),
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
            }
        }
        item(key = "bottom-space") { Spacer(Modifier.height(LumiraTokens.Space.S6)) }
    }
}

/** One aluno-20 card row: chip circle, title/body, relative timestamp. */
@Composable
private fun NotificationCard(item: NotificationItem, today: LocalDate, onTap: () -> Unit) {
    val destinationless = item.route.isNullOrBlank()
    Surface(
        shape = RoundedCornerShape(LumiraTokens.Radius.Lg),
        color = MaterialTheme.colorScheme.surface,
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = !destinationless, onClick = onTap),
    ) {
        Row(
            modifier = Modifier.padding(LumiraTokens.Space.S3),
            verticalAlignment = Alignment.Top,
        ) {
            CategoryChip(chip = item.chip ?: NotificationsFormat.chipFallback(item.category))
            Spacer(Modifier.width(LumiraTokens.Space.S3))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = item.title,
                    style = MaterialTheme.typography.bodyMedium.copy(
                        fontWeight = LumiraTokens.FontWeights.Semibold,
                    ),
                    color = MaterialTheme.colorScheme.onSurface,
                )
                item.body?.let { body ->
                    Spacer(Modifier.height(LumiraTokens.Space.S1))
                    Text(
                        text = body,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Spacer(Modifier.width(LumiraTokens.Space.S2))
            Text(
                text = NotificationsFormat.relativeLabel(item.createdAt, today),
                style = MaterialTheme.typography.labelSmall,
                color = LumiraTokens.Colors.Fg3,
            )
        }
    }
}

/** 38dp round icon chip in the prototype's purple-50/purple-600 tones. */
@Composable
private fun CategoryChip(chip: String) {
    Box(
        modifier = Modifier
            .size(38.dp) // prototype-exact chip diameter (aluno-20)
            .background(color = LumiraTokens.Colors.Purple50, shape = PillShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = chip,
            style = MaterialTheme.typography.labelSmall.copy(
                fontWeight = LumiraTokens.FontWeights.Bold,
            ),
            color = LumiraTokens.Colors.Purple600,
        )
    }
}

@Composable
private fun EmptyState() {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = LumiraTokens.Space.S12),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = stringResource(R.string.notifications_empty),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun NotificationsBackBubble(onBack: () -> Unit) {
    Box(
        modifier = Modifier
            .size(LumiraTokens.Space.S8)
            .background(color = LumiraTokens.Colors.Gray100, shape = PillShape)
            .clickable(onClick = onBack),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = "‹",
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurface,
        )
    }
}

@Composable
private fun CenteredLoading() {
    Box(
        modifier = Modifier.fillMaxWidth().padding(vertical = LumiraTokens.Space.S8),
        contentAlignment = Alignment.Center,
    ) {
        CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
    }
}
