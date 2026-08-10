package br.com.tatame.feature.notifications

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import br.com.tatame.R
import br.com.tatame.core.designsystem.theme.PillShape
import com.tatame.designsystem.tokens.LumiraTokens
import org.koin.androidx.compose.koinViewModel

/**
 * The home-header bell with the pink unread dot (NOT.10/11 — every shell's
 * prototype header carries it left of the avatar). The count is hoisted so
 * shells can refresh their [NotificationsBellViewModel] when the Notificações
 * screen closes (read-all just ran).
 */
@Composable
fun NotificationsBellBubble(
    unreadCount: Int,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(modifier = modifier.size(42.dp)) { // prototype-exact 42px round bell
        Box(
            modifier = Modifier
                .size(42.dp)
                .background(color = LumiraTokens.Colors.Gray100, shape = PillShape)
                .clickable(onClick = onClick),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = "🔔",
                style = MaterialTheme.typography.labelSmall,
            )
        }
        if (unreadCount > 0) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .offset(x = (-2).dp, y = 2.dp)
                    .size(LumiraTokens.Space.S2)
                    .background(color = LumiraTokens.Colors.Pink500, shape = PillShape),
            )
        }
    }
}

/**
 * Perfil "Notificações" ListRow with the mute switch (spec 010 story 9),
 * shared by the aluno/professor/responsável perfil tabs. Wired straight to
 * the settings endpoints via [NotificationSettingsViewModel]: the switch is
 * disabled until the GET lands and during the PUT; muting silences the badge
 * only — history and screen stay reachable.
 */
@Composable
fun NotificationsPerfilRow(
    modifier: Modifier = Modifier,
    viewModel: NotificationSettingsViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    Surface(
        shape = RoundedCornerShape(LumiraTokens.Radius.Lg),
        color = MaterialTheme.colorScheme.surface,
        modifier = modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.padding(LumiraTokens.Space.S3),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(LumiraTokens.Space.S10)
                    .background(color = LumiraTokens.Colors.Purple50, shape = PillShape),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "🔔",
                    style = MaterialTheme.typography.labelSmall,
                )
            }
            Spacer(Modifier.width(LumiraTokens.Space.S3))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = stringResource(R.string.notifications_perfil_row_title),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = stringResource(R.string.notifications_perfil_row_subtitle),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.width(LumiraTokens.Space.S2))
            Switch(
                checked = state.enabled ?: false,
                onCheckedChange = viewModel::toggle,
                enabled = state.enabled != null && !state.saving,
            )
        }
    }
}
