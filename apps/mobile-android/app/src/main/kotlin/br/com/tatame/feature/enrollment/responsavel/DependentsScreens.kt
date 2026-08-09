package br.com.tatame.feature.enrollment.responsavel

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import br.com.tatame.R
import br.com.tatame.core.designsystem.components.BeltBar
import br.com.tatame.core.designsystem.components.BeltBarSize
import br.com.tatame.core.designsystem.components.BeltChip
import br.com.tatame.core.designsystem.theme.PillShape
import br.com.tatame.core.network.dto.DependentDetail
import br.com.tatame.feature.billing.BillingFormat
import br.com.tatame.feature.enrollment.AvatarBubble
import br.com.tatame.feature.graduation.GraduationFormat
import br.com.tatame.feature.graduation.toBeltDisplay
import br.com.tatame.feature.enrollment.EnrollmentChip
import br.com.tatame.feature.enrollment.EnrollmentErrorState
import br.com.tatame.feature.enrollment.EnrollmentNotice
import br.com.tatame.feature.enrollment.ScheduleFormat
import com.tatame.designsystem.tokens.LumiraTokens
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import org.koin.androidx.compose.koinViewModel
import org.koin.core.parameter.parametersOf

private val PT_BR = Locale("pt", "BR")

/**
 * Responsável home tab (ENR.22/23, responsavel-02 + responsavel-08):
 * greeting, dependent cards (name, age, class, next slot), dependent detail,
 * and the Cadastrar aluno sheet gated by the `dependents.register` toggle.
 */
@Composable
fun DependentsHomeTab(
    guardianFirstName: String,
    canRegisterDependents: Boolean,
    modifier: Modifier = Modifier,
    viewModel: DependentsViewModel = koinViewModel { parametersOf(canRegisterDependents) },
) {
    val state by viewModel.uiState.collectAsState()

    Box(modifier = modifier.fillMaxSize()) {
        when (val detail = state.detail) {
            is DependentDetailState.Hidden -> DependentsPanel(
                state = state,
                guardianFirstName = guardianFirstName,
                onRetry = viewModel::refresh,
                onOpen = viewModel::openDependent,
                onRegister = viewModel::openRegisterSheet,
                onDismissSuccess = viewModel::dismissSuccess,
            )
            is DependentDetailState.Loading -> CenteredLoading()
            is DependentDetailState.Error -> Column {
                Spacer(Modifier.height(LumiraTokens.Space.S6))
                BackBubble(onBack = viewModel::closeDependent)
                EnrollmentErrorState(messageRes = detail.messageRes, onRetry = viewModel::refresh)
            }
            is DependentDetailState.Loaded -> DependentDetailScreen(
                dependent = detail.dependent,
                onBack = viewModel::closeDependent,
            )
        }
    }

    if (state.sheet.visible) {
        RegisterDependentSheet(
            sheet = state.sheet,
            onNameChange = viewModel::onFullNameChange,
            onBirthDateChange = viewModel::onBirthDateChange,
            onToggleSuggestion = viewModel::toggleSuggestionAccepted,
            onSubmit = viewModel::register,
            onDismiss = viewModel::dismissRegisterSheet,
        )
    }
}

// ---- panel (responsavel-02) ---------------------------------------------

@Composable
private fun DependentsPanel(
    state: DependentsUiState,
    guardianFirstName: String,
    onRetry: () -> Unit,
    onOpen: (String) -> Unit,
    onRegister: () -> Unit,
    onDismissSuccess: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        Spacer(Modifier.height(LumiraTokens.Space.S6))
        Text(
            text = todayLabel(),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(LumiraTokens.Space.S1))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = stringResource(R.string.shell_greeting, guardianFirstName),
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.onBackground,
                modifier = Modifier.weight(1f),
            )
            EnrollmentChip(
                text = stringResource(R.string.dependents_role_chip),
                containerColor = LumiraTokens.Colors.Pink100,
                contentColor = LumiraTokens.Colors.InkPink,
            )
        }
        Spacer(Modifier.height(LumiraTokens.Space.S4))

        state.success?.let { success ->
            Box(Modifier.clickable(onClick = onDismissSuccess)) {
                EnrollmentNotice(
                    text = stringResource(
                        if (success.enrolled) {
                            R.string.register_success_enrolled
                        } else {
                            R.string.register_success_not_enrolled
                        },
                        success.dependentName,
                    ),
                    containerColor = if (success.enrolled) {
                        LumiraTokens.Colors.Success100
                    } else {
                        LumiraTokens.Colors.Warning100
                    },
                )
            }
            Spacer(Modifier.height(LumiraTokens.Space.S3))
        }

        when (val list = state.list) {
            is DependentsListState.Loading -> CenteredLoading()
            is DependentsListState.Error ->
                EnrollmentErrorState(messageRes = list.messageRes, onRetry = onRetry)
            is DependentsListState.Loaded -> LazyColumn(
                verticalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S3),
            ) {
                items(list.dependents, key = { it.id }) { dependent ->
                    DependentCard(dependent = dependent, onClick = { onOpen(dependent.id) })
                }
                item(key = "footer") {
                    Column {
                        if (list.dependents.isEmpty()) {
                            Text(
                                text = stringResource(R.string.dependents_empty),
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Spacer(Modifier.height(LumiraTokens.Space.S3))
                        }
                        // Hidden entirely when the academy disabled the toggle (story 36).
                        if (state.canRegister) {
                            RegisterCta(onClick = onRegister)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DependentCard(dependent: DependentDetail, onClick: () -> Unit) {
    Surface(
        shape = RoundedCornerShape(LumiraTokens.Radius.Lg),
        color = MaterialTheme.colorScheme.surface,
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
    ) {
        Column(modifier = Modifier.padding(LumiraTokens.Space.S4)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S3),
            ) {
                AvatarBubble(
                    fullName = dependent.fullName,
                    containerColor = LumiraTokens.Colors.Purple500,
                    contentColor = LumiraTokens.Colors.FgOnColor,
                )
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = dependent.fullName,
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Text(
                        text = ageClassLine(dependent),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Text(
                    text = "›",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            // GRD.20 (story 34) — the child's derived belt drawn with degrees.
            dependent.belt?.let { belt ->
                Spacer(Modifier.height(LumiraTokens.Space.S3))
                BeltBar(
                    belt = belt.toBeltDisplay(),
                    size = BeltBarSize.Sm,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(LumiraTokens.Space.S2))
                Text(
                    text = GraduationFormat.chipLabel(belt),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            ScheduleFormat.nextSlotLabel(dependent.enrolledClass?.nextSlot)?.let { next ->
                Spacer(Modifier.height(LumiraTokens.Space.S3))
                EnrollmentChip(
                    text = stringResource(R.string.dependent_next_slot, next),
                    containerColor = LumiraTokens.Colors.Purple100,
                    contentColor = LumiraTokens.Colors.Purple700,
                )
            }
            // Mensalidade alert fed by real charge data (spec 006, story 22).
            dependent.mensalidade?.let { alert ->
                Spacer(Modifier.height(LumiraTokens.Space.S3))
                EnrollmentChip(
                    text = if (alert.overdue) {
                        stringResource(
                            R.string.dependent_mensalidade_overdue,
                            BillingFormat.shortDay(alert.dueDate),
                        )
                    } else {
                        stringResource(
                            R.string.dependent_mensalidade_open,
                            BillingFormat.shortDay(alert.dueDate),
                        )
                    },
                    containerColor = if (alert.overdue) {
                        LumiraTokens.Colors.Danger100
                    } else {
                        LumiraTokens.Colors.Warning100
                    },
                    contentColor = if (alert.overdue) {
                        LumiraTokens.Colors.Danger500
                    } else {
                        LumiraTokens.Colors.Warning500
                    },
                )
            }
        }
    }
}

@Composable
private fun RegisterCta(onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .border(
                width = 1.dp,
                color = LumiraTokens.Colors.Purple300,
                shape = RoundedCornerShape(LumiraTokens.Radius.Md),
            )
            .background(
                color = LumiraTokens.Colors.BrandTint,
                shape = RoundedCornerShape(LumiraTokens.Radius.Md),
            )
            .clickable(onClick = onClick)
            .padding(LumiraTokens.Space.S3),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = stringResource(R.string.dependents_register_cta),
            style = MaterialTheme.typography.labelLarge,
            color = LumiraTokens.Colors.Purple700,
        )
    }
}

// ---- detail --------------------------------------------------------------

@Composable
private fun DependentDetailScreen(dependent: DependentDetail, onBack: () -> Unit) {
    Column(modifier = Modifier.fillMaxSize()) {
        Spacer(Modifier.height(LumiraTokens.Space.S6))
        BackBubble(onBack = onBack)
        Spacer(Modifier.height(LumiraTokens.Space.S4))
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S3),
        ) {
            AvatarBubble(
                fullName = dependent.fullName,
                size = LumiraTokens.Space.S10,
                containerColor = LumiraTokens.Colors.Purple500,
                contentColor = LumiraTokens.Colors.FgOnColor,
            )
            Column {
                Text(
                    text = dependent.fullName,
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onBackground,
                )
                Text(
                    text = ageClassLine(dependent),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        // GRD.20 (story 34) — belt chip on the dependent detail as well.
        dependent.belt?.let { belt ->
            Spacer(Modifier.height(LumiraTokens.Space.S3))
            BeltChip(label = GraduationFormat.chipLabel(belt), belt = belt.toBeltDisplay())
        }
        Spacer(Modifier.height(LumiraTokens.Space.S4))
        Text(
            text = stringResource(
                R.string.dependent_detail_birth,
                ScheduleFormat.formatBrDate(dependent.birthDate),
            ),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (dependent.status == "inactive") {
            Spacer(Modifier.height(LumiraTokens.Space.S2))
            EnrollmentChip(
                text = stringResource(R.string.dependent_status_inactive),
                containerColor = LumiraTokens.Colors.Gray100,
                contentColor = LumiraTokens.Colors.Fg3,
            )
        }
        Spacer(Modifier.height(LumiraTokens.Space.S5))

        val enrolledClass = dependent.enrolledClass
        if (enrolledClass == null) {
            EnrollmentNotice(text = stringResource(R.string.dependent_no_class))
        } else {
            Text(
                text = stringResource(R.string.dependent_detail_schedule),
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Spacer(Modifier.height(LumiraTokens.Space.S3))
            Surface(
                shape = RoundedCornerShape(LumiraTokens.Radius.Lg),
                color = MaterialTheme.colorScheme.surface,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(modifier = Modifier.padding(LumiraTokens.Space.S4)) {
                    Text(
                        text = enrolledClass.name,
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Spacer(Modifier.height(LumiraTokens.Space.S2))
                    enrolledClass.schedules.forEach { slot ->
                        Text(
                            text = "${ScheduleFormat.weekdayAbbrev(slot.weekday)} " +
                                ScheduleFormat.timeRange(slot),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}

// ---- cadastrar aluno sheet (responsavel-08) ------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RegisterDependentSheet(
    sheet: RegisterSheetState,
    onNameChange: (String) -> Unit,
    onBirthDateChange: (String) -> Unit,
    onToggleSuggestion: () -> Unit,
    onSubmit: () -> Unit,
    onDismiss: () -> Unit,
) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = LumiraTokens.Space.S5)
                .padding(bottom = LumiraTokens.Space.S8),
        ) {
            Text(
                text = stringResource(R.string.register_sheet_title),
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Spacer(Modifier.height(LumiraTokens.Space.S1))
            Text(
                text = stringResource(R.string.register_sheet_subtitle),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(LumiraTokens.Space.S4))

            SheetTextField(
                value = sheet.fullName,
                onValueChange = onNameChange,
                placeholder = stringResource(R.string.register_name_placeholder),
                keyboardType = KeyboardType.Text,
            )
            Spacer(Modifier.height(LumiraTokens.Space.S3))
            SheetTextField(
                value = sheet.birthDateInput,
                onValueChange = onBirthDateChange,
                placeholder = stringResource(R.string.register_birth_placeholder),
                keyboardType = KeyboardType.Number,
            )

            // Suggestion chip appears only after a complete valid birth date (ENR.23).
            when (val suggestion = sheet.suggestion) {
                is SuggestionState.Idle -> Unit
                is SuggestionState.Loading -> {
                    Spacer(Modifier.height(LumiraTokens.Space.S3))
                    CircularProgressIndicator(modifier = Modifier.size(LumiraTokens.Space.S5))
                }
                is SuggestionState.None -> {
                    Spacer(Modifier.height(LumiraTokens.Space.S3))
                    Text(
                        text = stringResource(R.string.register_suggestion_none),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                is SuggestionState.Found -> {
                    Spacer(Modifier.height(LumiraTokens.Space.S3))
                    Text(
                        text = stringResource(R.string.register_suggestion_label),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(LumiraTokens.Space.S1))
                    SuggestionChip(
                        label = ScheduleFormat.suggestionLabel(suggestion.suggestion),
                        accepted = suggestion.accepted,
                        onToggle = onToggleSuggestion,
                    )
                }
            }

            sheet.errorRes?.let {
                Spacer(Modifier.height(LumiraTokens.Space.S3))
                EnrollmentNotice(
                    text = stringResource(it),
                    containerColor = LumiraTokens.Colors.Danger100,
                )
            }

            Spacer(Modifier.height(LumiraTokens.Space.S4))
            Button(
                onClick = onSubmit,
                enabled = !sheet.submitting,
                shape = PillShape,
                modifier = Modifier.fillMaxWidth(),
            ) {
                if (sheet.submitting) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(LumiraTokens.Space.S5),
                        color = LumiraTokens.Colors.FgOnColor,
                    )
                } else {
                    Text(stringResource(R.string.register_cta))
                }
            }
        }
    }
}

@Composable
private fun SuggestionChip(label: String, accepted: Boolean, onToggle: () -> Unit) {
    val border = if (accepted) LumiraTokens.Colors.Purple500 else LumiraTokens.Colors.Border1
    val container = if (accepted) LumiraTokens.Colors.Purple50 else LumiraTokens.Colors.BgSurface
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .border(width = 1.dp, color = border, shape = PillShape)
            .background(color = container, shape = PillShape)
            .clickable(onClick = onToggle)
            .padding(horizontal = LumiraTokens.Space.S4, vertical = LumiraTokens.Space.S2),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelLarge,
            color = LumiraTokens.Colors.Purple700,
        )
    }
}

@Composable
private fun SheetTextField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    keyboardType: KeyboardType,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        placeholder = {
            Text(text = placeholder, color = LumiraTokens.Colors.Fg4)
        },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
        shape = RoundedCornerShape(LumiraTokens.Radius.Md),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = MaterialTheme.colorScheme.primary,
            unfocusedBorderColor = LumiraTokens.Colors.Border1,
        ),
        modifier = Modifier.fillMaxWidth(),
    )
}

// ---- shared bits ---------------------------------------------------------

@Composable
private fun BackBubble(onBack: () -> Unit) {
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

@Composable
private fun ageClassLine(dependent: DependentDetail): String {
    val age = ScheduleFormat.ageYears(dependent.birthDate)
    val className = dependent.enrolledClass?.name
        ?: stringResource(R.string.dependent_no_class)
    return if (age != null) {
        stringResource(R.string.dependent_age_class, age, className)
    } else {
        className
    }
}

/** "sábado, 1 de agosto" (responsavel-02 header). */
private fun todayLabel(): String =
    LocalDate.now().format(DateTimeFormatter.ofPattern("EEEE, d 'de' MMMM", PT_BR))
