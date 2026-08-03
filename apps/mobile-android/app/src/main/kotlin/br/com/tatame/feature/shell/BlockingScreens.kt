package br.com.tatame.feature.shell

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import br.com.tatame.R
import br.com.tatame.core.designsystem.components.BeltLogo
import br.com.tatame.core.designsystem.theme.PillShape
import com.tatame.designsystem.tokens.LumiraTokens

/** Shared centered layout for the blocking states (web-only role, suspended academy). */
@Composable
private fun BlockingScreen(
    title: String,
    body: String,
    logoContainer: androidx.compose.ui.graphics.Color,
    logoMark: androidx.compose.ui.graphics.Color,
    onLogout: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(modifier = modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = LumiraTokens.Space.S6),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            BeltLogo(
                size = LumiraTokens.Space.S16,
                containerColor = logoContainer,
                markColor = logoMark,
            )
            Spacer(Modifier.height(LumiraTokens.Space.S6))
            Text(
                text = title,
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.onBackground,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(LumiraTokens.Space.S2))
            Text(
                text = body,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(LumiraTokens.Space.S8))
            OutlinedButton(
                onClick = onLogout,
                modifier = Modifier.fillMaxWidth(),
                shape = PillShape,
            ) {
                Text(stringResource(R.string.shell_logout))
            }
        }
    }
}

/** Admin/platform roles have no mobile surface — direct to the web console. */
@Composable
fun WebOnlyRoleScreen(
    roleLabel: String,
    onLogout: () -> Unit,
    modifier: Modifier = Modifier,
) {
    BlockingScreen(
        title = stringResource(R.string.web_only_title),
        body = stringResource(R.string.web_only_body, roleLabel),
        logoContainer = LumiraTokens.Colors.Purple100,
        logoMark = LumiraTokens.Colors.Purple700,
        onLogout = onLogout,
        modifier = modifier,
    )
}

/** Suspended academy: everything blocked except seeing this screen and logging out. */
@Composable
fun SuspendedAcademyScreen(
    academyName: String,
    onLogout: () -> Unit,
    modifier: Modifier = Modifier,
) {
    BlockingScreen(
        title = stringResource(R.string.suspended_title),
        body = stringResource(R.string.suspended_body, academyName),
        logoContainer = LumiraTokens.Colors.Danger100,
        logoMark = LumiraTokens.Colors.Danger500,
        onLogout = onLogout,
        modifier = modifier,
    )
}
