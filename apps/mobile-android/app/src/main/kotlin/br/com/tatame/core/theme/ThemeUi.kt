package br.com.tatame.core.theme

import androidx.compose.foundation.background
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
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import br.com.tatame.R
import br.com.tatame.core.designsystem.theme.PillShape
import com.tatame.designsystem.tokens.LumiraTokens
import org.koin.compose.koinInject

/**
 * Aluno perfil "Tema escuro" ListRow (CFG.15, spec 011 stories 17-18): the
 * moon-icon row with the switch, finally functional — flips the persisted
 * per-device preference through [ThemeController], and the whole shell
 * recomposes on the dark token set + brand overlay per aluno-21. Mirrors the
 * NotificationsPerfilRow anatomy (icon bubble, title/subtitle, trailing
 * switch).
 */
@Composable
fun ThemePerfilRow(
    modifier: Modifier = Modifier,
    themeController: ThemeController = koinInject(),
) {
    val state by themeController.state.collectAsState()

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
                    .background(
                        color = MaterialTheme.colorScheme.secondaryContainer,
                        shape = PillShape,
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "🌙",
                    style = MaterialTheme.typography.labelSmall,
                )
            }
            Spacer(Modifier.width(LumiraTokens.Space.S3))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = stringResource(R.string.theme_perfil_row_title),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = stringResource(R.string.theme_perfil_row_subtitle),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.width(LumiraTokens.Space.S2))
            Switch(
                checked = state.darkTheme,
                onCheckedChange = themeController::setDarkTheme,
            )
        }
    }
}
