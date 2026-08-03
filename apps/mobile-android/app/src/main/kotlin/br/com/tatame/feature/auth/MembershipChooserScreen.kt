package br.com.tatame.feature.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import br.com.tatame.R
import br.com.tatame.core.auth.SessionState
import br.com.tatame.core.designsystem.components.BeltLogo
import br.com.tatame.core.network.dto.MembershipView
import br.com.tatame.core.network.dto.Roles
import com.tatame.designsystem.tokens.LumiraTokens

/** PT-BR label for a role enum value (enums stay English — spec 001-auth). */
@Composable
fun roleLabel(role: String): String = stringResource(
    when (role) {
        Roles.STUDENT -> R.string.role_student
        Roles.PROFESSOR -> R.string.role_professor
        Roles.ADMIN -> R.string.role_admin
        Roles.GUARDIAN -> R.string.role_guardian
        Roles.OWNER -> R.string.role_owner
        Roles.SUPPORT -> R.string.role_support
        Roles.FINANCE -> R.string.role_finance
        else -> R.string.role_student
    },
)

/** Post-login chooser shown when the account holds multiple memberships. */
@Composable
fun MembershipChooserScreen(
    state: SessionState.ChoosingMembership,
    onChoose: (membershipId: String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(modifier = modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = LumiraTokens.Space.S6),
        ) {
            Spacer(Modifier.height(LumiraTokens.Space.S12))
            BeltLogo(
                size = LumiraTokens.Space.S12,
                containerColor = MaterialTheme.colorScheme.primary,
                markColor = LumiraTokens.Colors.FgOnColor,
            )
            Spacer(Modifier.height(LumiraTokens.Space.S5))
            Text(
                text = stringResource(R.string.membership_chooser_title),
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.onBackground,
            )
            Spacer(Modifier.height(LumiraTokens.Space.S1))
            Text(
                text = stringResource(R.string.membership_chooser_subtitle),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(LumiraTokens.Space.S6))

            Column(verticalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S3)) {
                state.memberships.forEach { membership ->
                    MembershipCard(
                        membership = membership,
                        enabled = !state.switching,
                        onClick = { onChoose(membership.id) },
                    )
                }
            }
            Spacer(Modifier.height(LumiraTokens.Space.S8))
        }
    }
}

@Composable
private fun MembershipCard(
    membership: MembershipView,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                color = MaterialTheme.colorScheme.surface,
                shape = RoundedCornerShape(LumiraTokens.Radius.Lg),
            )
            .clickable(enabled = enabled, onClick = onClick)
            .padding(LumiraTokens.Space.S4),
        horizontalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S3),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BeltLogo(
            size = LumiraTokens.Space.S10,
            containerColor = LumiraTokens.Colors.Purple100,
            markColor = LumiraTokens.Colors.Purple700,
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = membership.academyName ?: stringResource(R.string.membership_platform_name),
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = roleLabel(membership.role),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
