package br.com.tatame.feature.shell

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import br.com.tatame.R
import br.com.tatame.core.designsystem.theme.PillShape
import br.com.tatame.core.network.dto.AcademyStatus
import br.com.tatame.core.network.dto.MeResponse
import br.com.tatame.feature.auth.roleLabel
import com.tatame.designsystem.tokens.LumiraTokens

/**
 * Authenticated shell per persona (AUTH.23): placeholder bottom bar (full
 * GlassTabBar parity lands with later slices) + per-tab content. Tabs with an
 * entry in [tabContent] render real feature surfaces (ENR.21+); the rest keep
 * the session-context placeholder (name, academy, role, logout). Content
 * receives a `selectTab` callback for in-shell navigation (e.g. dashboard
 * "Ver turmas" → Turmas tab). The delinquency read-only banner always renders
 * above content.
 */
@Composable
fun PersonaShellScreen(
    me: MeResponse,
    tabLabels: List<Int>,
    onLogout: () -> Unit,
    modifier: Modifier = Modifier,
    tabContent: Map<Int, @Composable (selectTab: (Int) -> Unit) -> Unit> = emptyMap(),
) {
    var selectedTab by remember { mutableIntStateOf(0) }

    Scaffold(
        modifier = modifier.fillMaxSize(),
        containerColor = MaterialTheme.colorScheme.background,
        bottomBar = {
            NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
                tabLabels.forEachIndexed { index, labelRes ->
                    NavigationBarItem(
                        selected = index == selectedTab,
                        onClick = { selectedTab = index },
                        icon = { TabDot(selected = index == selectedTab) },
                        label = {
                            Text(
                                text = stringResource(labelRes),
                                style = MaterialTheme.typography.labelSmall,
                            )
                        },
                    )
                }
            }
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(horizontal = LumiraTokens.Space.S6),
        ) {
            if (me.academy?.status == AcademyStatus.DELINQUENT) {
                Spacer(Modifier.height(LumiraTokens.Space.S6))
                DelinquentBanner()
            }

            val content = tabContent[selectedTab]
            if (content != null) {
                content { index -> selectedTab = index }
                return@Column
            }

            Spacer(Modifier.height(LumiraTokens.Space.S6))

            Text(
                text = stringResource(R.string.shell_greeting, me.user.fullName.substringBefore(' ')),
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.onBackground,
            )
            me.academy?.let { academy ->
                Spacer(Modifier.height(LumiraTokens.Space.S1))
                Text(
                    text = academy.name,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.height(LumiraTokens.Space.S3))
            RoleChip(label = roleLabel(me.activeRole))

            Spacer(Modifier.height(LumiraTokens.Space.S6))
            Text(
                text = stringResource(R.string.shell_placeholder_body),
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

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
}

@Composable
private fun TabDot(selected: Boolean) {
    Box(
        modifier = Modifier
            .size(LumiraTokens.Space.S3)
            .background(
                color = if (selected) {
                    MaterialTheme.colorScheme.primary
                } else {
                    MaterialTheme.colorScheme.outlineVariant
                },
                shape = PillShape,
            ),
    )
}

@Composable
private fun RoleChip(label: String) {
    Box(
        modifier = Modifier
            .background(color = LumiraTokens.Colors.Purple100, shape = PillShape)
            .padding(horizontal = LumiraTokens.Space.S3, vertical = LumiraTokens.Space.S1),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = LumiraTokens.Colors.Purple700,
        )
    }
}

@Composable
private fun DelinquentBanner() {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                color = LumiraTokens.Colors.Warning100,
                shape = RoundedCornerShape(LumiraTokens.Radius.Md),
            )
            .padding(LumiraTokens.Space.S3),
    ) {
        Text(
            text = stringResource(R.string.shell_delinquent_banner),
            style = MaterialTheme.typography.bodyMedium,
            color = LumiraTokens.Colors.Fg1,
        )
    }
}
