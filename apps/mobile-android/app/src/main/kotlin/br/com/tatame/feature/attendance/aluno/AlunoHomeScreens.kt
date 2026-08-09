package br.com.tatame.feature.attendance.aluno

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
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import br.com.tatame.R
import br.com.tatame.core.designsystem.components.BeltBar
import br.com.tatame.core.designsystem.components.BeltBarSize
import br.com.tatame.core.designsystem.theme.PillShape
import br.com.tatame.core.network.dto.AlunoHomeGraduation
import br.com.tatame.core.network.dto.AlunoHomeResponse
import br.com.tatame.core.network.dto.AlunoTodayClass
import br.com.tatame.core.network.dto.MensalidadeAlert
import br.com.tatame.feature.billing.BillingFormat
import br.com.tatame.feature.enrollment.EnrollmentErrorState
import br.com.tatame.feature.enrollment.EnrollmentNotice
import br.com.tatame.feature.enrollment.ScheduleFormat
import br.com.tatame.feature.graduation.GraduationFormat
import br.com.tatame.feature.graduation.aluno.AlunoGraduacaoScreen
import br.com.tatame.feature.graduation.toBeltDisplay
import com.tatame.designsystem.tokens.LumiraTokens
import org.koin.androidx.compose.koinViewModel

/**
 * Aluno "Início" tab (ATT.19, aluno-03/04/05): hero card with the check-in
 * CTA (flips to "Presença registrada"), stat tiles (streak hidden when the
 * academy disabled gamification.streak), graduation lesson-count card, and
 * the 3-method check-in bottom sheet + success pop.
 *
 * [openCheckinOnEnter] is the central-FAB entry (the Check-in tab of the
 * placeholder bar routes here with the sheet already open).
 */
@Composable
fun AlunoHomeTab(
    firstName: String,
    modifier: Modifier = Modifier,
    openCheckinOnEnter: Boolean = false,
    onOpenCarteira: () -> Unit = {},
    onOpenAgenda: () -> Unit = {},
    viewModel: AlunoHomeViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    var graduacaoOpen by rememberSaveable { mutableStateOf(false) }

    LaunchedEffect(openCheckinOnEnter) {
        if (openCheckinOnEnter) viewModel.openCheckinSheet()
    }

    // GRD.19 — the home graduation card links to the Graduação screen.
    if (graduacaoOpen) {
        AlunoGraduacaoScreen(onBack = { graduacaoOpen = false }, modifier = modifier)
        return
    }

    Column(
        modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState()),
    ) {
        Spacer(Modifier.height(LumiraTokens.Space.S6))
        Text(
            text = stringResource(R.string.aluno_home_greeting, firstName),
            style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.onBackground,
        )
        Spacer(Modifier.height(LumiraTokens.Space.S4))

        when (val home = state.home) {
            is AlunoHomeState.Loading -> CenteredLoading()
            is AlunoHomeState.Error ->
                EnrollmentErrorState(messageRes = home.messageRes, onRetry = viewModel::refresh)
            is AlunoHomeState.Loaded -> AlunoHomeContent(
                home = home.home,
                onCheckin = viewModel::openCheckinSheet,
                onOpenGraduacao = { graduacaoOpen = true },
                onOpenCarteira = onOpenCarteira,
                onOpenAgenda = onOpenAgenda,
            )
        }
        Spacer(Modifier.height(LumiraTokens.Space.S8))
    }

    AlunoCheckinSheetHost(viewModel = viewModel)
}

/**
 * The Phase-4 check-in sheet + success pop rendered from [viewModel] state.
 * Public so other aluno surfaces reuse the *same* sheet (the Agenda tab's
 * card button, AGD.7 — spec 007 story 7); [onCheckinApplied] fires when a
 * check-in result lands so callers can refetch their own read model.
 */
@Composable
fun AlunoCheckinSheetHost(
    viewModel: AlunoHomeViewModel = koinViewModel(),
    onCheckinApplied: () -> Unit = {},
) {
    val state by viewModel.uiState.collectAsState()
    val hasResult = state.result != null
    LaunchedEffect(hasResult) {
        if (hasResult) onCheckinApplied()
    }

    if (state.sheet.visible) {
        CheckinSheet(
            todayClass = (state.home as? AlunoHomeState.Loaded)?.home?.todayClass,
            sheet = state.sheet,
            onSelectMethod = viewModel::selectMethod,
            onCodeInput = viewModel::updateCodeInput,
            onSubmitCode = viewModel::submitCode,
            onSubmitManual = viewModel::submitManual,
            onQrScanned = viewModel::onQrScanned,
            onDismiss = viewModel::dismissSheet,
        )
    }

    state.result?.let { result ->
        CheckinResultSheet(result = result, onDismiss = viewModel::dismissResult)
    }
}

// ---- Início content (aluno-03) -------------------------------------------

@Composable
private fun AlunoHomeContent(
    home: AlunoHomeResponse,
    onCheckin: () -> Unit,
    onOpenGraduacao: () -> Unit,
    onOpenCarteira: () -> Unit,
    onOpenAgenda: () -> Unit,
) {
    HeroCard(todayClass = home.todayClass, onCheckin = onCheckin, onOpenAgenda = onOpenAgenda)
    // Real "mensalidade em aberto" alert (spec 006, story 7) — deep-links
    // into the Carteira tab; absent when nothing is open (server truth).
    home.mensalidade?.let { alert ->
        Spacer(Modifier.height(LumiraTokens.Space.S3))
        MensalidadeAlertCard(alert = alert, onOpen = onOpenCarteira)
    }
    Spacer(Modifier.height(LumiraTokens.Space.S4))
    StatTilesRow(home = home)
    Spacer(Modifier.height(LumiraTokens.Space.S4))
    GraduationCard(
        graduation = home.graduation,
        totalLessons = home.stats.totalLessons,
        onOpen = onOpenGraduacao,
    )
}

/** Home mensalidade alert fed by real charge data — never a placeholder. */
@Composable
private fun MensalidadeAlertCard(alert: MensalidadeAlert, onOpen: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                color = if (alert.overdue) {
                    LumiraTokens.Colors.Danger100
                } else {
                    LumiraTokens.Colors.Warning100
                },
                shape = RoundedCornerShape(LumiraTokens.Radius.Md),
            )
            .clickable(onClick = onOpen)
            .padding(LumiraTokens.Space.S3),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = if (alert.overdue) {
                        stringResource(
                            R.string.home_mensalidade_overdue,
                            BillingFormat.longDate(alert.dueDate),
                        )
                    } else {
                        stringResource(
                            R.string.home_mensalidade_open,
                            BillingFormat.longDate(alert.dueDate),
                        )
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = LumiraTokens.Colors.Fg1,
                )
                Text(
                    text = stringResource(
                        R.string.home_mensalidade_amount,
                        BillingFormat.amountBRL(alert.amountCents),
                    ),
                    style = MaterialTheme.typography.labelSmall,
                    color = if (alert.overdue) {
                        LumiraTokens.Colors.Danger500
                    } else {
                        LumiraTokens.Colors.Warning500
                    },
                )
            }
            Text(
                text = "›",
                style = MaterialTheme.typography.titleMedium,
                color = LumiraTokens.Colors.Fg3,
            )
        }
    }
}

@Composable
private fun HeroCard(todayClass: AlunoTodayClass?, onCheckin: () -> Unit, onOpenAgenda: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                brush = Brush.linearGradient(
                    colors = listOf(LumiraTokens.Colors.Purple700, LumiraTokens.Colors.Purple500),
                ),
                shape = RoundedCornerShape(LumiraTokens.Radius.Lg),
            )
            .padding(LumiraTokens.Space.S4),
    ) {
        Column {
            if (todayClass == null) {
                Text(
                    text = stringResource(R.string.aluno_hero_no_class_title),
                    style = MaterialTheme.typography.titleLarge,
                    color = LumiraTokens.Colors.FgOnColor,
                )
                Spacer(Modifier.height(LumiraTokens.Space.S1))
                Text(
                    text = stringResource(R.string.aluno_hero_no_class_body),
                    style = MaterialTheme.typography.bodySmall,
                    color = LumiraTokens.Colors.Purple100,
                )
                return@Column
            }

            HeroChip(
                text = if (todayClass.checkedIn) {
                    stringResource(R.string.aluno_hero_checked_in_chip)
                } else {
                    stringResource(R.string.aluno_hero_today_chip, todayClass.slot.startTime)
                },
                success = todayClass.checkedIn,
            )
            Spacer(Modifier.height(LumiraTokens.Space.S2))
            Text(
                text = todayClass.className,
                style = MaterialTheme.typography.headlineMedium,
                color = LumiraTokens.Colors.FgOnColor,
            )
            Spacer(Modifier.height(LumiraTokens.Space.S1))
            Text(
                text = stringResource(
                    R.string.aluno_hero_subtitle,
                    ScheduleFormat.timeRange(todayClass.slot),
                    todayClass.slot.durationMinutes,
                ),
                style = MaterialTheme.typography.bodySmall,
                color = LumiraTokens.Colors.Purple100,
            )
            Spacer(Modifier.height(LumiraTokens.Space.S3))
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (!todayClass.checkedIn) {
                    Button(
                        onClick = onCheckin,
                        shape = PillShape,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = LumiraTokens.Colors.White,
                            contentColor = LumiraTokens.Colors.Purple700,
                        ),
                    ) {
                        Text(
                            text = stringResource(R.string.aluno_hero_checkin_cta),
                            style = MaterialTheme.typography.labelSmall,
                        )
                    }
                    Spacer(Modifier.size(LumiraTokens.Space.S2))
                }
                // AGD.7 closes the recorded "Ver agenda" debt: the CTA now
                // navigates to the real Agenda tab.
                TextButton(onClick = onOpenAgenda) {
                    Text(
                        text = stringResource(R.string.aluno_hero_agenda_cta),
                        style = MaterialTheme.typography.labelSmall,
                        color = LumiraTokens.Colors.Purple100,
                    )
                }
            }
        }
    }
}

@Composable
private fun HeroChip(text: String, success: Boolean) {
    Box(
        modifier = Modifier
            .background(
                color = if (success) LumiraTokens.Colors.Success100 else LumiraTokens.Colors.Purple600,
                shape = PillShape,
            )
            .padding(horizontal = LumiraTokens.Space.S3, vertical = LumiraTokens.Space.S1),
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelSmall,
            color = if (success) LumiraTokens.Colors.Success500 else LumiraTokens.Colors.FgOnColor,
        )
    }
}

@Composable
private fun StatTilesRow(home: AlunoHomeResponse) {
    val streak = home.stats.streak
    Row(horizontalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S2)) {
        StatTile(
            value = stringResource(
                R.string.aluno_stat_presence_value,
                home.stats.monthPresencePct.toInt(),
            ),
            label = stringResource(R.string.aluno_stat_presence_label),
            modifier = Modifier.weight(1f),
        )
        // Streak tile hidden entirely when gamification.streak is off (spec story 16).
        if (streak != null) {
            StatTile(
                value = "$streak",
                label = stringResource(R.string.aluno_stat_streak_label),
                accent = true,
                modifier = Modifier.weight(1f),
            )
        }
        // "graus na faixa" is real derived data now (GRD.19, story 7).
        val graduation = home.graduation
        StatTile(
            value = graduation?.belt?.degrees?.toString() ?: "—",
            label = stringResource(R.string.aluno_stat_graduation_label),
            caption = if (graduation == null) {
                stringResource(R.string.aluno_stat_graduation_placeholder)
            } else {
                null
            },
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun StatTile(
    value: String,
    label: String,
    modifier: Modifier = Modifier,
    accent: Boolean = false,
    caption: String? = null,
) {
    Surface(
        shape = RoundedCornerShape(LumiraTokens.Radius.Md),
        color = if (accent) LumiraTokens.Colors.Pink50 else MaterialTheme.colorScheme.surface,
        modifier = modifier,
    ) {
        Column(
            modifier = Modifier.padding(LumiraTokens.Space.S3),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = value,
                style = MaterialTheme.typography.titleMedium,
                color = if (accent) LumiraTokens.Colors.Pink600 else MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
            caption?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.labelSmall,
                    color = LumiraTokens.Colors.Purple700,
                )
            }
        }
    }
}

/**
 * Home graduation card (GRD.19 supersedes the Phase-4 placeholder): the
 * derived belt drawn by [BeltBar], the progress toward the academy-rule
 * target, and a tap-through to the Graduação screen. The legacy lifetime
 * rendering only survives as a defensive fallback for a payload-less server.
 */
@Composable
private fun GraduationCard(
    graduation: AlunoHomeGraduation?,
    totalLessons: Int,
    onOpen: () -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(LumiraTokens.Radius.Lg),
        color = MaterialTheme.colorScheme.surface,
        modifier = Modifier.fillMaxWidth().clickable(onClick = onOpen),
    ) {
        Column(modifier = Modifier.padding(LumiraTokens.Space.S4)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = stringResource(R.string.aluno_graduation_title),
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    text = "›",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (graduation == null) {
                Spacer(Modifier.height(LumiraTokens.Space.S3))
                LinearProgressIndicator(
                    progress = { 0f },
                    modifier = Modifier.fillMaxWidth(),
                    color = LumiraTokens.Colors.Pink500,
                    trackColor = MaterialTheme.colorScheme.surfaceVariant,
                )
                Spacer(Modifier.height(LumiraTokens.Space.S2))
                Text(
                    text = stringResource(R.string.aluno_graduation_lessons, totalLessons),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                return@Column
            }
            Spacer(Modifier.height(LumiraTokens.Space.S3))
            BeltBar(
                belt = graduation.belt.toBeltDisplay(),
                size = BeltBarSize.Md,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(LumiraTokens.Space.S3))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = GraduationFormat.heroTitle(graduation.belt),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    text = graduation.progress.label,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.height(LumiraTokens.Space.S2))
            LinearProgressIndicator(
                progress = {
                    GraduationFormat.progressFraction(
                        graduation.progress.current,
                        graduation.progress.target,
                    )
                },
                modifier = Modifier.fillMaxWidth(),
                color = LumiraTokens.Colors.Pink500,
                trackColor = MaterialTheme.colorScheme.surfaceVariant,
            )
            Spacer(Modifier.height(LumiraTokens.Space.S2))
            Text(
                text = GraduationFormat.lessonsLabel(
                    graduation.progress.current,
                    graduation.progress.target,
                ),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

// ---- check-in sheet (aluno-04) -------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CheckinSheet(
    todayClass: AlunoTodayClass?,
    sheet: CheckinSheetState,
    onSelectMethod: (CheckinMethodTab) -> Unit,
    onCodeInput: (String) -> Unit,
    onSubmitCode: () -> Unit,
    onSubmitManual: () -> Unit,
    onQrScanned: (String) -> Unit,
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
                text = stringResource(
                    R.string.checkin_sheet_title,
                    todayClass?.className ?: stringResource(R.string.tab_checkin),
                ),
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
            todayClass?.let {
                Spacer(Modifier.height(LumiraTokens.Space.S1))
                Text(
                    text = stringResource(
                        R.string.checkin_sheet_subtitle,
                        ScheduleFormat.timeRange(it.slot),
                    ),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.height(LumiraTokens.Space.S4))

            MethodSegmentedControl(selected = sheet.method, onSelect = onSelectMethod)

            sheet.errorRes?.let {
                Spacer(Modifier.height(LumiraTokens.Space.S3))
                EnrollmentNotice(
                    text = stringResource(it),
                    containerColor = LumiraTokens.Colors.Danger100,
                )
            }
            Spacer(Modifier.height(LumiraTokens.Space.S4))

            when (sheet.method) {
                CheckinMethodTab.QR -> QrPane(submitting = sheet.submitting, onQrScanned = onQrScanned)
                CheckinMethodTab.CODE -> CodePane(
                    sheet = sheet,
                    onCodeInput = onCodeInput,
                    onSubmit = onSubmitCode,
                )
                CheckinMethodTab.MANUAL -> ManualPane(
                    hasTodayClass = todayClass != null,
                    submitting = sheet.submitting,
                    onSubmit = onSubmitManual,
                )
            }
        }
    }
}

@Composable
private fun MethodSegmentedControl(
    selected: CheckinMethodTab,
    onSelect: (CheckinMethodTab) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(color = LumiraTokens.Colors.BgSunken, shape = PillShape)
            .padding(LumiraTokens.Space.S1),
        horizontalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S1),
    ) {
        MethodPill(
            label = stringResource(R.string.checkin_method_qr),
            selected = selected == CheckinMethodTab.QR,
            onClick = { onSelect(CheckinMethodTab.QR) },
            modifier = Modifier.weight(1f),
        )
        MethodPill(
            label = stringResource(R.string.checkin_method_code),
            selected = selected == CheckinMethodTab.CODE,
            onClick = { onSelect(CheckinMethodTab.CODE) },
            modifier = Modifier.weight(1f),
        )
        MethodPill(
            label = stringResource(R.string.checkin_method_manual),
            selected = selected == CheckinMethodTab.MANUAL,
            onClick = { onSelect(CheckinMethodTab.MANUAL) },
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun MethodPill(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .background(
                color = if (selected) LumiraTokens.Colors.Purple700 else LumiraTokens.Colors.BgSunken,
                shape = PillShape,
            )
            .clickable(onClick = onClick)
            .padding(vertical = LumiraTokens.Space.S2),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = if (selected) LumiraTokens.Colors.FgOnColor else LumiraTokens.Colors.Fg3,
        )
    }
}

@Composable
private fun QrPane(submitting: Boolean, onQrScanned: (String) -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(240.dp)
                .background(
                    color = LumiraTokens.Colors.BgSunken,
                    shape = RoundedCornerShape(LumiraTokens.Radius.Md),
                ),
            contentAlignment = Alignment.Center,
        ) {
            if (submitting) {
                CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
            } else {
                QrScannerPane(onQrScanned = onQrScanned)
            }
        }
        Spacer(Modifier.height(LumiraTokens.Space.S3))
        Text(
            text = stringResource(R.string.checkin_qr_hint),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun CodePane(
    sheet: CheckinSheetState,
    onCodeInput: (String) -> Unit,
    onSubmit: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        OutlinedTextField(
            value = sheet.codeInput,
            onValueChange = onCodeInput,
            enabled = !sheet.submitting,
            singleLine = true,
            textStyle = MaterialTheme.typography.headlineMedium.copy(textAlign = TextAlign.Center),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(LumiraTokens.Space.S2))
        Text(
            text = stringResource(R.string.checkin_code_hint),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(LumiraTokens.Space.S4))
        SubmitButton(
            label = stringResource(R.string.checkin_code_cta),
            submitting = sheet.submitting,
            enabled = sheet.codeInput.length == LIVE_CODE_LENGTH,
            onClick = onSubmit,
        )
    }
}

@Composable
private fun ManualPane(hasTodayClass: Boolean, submitting: Boolean, onSubmit: () -> Unit) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = if (hasTodayClass) {
                stringResource(R.string.checkin_manual_hint)
            } else {
                stringResource(R.string.checkin_no_class_today)
            },
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(LumiraTokens.Space.S4))
        SubmitButton(
            label = stringResource(R.string.checkin_manual_cta),
            submitting = submitting,
            enabled = hasTodayClass,
            onClick = onSubmit,
        )
    }
}

@Composable
private fun SubmitButton(label: String, submitting: Boolean, enabled: Boolean, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        enabled = enabled && !submitting,
        shape = PillShape,
        modifier = Modifier.fillMaxWidth(),
    ) {
        if (submitting) {
            CircularProgressIndicator(
                modifier = Modifier.size(LumiraTokens.Space.S4),
                color = LumiraTokens.Colors.FgOnColor,
            )
        } else {
            Text(label)
        }
    }
}

// ---- success pop (aluno-05) ----------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CheckinResultSheet(result: CheckinResultState, onDismiss: () -> Unit) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = LumiraTokens.Space.S5)
                .padding(bottom = LumiraTokens.Space.S8),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box(
                modifier = Modifier
                    .size(LumiraTokens.Space.S12)
                    .background(color = LumiraTokens.Colors.Success500, shape = PillShape),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "✓",
                    style = MaterialTheme.typography.titleLarge,
                    color = LumiraTokens.Colors.FgOnColor,
                )
            }
            Spacer(Modifier.height(LumiraTokens.Space.S4))
            Text(
                text = if (result.alreadyCheckedIn) {
                    stringResource(R.string.checkin_already_title)
                } else {
                    stringResource(R.string.checkin_success_title)
                },
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Spacer(Modifier.height(LumiraTokens.Space.S1))
            Text(
                // Streak line hidden when gamification.streak is off (streak null).
                text = when {
                    result.alreadyCheckedIn -> stringResource(R.string.checkin_already_body)
                    result.streak != null ->
                        stringResource(R.string.checkin_success_streak, result.streak)
                    else -> stringResource(R.string.checkin_success_no_streak)
                },
                style = MaterialTheme.typography.bodySmall,
                color = if (!result.alreadyCheckedIn && result.streak != null) {
                    LumiraTokens.Colors.Pink600
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant
                },
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(LumiraTokens.Space.S5))
            Button(onClick = onDismiss, shape = PillShape, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.checkin_close))
            }
        }
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
