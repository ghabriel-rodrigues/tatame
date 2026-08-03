package br.com.tatame.feature.auth

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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import br.com.tatame.R
import br.com.tatame.core.designsystem.components.BeltLogo
import br.com.tatame.core.designsystem.theme.PillShape
import com.tatame.designsystem.tokens.LumiraTokens
import org.koin.androidx.compose.koinViewModel

/**
 * Login per handoff aluno-02: belt logo, "Bem-vindo de volta", email/senha
 * fields, gradient pill CTA, "Esqueci minha senha" stub + "Criar conta"
 * hint, and the invite notice card. [sessionMessageRes] carries the
 * session-expired / offline notice from the session layer.
 */
@Composable
fun LoginScreen(
    sessionMessageRes: Int?,
    modifier: Modifier = Modifier,
    viewModel: LoginViewModel = koinViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

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
                text = stringResource(R.string.login_title),
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.onBackground,
            )
            Spacer(Modifier.height(LumiraTokens.Space.S1))
            Text(
                text = stringResource(R.string.login_subtitle),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            sessionMessageRes?.let { messageRes ->
                Spacer(Modifier.height(LumiraTokens.Space.S4))
                NoticeCard(text = stringResource(messageRes))
            }

            Spacer(Modifier.height(LumiraTokens.Space.S6))

            LoginTextField(
                value = uiState.email,
                onValueChange = viewModel::onEmailChange,
                placeholder = stringResource(R.string.login_email_placeholder),
                keyboardType = KeyboardType.Email,
            )
            Spacer(Modifier.height(LumiraTokens.Space.S3))
            LoginTextField(
                value = uiState.password,
                onValueChange = viewModel::onPasswordChange,
                placeholder = stringResource(R.string.login_password_placeholder),
                keyboardType = KeyboardType.Password,
                isPassword = true,
            )

            uiState.errorRes?.let { errorRes ->
                Spacer(Modifier.height(LumiraTokens.Space.S3))
                Text(
                    text = stringResource(errorRes),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.error,
                )
            }

            Spacer(Modifier.height(LumiraTokens.Space.S5))

            GradientPillButton(
                text = stringResource(R.string.login_cta),
                loading = uiState.isSubmitting,
                onClick = viewModel::submit,
            )

            Spacer(Modifier.height(LumiraTokens.Space.S4))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    text = stringResource(R.string.login_forgot_password),
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.clickable { viewModel.onForgotPassword() },
                )
                Text(
                    text = stringResource(R.string.login_create_account),
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Spacer(Modifier.height(LumiraTokens.Space.S8))

            InviteNoticeCard()

            Spacer(Modifier.height(LumiraTokens.Space.S8))
        }
    }

    if (uiState.showForgotDialog) {
        AlertDialog(
            onDismissRequest = viewModel::onDismissForgotDialog,
            title = { Text(stringResource(R.string.login_forgot_dialog_title)) },
            text = { Text(stringResource(R.string.login_forgot_dialog_body)) },
            confirmButton = {
                TextButton(onClick = viewModel::onDismissForgotDialog) {
                    Text(stringResource(R.string.login_forgot_dialog_ok))
                }
            },
        )
    }
}

@Composable
private fun LoginTextField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    keyboardType: KeyboardType,
    isPassword: Boolean = false,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = Modifier.fillMaxWidth(),
        placeholder = {
            Text(placeholder, style = MaterialTheme.typography.bodyLarge)
        },
        singleLine = true,
        shape = RoundedCornerShape(LumiraTokens.Radius.Md),
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
        visualTransformation = if (isPassword) PasswordVisualTransformation() else VisualTransformation.None,
        colors = OutlinedTextFieldDefaults.colors(
            focusedContainerColor = MaterialTheme.colorScheme.surface,
            unfocusedContainerColor = MaterialTheme.colorScheme.surface,
            focusedBorderColor = MaterialTheme.colorScheme.primary,
            unfocusedBorderColor = MaterialTheme.colorScheme.outlineVariant,
            focusedPlaceholderColor = LumiraTokens.Colors.Fg4,
            unfocusedPlaceholderColor = LumiraTokens.Colors.Fg4,
        ),
    )
}

/** Full-width gradient pill CTA (deep → vibrant purple per the handoff). */
@Composable
fun GradientPillButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    loading: Boolean = false,
) {
    Button(
        onClick = onClick,
        enabled = !loading,
        modifier = modifier
            .fillMaxWidth()
            .height(LumiraTokens.Space.S12),
        shape = PillShape,
        contentPadding = androidx.compose.foundation.layout.PaddingValues(),
        colors = ButtonDefaults.buttonColors(
            containerColor = Color.Transparent,
            disabledContainerColor = Color.Transparent,
        ),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    brush = Brush.horizontalGradient(
                        colors = listOf(
                            LumiraTokens.Colors.Purple700,
                            LumiraTokens.Colors.Purple500,
                        ),
                    ),
                    shape = PillShape,
                ),
            contentAlignment = Alignment.Center,
        ) {
            if (loading) {
                CircularProgressIndicator(
                    modifier = Modifier.size(LumiraTokens.Space.S5),
                    color = LumiraTokens.Colors.FgOnColor,
                    strokeWidth = 2.5.dp,
                )
            } else {
                Text(
                    text = text,
                    style = MaterialTheme.typography.labelLarge,
                    color = LumiraTokens.Colors.FgOnColor,
                )
            }
        }
    }
}

@Composable
private fun NoticeCard(text: String) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                color = LumiraTokens.Colors.Info100,
                shape = RoundedCornerShape(LumiraTokens.Radius.Md),
            )
            .padding(LumiraTokens.Space.S3),
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.bodyMedium,
            color = LumiraTokens.Colors.Fg2,
        )
    }
}

/** "Novo na academia?" invite notice with bold "link de convite" (handoff aluno-02). */
@Composable
private fun InviteNoticeCard() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                color = LumiraTokens.Colors.Purple50,
                shape = RoundedCornerShape(LumiraTokens.Radius.Lg),
            )
            .padding(LumiraTokens.Space.S4),
        horizontalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S3),
    ) {
        BeltLogo(
            size = LumiraTokens.Space.S6,
            containerColor = LumiraTokens.Colors.Purple100,
            markColor = LumiraTokens.Colors.Purple700,
        )
        Text(
            text = buildAnnotatedString {
                append(stringResource(R.string.login_invite_notice_prefix))
                withStyle(
                    MaterialTheme.typography.bodyMedium.toSpanStyle().copy(
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary,
                    ),
                ) {
                    append(stringResource(R.string.login_invite_notice_bold))
                }
                append(stringResource(R.string.login_invite_notice_suffix))
            },
            style = MaterialTheme.typography.bodyMedium,
            color = LumiraTokens.Colors.Fg2,
            modifier = Modifier.weight(1f),
        )
    }
}
