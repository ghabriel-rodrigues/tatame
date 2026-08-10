package br.com.tatame.feature.shell

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import br.com.tatame.R
import br.com.tatame.core.designsystem.theme.PillShape
import br.com.tatame.feature.enrollment.AvatarBubble
import br.com.tatame.feature.notifications.NotificationsPerfilRow
import com.tatame.designsystem.tokens.LumiraTokens

/**
 * Responsável Perfil tab (NOT.11): the identity block, the "Notificações"
 * mute switch (spec 010 story 9) and logout — the guardian counterpart of the
 * aluno perfil surface, minus belt/store content (neither exists in the
 * responsável prototype). Replaces the shell placeholder that previously
 * filled the tab; fuller profile management stays a later slice.
 */
@Composable
fun ResponsavelPerfilTab(
    fullName: String,
    academyName: String?,
    onLogout: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(LumiraTokens.Space.S8))
        AvatarBubble(
            fullName = fullName,
            size = LumiraTokens.Space.S16,
            containerColor = LumiraTokens.Colors.Purple500,
            contentColor = LumiraTokens.Colors.FgOnColor,
        )
        Spacer(Modifier.height(LumiraTokens.Space.S3))
        Text(
            text = fullName,
            style = MaterialTheme.typography.titleLarge,
            color = MaterialTheme.colorScheme.onBackground,
        )
        academyName?.let {
            Spacer(Modifier.height(LumiraTokens.Space.S1))
            Text(
                text = it,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        // NOT.11 — the "Notificações" switch wired to the per-membership
        // mute (spec 010 story 9: badge dies, history stays).
        Spacer(Modifier.height(LumiraTokens.Space.S6))
        NotificationsPerfilRow()

        Spacer(Modifier.weight(1f))
        OutlinedButton(
            onClick = onLogout,
            modifier = Modifier.fillMaxWidth(),
            shape = PillShape,
        ) {
            Text(stringResource(R.string.shell_logout))
        }
        Spacer(Modifier.height(LumiraTokens.Space.S6))
    }
}
