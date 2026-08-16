package br.com.tatame.feature.profile

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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import br.com.tatame.R
import br.com.tatame.core.designsystem.theme.PillShape
import br.com.tatame.core.network.dto.AlunoProfileResponse
import br.com.tatame.core.network.dto.ProfileGenders
import br.com.tatame.feature.enrollment.AvatarBubble
import br.com.tatame.feature.enrollment.EnrollmentErrorState
import br.com.tatame.feature.enrollment.EnrollmentNotice
import com.tatame.designsystem.tokens.LumiraTokens
import org.koin.androidx.compose.koinViewModel

/**
 * Aluno Dados pessoais screen (REP.13, aluno-18): Salvar in the header,
 * "Trocar foto" placeholder, IDENTIFICAÇÃO / CONTATO / ENDEREÇO / CONTATO DE
 * EMERGÊNCIA sections, dashed lock boxes for a set CPF/RG, read-only email and
 * nascimento, and the single Cidade / UF input parsed on save. Two-column rows
 * use equal weights — the prototype's clipped fields are a recorded bug this
 * screen deliberately does not reproduce.
 */
@Composable
fun DadosPessoaisScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: DadosPessoaisViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    Column(modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        Spacer(Modifier.height(LumiraTokens.Space.S6))
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S3),
        ) {
            ProfileBackBubble(onBack = onBack)
            Text(
                text = stringResource(R.string.profile_title),
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onBackground,
                modifier = Modifier.weight(1f),
            )
            if (state.load is ProfileLoadState.Loaded) {
                Button(
                    onClick = viewModel::save,
                    enabled = !state.saving,
                    shape = PillShape,
                ) {
                    if (state.saving) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(LumiraTokens.Space.S4),
                            color = LumiraTokens.Colors.FgOnColor,
                        )
                    } else {
                        Text(
                            text = stringResource(R.string.profile_save_cta),
                            style = MaterialTheme.typography.labelSmall,
                        )
                    }
                }
            }
        }
        Spacer(Modifier.height(LumiraTokens.Space.S4))

        when (val load = state.load) {
            is ProfileLoadState.Loading -> Box(
                modifier = Modifier.fillMaxWidth().padding(vertical = LumiraTokens.Space.S8),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
            }
            is ProfileLoadState.Error ->
                EnrollmentErrorState(messageRes = load.messageRes, onRetry = viewModel::refresh)
            is ProfileLoadState.Loaded -> ProfileFormContent(
                profile = load.profile,
                state = state,
                viewModel = viewModel,
            )
        }
        Spacer(Modifier.height(LumiraTokens.Space.S8))
    }
}

@Composable
private fun ProfileFormContent(
    profile: AlunoProfileResponse,
    state: DadosPessoaisUiState,
    viewModel: DadosPessoaisViewModel,
) {
    val form = state.form
    val errors = state.fieldErrors

    // Avatar + the "Trocar foto" placeholder (upload is recorded debt — the
    // disabled button keeps the roadmap visible without pretending to work).
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S4),
    ) {
        AvatarBubble(
            fullName = profile.fullName,
            size = LumiraTokens.Space.S12,
            containerColor = LumiraTokens.Colors.Purple500,
            contentColor = LumiraTokens.Colors.FgOnColor,
        )
        OutlinedButton(onClick = {}, enabled = false, shape = PillShape) {
            Text(
                text = stringResource(R.string.profile_change_photo),
                style = MaterialTheme.typography.labelSmall,
            )
        }
    }

    state.noticeRes?.let { noticeRes ->
        Spacer(Modifier.height(LumiraTokens.Space.S3))
        EnrollmentNotice(
            text = stringResource(noticeRes),
            containerColor = if (state.noticeIsError) {
                LumiraTokens.Colors.Danger100
            } else {
                LumiraTokens.Colors.Success100
            },
        )
    }

    // ---- IDENTIFICAÇÃO ---------------------------------------------------
    SectionLabel(stringResource(R.string.profile_section_identification))
    ProfileTextField(
        value = form.fullName,
        onValueChange = viewModel::updateFullName,
        placeholder = stringResource(R.string.profile_field_full_name),
        errorRes = errors[ProfileField.FULL_NAME],
    )
    Spacer(Modifier.height(LumiraTokens.Space.S2))
    Row(horizontalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S2)) {
        // Birth date is a read-only identity fact (age-rule authority is the
        // student row) — rendered, never editable.
        ReadOnlyField(
            value = profile.birthDate?.let(ProfileFormat::formatBirthDate)
                ?: stringResource(R.string.profile_birth_missing),
            modifier = Modifier.weight(1f),
        )
        GenderField(
            gender = form.gender,
            onSelect = viewModel::updateGender,
            modifier = Modifier.weight(1f),
        )
    }
    Spacer(Modifier.height(LumiraTokens.Space.S2))
    Row(horizontalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S2)) {
        if (profile.cpfLocked) {
            LockedDocumentBox(
                text = stringResource(
                    R.string.profile_locked_cpf,
                    ProfileFormat.formatCpf(profile.cpf.orEmpty()),
                ),
                modifier = Modifier.weight(1f),
            )
        } else {
            ProfileTextField(
                value = form.cpfInput,
                onValueChange = viewModel::updateCpf,
                placeholder = stringResource(R.string.profile_field_cpf),
                errorRes = errors[ProfileField.CPF],
                keyboardType = KeyboardType.Number,
                modifier = Modifier.weight(1f),
            )
        }
        if (profile.rgLocked) {
            LockedDocumentBox(
                text = stringResource(R.string.profile_locked_rg, profile.rg.orEmpty()),
                modifier = Modifier.weight(1f),
            )
        } else {
            ProfileTextField(
                value = form.rgInput,
                onValueChange = viewModel::updateRg,
                placeholder = stringResource(R.string.profile_field_rg),
                errorRes = errors[ProfileField.RG],
                modifier = Modifier.weight(1f),
            )
        }
    }

    // ---- CONTATO ---------------------------------------------------------
    SectionLabel(stringResource(R.string.profile_section_contact))
    // Email is login identity — read-only per the spec (story 23).
    ReadOnlyField(value = profile.email)
    Spacer(Modifier.height(LumiraTokens.Space.S2))
    ProfileTextField(
        value = form.phone,
        onValueChange = viewModel::updatePhone,
        placeholder = stringResource(R.string.profile_field_phone),
        errorRes = errors[ProfileField.PHONE],
        keyboardType = KeyboardType.Phone,
    )

    // ---- ENDEREÇO --------------------------------------------------------
    SectionLabel(stringResource(R.string.profile_section_address))
    ProfileTextField(
        value = form.addressLine,
        onValueChange = viewModel::updateAddressLine,
        placeholder = stringResource(R.string.profile_field_address_line),
        errorRes = errors[ProfileField.ADDRESS_LINE],
    )
    Spacer(Modifier.height(LumiraTokens.Space.S2))
    Row(horizontalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S2)) {
        ProfileTextField(
            value = form.cityUf,
            onValueChange = viewModel::updateCityUf,
            placeholder = stringResource(R.string.profile_field_city_uf),
            errorRes = errors[ProfileField.CITY_UF],
            modifier = Modifier.weight(1f),
        )
        ProfileTextField(
            value = form.cep,
            onValueChange = viewModel::updateCep,
            placeholder = stringResource(R.string.profile_field_cep),
            errorRes = errors[ProfileField.CEP],
            keyboardType = KeyboardType.Number,
            modifier = Modifier.weight(1f),
        )
    }

    // ---- CONTATO DE EMERGÊNCIA -------------------------------------------
    SectionLabel(stringResource(R.string.profile_section_emergency))
    ProfileTextField(
        value = form.emergencyName,
        onValueChange = viewModel::updateEmergencyName,
        placeholder = stringResource(R.string.profile_field_emergency_name),
        errorRes = errors[ProfileField.EMERGENCY_NAME],
    )
    Spacer(Modifier.height(LumiraTokens.Space.S2))
    ProfileTextField(
        value = form.emergencyPhone,
        onValueChange = viewModel::updateEmergencyPhone,
        placeholder = stringResource(R.string.profile_field_emergency_phone),
        errorRes = errors[ProfileField.EMERGENCY_PHONE],
        keyboardType = KeyboardType.Phone,
    )
}

// ---- building blocks -----------------------------------------------------

@Composable
private fun SectionLabel(text: String) {
    Spacer(Modifier.height(LumiraTokens.Space.S5))
    Text(
        text = text.uppercase(),
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    Spacer(Modifier.height(LumiraTokens.Space.S2))
}

@Composable
private fun ProfileTextField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    errorRes: Int?,
    modifier: Modifier = Modifier,
    keyboardType: KeyboardType = KeyboardType.Text,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        placeholder = {
            Text(text = placeholder, style = MaterialTheme.typography.bodyMedium)
        },
        singleLine = true,
        isError = errorRes != null,
        supportingText = errorRes?.let {
            {
                Text(
                    text = stringResource(it),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
        },
        textStyle = MaterialTheme.typography.bodyMedium,
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
        shape = RoundedCornerShape(LumiraTokens.Radius.Md),
        modifier = modifier.fillMaxWidth(),
    )
}

/** Read-only identity box (email, nascimento) — sunken, never editable. */
@Composable
private fun ReadOnlyField(value: String, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .background(
                color = LumiraTokens.Colors.BgSunken,
                shape = RoundedCornerShape(LumiraTokens.Radius.Md),
            )
            .padding(horizontal = LumiraTokens.Space.S3, vertical = LumiraTokens.Space.S3),
    ) {
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            color = LumiraTokens.Colors.Fg2,
        )
    }
}

/** The aluno-18 dashed lock box for a set CPF/RG (write-once, story 22). */
@Composable
private fun LockedDocumentBox(text: String, modifier: Modifier = Modifier) {
    val borderColor = LumiraTokens.Colors.Border1
    val density = LocalDensity.current
    val radiusPx = with(density) { LumiraTokens.Radius.Md.toPx() }
    val strokePx = with(density) { 1.dp.toPx() }
    val dashPx = with(density) { LumiraTokens.Space.S1.toPx() }
    Row(
        modifier = modifier
            .fillMaxWidth()
            .drawBehind {
                drawRoundRect(
                    color = borderColor,
                    cornerRadius = CornerRadius(radiusPx, radiusPx),
                    style = Stroke(
                        width = strokePx,
                        pathEffect = PathEffect.dashPathEffect(floatArrayOf(dashPx, dashPx)),
                    ),
                )
            }
            .padding(horizontal = LumiraTokens.Space.S3, vertical = LumiraTokens.Space.S3),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.bodySmall,
            color = LumiraTokens.Colors.Fg3,
            modifier = Modifier.weight(1f),
        )
        Spacer(Modifier.width(LumiraTokens.Space.S1))
        Text(
            text = "🔒",
            style = MaterialTheme.typography.labelSmall,
            color = LumiraTokens.Colors.Fg3,
        )
    }
}

/** PT-BR labels for the server gender enum (UI copy only). */
@Composable
internal fun genderLabel(gender: String?): String = when (gender) {
    ProfileGenders.FEMALE -> stringResource(R.string.profile_gender_female)
    ProfileGenders.MALE -> stringResource(R.string.profile_gender_male)
    ProfileGenders.OTHER -> stringResource(R.string.profile_gender_other)
    ProfileGenders.UNSPECIFIED -> stringResource(R.string.profile_gender_unspecified)
    else -> stringResource(R.string.profile_gender_placeholder)
}

/** Gender picker: read-only field + dropdown (no experimental menu APIs). */
@Composable
private fun GenderField(
    gender: String?,
    onSelect: (String?) -> Unit,
    modifier: Modifier = Modifier,
) {
    var expanded by remember { mutableStateOf(false) }
    Box(modifier = modifier) {
        OutlinedTextField(
            value = if (gender == null) "" else genderLabel(gender),
            onValueChange = {},
            readOnly = true,
            singleLine = true,
            placeholder = {
                Text(
                    text = stringResource(R.string.profile_gender_placeholder),
                    style = MaterialTheme.typography.bodyMedium,
                )
            },
            trailingIcon = {
                Text(
                    text = "▾",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            },
            textStyle = MaterialTheme.typography.bodyMedium,
            shape = RoundedCornerShape(LumiraTokens.Radius.Md),
            modifier = Modifier.fillMaxWidth(),
        )
        // Transparent capture layer: OutlinedTextField swallows clicks even
        // when readOnly, so the overlay owns the open gesture.
        Box(
            modifier = Modifier
                .matchParentSize()
                .clickable { expanded = true },
        )
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            ProfileGenders.ALL.forEach { option ->
                DropdownMenuItem(
                    text = { Text(genderLabel(option)) },
                    onClick = {
                        expanded = false
                        onSelect(option)
                    },
                )
            }
        }
    }
}

@Composable
private fun ProfileBackBubble(onBack: () -> Unit) {
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
