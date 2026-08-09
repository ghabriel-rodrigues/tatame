package br.com.tatame.feature.enrollment.professor

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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import br.com.tatame.R
import br.com.tatame.core.designsystem.theme.PillShape
import br.com.tatame.core.network.dto.ClassDetail
import br.com.tatame.core.network.dto.ClassListItem
import br.com.tatame.core.network.dto.RosterStudent
import androidx.compose.material3.OutlinedButton
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import br.com.tatame.feature.attendance.professor.LiveChamadaSheet
import br.com.tatame.feature.attendance.professor.RollCallScreen
import br.com.tatame.feature.graduation.professor.StudentProfileScreen
import br.com.tatame.feature.enrollment.AvatarBubble
import br.com.tatame.feature.enrollment.EnrollmentChip
import br.com.tatame.feature.enrollment.EnrollmentErrorState
import br.com.tatame.feature.enrollment.EnrollmentNotice
import br.com.tatame.feature.enrollment.ScheduleFormat
import com.tatame.designsystem.tokens.LumiraTokens
import org.koin.androidx.compose.koinViewModel

/**
 * Professor "Turmas" tab (ENR.21/22 + ATT.20/21, professor-07…10): Minhas
 * turmas list → turma detail (roster add/remove, chamada entries) →
 * Adicionar aluno sheet / chamada ao vivo sheet / chamada manual screen.
 * State-driven, no nav library (same convention as AppRoot).
 */
@Composable
fun TurmasTab(
    academyName: String?,
    modifier: Modifier = Modifier,
    canUpdateGraduations: Boolean = true,
    viewModel: TurmasViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    var liveChamadaOpen by remember { mutableStateOf(false) }
    var rollCallOpen by remember { mutableStateOf(false) }
    var profileStudentId by remember { mutableStateOf<String?>(null) }
    val openDetail = (state.detail as? TurmaDetailState.Loaded)?.detail

    // Perfil do aluno replaces the detail surface (GRD.20, professor-11).
    profileStudentId?.let { studentId ->
        StudentProfileScreen(
            studentId = studentId,
            canUpdateGraduations = canUpdateGraduations,
            onBack = { profileStudentId = null },
            modifier = modifier,
        )
        return
    }

    // Chamada manual replaces the detail surface (professor-10).
    if (rollCallOpen && openDetail != null) {
        RollCallScreen(
            classId = openDetail.id,
            className = openDetail.name,
            onClose = { rollCallOpen = false },
            modifier = modifier,
        )
        return
    }

    Box(modifier = modifier.fillMaxSize()) {
        when (val detail = state.detail) {
            is TurmaDetailState.Hidden -> TurmasListScreen(
                state = state.list,
                academyName = academyName,
                onRetry = viewModel::refresh,
                onOpen = viewModel::openTurma,
            )
            is TurmaDetailState.Loading -> CenteredLoading()
            is TurmaDetailState.Error -> Column {
                BackRow(onBack = viewModel::closeTurma, title = "", subtitle = null)
                EnrollmentErrorState(messageRes = detail.messageRes, onRetry = viewModel::refresh)
            }
            is TurmaDetailState.Loaded -> TurmaDetailScreen(
                detail = detail.detail,
                actionErrorRes = state.actionErrorRes,
                onBack = viewModel::closeTurma,
                onAddStudent = viewModel::openAddSheet,
                onOpenStudent = { student -> profileStudentId = student.studentId },
                onRequestRemove = viewModel::requestRemove,
                onDismissActionError = viewModel::dismissActionError,
                onLiveChamada = { liveChamadaOpen = true },
                onManualChamada = { rollCallOpen = true },
            )
        }
    }

    if (liveChamadaOpen && openDetail != null) {
        LiveChamadaSheet(
            classId = openDetail.id,
            className = openDetail.name,
            onDismiss = { liveChamadaOpen = false },
        )
    }

    if (state.addSheet.visible) {
        val turmaName = (state.detail as? TurmaDetailState.Loaded)?.detail?.name.orEmpty()
        AddStudentSheet(
            turmaName = turmaName,
            sheet = state.addSheet,
            onAdd = viewModel::addStudent,
            onDismiss = viewModel::dismissAddSheet,
        )
    }

    state.removeDialog?.let { dialog ->
        val turmaName = (state.detail as? TurmaDetailState.Loaded)?.detail?.name.orEmpty()
        AlertDialog(
            onDismissRequest = viewModel::dismissRemove,
            title = { Text(stringResource(R.string.roster_remove_title)) },
            text = {
                Text(
                    stringResource(R.string.roster_remove_body, dialog.student.fullName, turmaName),
                )
            },
            confirmButton = {
                TextButton(onClick = viewModel::confirmRemove, enabled = !dialog.removing) {
                    Text(
                        text = stringResource(R.string.roster_remove_confirm),
                        color = LumiraTokens.Colors.Danger500,
                    )
                }
            },
            dismissButton = {
                TextButton(onClick = viewModel::dismissRemove) {
                    Text(stringResource(R.string.roster_remove_cancel))
                }
            },
        )
    }
}

// ---- list (professor-07) ------------------------------------------------

@Composable
private fun TurmasListScreen(
    state: TurmasListState,
    academyName: String?,
    onRetry: () -> Unit,
    onOpen: (String) -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        Spacer(Modifier.height(LumiraTokens.Space.S6))
        Text(
            text = stringResource(R.string.turmas_title),
            style = MaterialTheme.typography.headlineMedium,
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
        Spacer(Modifier.height(LumiraTokens.Space.S4))

        when (state) {
            is TurmasListState.Loading -> CenteredLoading()
            is TurmasListState.Error ->
                EnrollmentErrorState(messageRes = state.messageRes, onRetry = onRetry)
            is TurmasListState.Loaded ->
                if (state.classes.isEmpty()) {
                    Text(
                        text = stringResource(R.string.turmas_empty),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                } else {
                    LazyColumn(verticalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S3)) {
                        items(state.classes, key = { it.id }) { turma ->
                            TurmaCard(turma = turma, onClick = { onOpen(turma.id) })
                        }
                    }
                }
        }
    }
}

@Composable
private fun TurmaCard(turma: ClassListItem, onClick: () -> Unit) {
    Surface(
        shape = RoundedCornerShape(LumiraTokens.Radius.Lg),
        color = MaterialTheme.colorScheme.surface,
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
    ) {
        Column(modifier = Modifier.padding(LumiraTokens.Space.S4)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = turma.name,
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
            Spacer(Modifier.height(LumiraTokens.Space.S1))
            Text(
                text = ScheduleFormat.scheduleLine(turma.schedules),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(LumiraTokens.Space.S3))
            Row(horizontalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S2)) {
                if (turma.ageMin != null && turma.ageMax != null) {
                    EnrollmentChip(
                        text = stringResource(R.string.turma_age_chip, turma.ageMin, turma.ageMax),
                        containerColor = LumiraTokens.Colors.Purple100,
                        contentColor = LumiraTokens.Colors.Purple700,
                    )
                }
                EnrollmentChip(
                    text = stringResource(R.string.turma_occupancy_chip, turma.occupancy, turma.capacity),
                    containerColor = LumiraTokens.Colors.Gray100,
                    contentColor = LumiraTokens.Colors.Fg3,
                )
                if (turma.lotada) {
                    EnrollmentChip(
                        text = stringResource(R.string.turma_lotada),
                        containerColor = LumiraTokens.Colors.Danger100,
                        contentColor = LumiraTokens.Colors.Danger500,
                    )
                }
            }
            Spacer(Modifier.height(LumiraTokens.Space.S3))
            OccupancyBar(occupancy = turma.occupancy, capacity = turma.capacity)
        }
    }
}

@Composable
private fun OccupancyBar(occupancy: Int, capacity: Int) {
    val progress = if (capacity > 0) occupancy.toFloat() / capacity else 0f
    LinearProgressIndicator(
        progress = { progress.coerceIn(0f, 1f) },
        modifier = Modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.primary,
        trackColor = MaterialTheme.colorScheme.surfaceVariant,
    )
}

// ---- detail (professor-08) ----------------------------------------------

@Composable
private fun TurmaDetailScreen(
    detail: ClassDetail,
    actionErrorRes: Int?,
    onBack: () -> Unit,
    onAddStudent: () -> Unit,
    onOpenStudent: (RosterStudent) -> Unit,
    onRequestRemove: (RosterStudent) -> Unit,
    onDismissActionError: () -> Unit,
    onLiveChamada: () -> Unit,
    onManualChamada: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        Spacer(Modifier.height(LumiraTokens.Space.S6))
        BackRow(
            onBack = onBack,
            title = detail.name,
            subtitle = ScheduleFormat.scheduleLine(detail.schedules),
        )
        Spacer(Modifier.height(LumiraTokens.Space.S4))

        // Stat tiles: alunos + ocupação are real; frequência is the explicit
        // Fase-4 placeholder (spec 003 — attendance never faked).
        Row(horizontalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S2)) {
            StatTile(
                value = "${detail.occupancy}",
                label = stringResource(R.string.turma_stat_students),
                modifier = Modifier.weight(1f),
            )
            StatTile(
                value = "—",
                label = stringResource(R.string.turma_stat_frequency),
                caption = stringResource(R.string.turma_stat_frequency_placeholder),
                modifier = Modifier.weight(1f),
            )
            StatTile(
                value = occupancyPercent(detail.occupancy, detail.capacity),
                label = stringResource(R.string.turma_stat_occupancy),
                modifier = Modifier.weight(1f),
            )
        }
        Spacer(Modifier.height(LumiraTokens.Space.S4))

        // ATT.20/21 — chamada is real now: live code sheet + manual roll call.
        Button(
            onClick = onLiveChamada,
            shape = PillShape,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(stringResource(R.string.turma_roll_call_cta))
        }
        OutlinedButton(
            onClick = onManualChamada,
            shape = PillShape,
            modifier = Modifier.fillMaxWidth().padding(top = LumiraTokens.Space.S2),
        ) {
            Text(stringResource(R.string.turma_roll_call_manual_cta))
        }

        actionErrorRes?.let {
            Spacer(Modifier.height(LumiraTokens.Space.S3))
            Box(Modifier.clickable(onClick = onDismissActionError)) {
                EnrollmentNotice(
                    text = stringResource(it),
                    containerColor = LumiraTokens.Colors.Danger100,
                )
            }
        }

        Spacer(Modifier.height(LumiraTokens.Space.S5))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = stringResource(R.string.turma_roster_title),
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.weight(1f),
            )
            Button(
                onClick = onAddStudent,
                shape = PillShape,
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                ),
            ) {
                Text(
                    text = stringResource(R.string.turma_add_student),
                    style = MaterialTheme.typography.labelSmall,
                )
            }
        }
        Spacer(Modifier.height(LumiraTokens.Space.S3))

        if (detail.roster.isEmpty()) {
            Text(
                text = stringResource(R.string.turma_roster_empty),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S2)) {
                items(detail.roster, key = { it.studentId }) { student ->
                    RosterRow(
                        student = student,
                        onOpen = { onOpenStudent(student) },
                        onRemove = { onRequestRemove(student) },
                    )
                }
            }
        }
    }
}

@Composable
private fun StatTile(
    value: String,
    label: String,
    modifier: Modifier = Modifier,
    caption: String? = null,
) {
    Surface(
        shape = RoundedCornerShape(LumiraTokens.Radius.Md),
        color = MaterialTheme.colorScheme.surface,
        modifier = modifier,
    ) {
        Column(
            modifier = Modifier.padding(LumiraTokens.Space.S3),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = value,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
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

@Composable
private fun RosterRow(student: RosterStudent, onOpen: () -> Unit, onRemove: () -> Unit) {
    Surface(
        shape = RoundedCornerShape(LumiraTokens.Radius.Md),
        color = MaterialTheme.colorScheme.surface,
        // Row tap opens the perfil do aluno (GRD.20); remove keeps its own button.
        modifier = Modifier.fillMaxWidth().clickable(onClick = onOpen),
    ) {
        Row(
            modifier = Modifier.padding(
                horizontal = LumiraTokens.Space.S3,
                vertical = LumiraTokens.Space.S2,
            ),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S3),
        ) {
            AvatarBubble(fullName = student.fullName)
            Text(
                text = student.fullName,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.weight(1f),
            )
            if (student.badge == "pendente") {
                EnrollmentChip(
                    text = stringResource(R.string.roster_badge_pendente),
                    containerColor = LumiraTokens.Colors.Warning100,
                    contentColor = LumiraTokens.Colors.Fg2,
                )
            }
            RemoveButton(
                contentDescription = stringResource(R.string.roster_remove_action, student.fullName),
                onClick = onRemove,
            )
        }
    }
}

@Composable
private fun RemoveButton(contentDescription: String, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(LumiraTokens.Space.S8)
            .background(color = LumiraTokens.Colors.Gray100, shape = PillShape)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = "–",
            style = MaterialTheme.typography.titleMedium,
            color = LumiraTokens.Colors.Fg3,
        )
    }
}

// ---- adicionar aluno sheet (professor-09) --------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddStudentSheet(
    turmaName: String,
    sheet: AddStudentSheetState,
    onAdd: (String) -> Unit,
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
                text = stringResource(R.string.turma_add_student),
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Spacer(Modifier.height(LumiraTokens.Space.S1))
            Text(
                text = stringResource(R.string.add_student_subtitle, turmaName),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            sheet.errorRes?.let {
                Spacer(Modifier.height(LumiraTokens.Space.S3))
                EnrollmentNotice(
                    text = stringResource(it),
                    containerColor = LumiraTokens.Colors.Danger100,
                )
            }
            Spacer(Modifier.height(LumiraTokens.Space.S4))

            when {
                sheet.loading -> CenteredLoading()
                sheet.candidates.isEmpty() -> Text(
                    text = stringResource(R.string.add_student_empty),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                else -> LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S2),
                ) {
                    items(sheet.candidates, key = { it.studentId }) { candidate ->
                        CandidateRow(
                            candidate = candidate,
                            adding = sheet.addingStudentId == candidate.studentId,
                            enabled = sheet.addingStudentId == null,
                            onAdd = { onAdd(candidate.studentId) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun CandidateRow(
    candidate: RosterStudent,
    adding: Boolean,
    enabled: Boolean,
    onAdd: () -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(LumiraTokens.Radius.Md),
        color = LumiraTokens.Colors.BgSunken,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.padding(
                horizontal = LumiraTokens.Space.S3,
                vertical = LumiraTokens.Space.S2,
            ),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S3),
        ) {
            AvatarBubble(fullName = candidate.fullName)
            Text(
                text = candidate.fullName,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.weight(1f),
            )
            if (adding) {
                CircularProgressIndicator(modifier = Modifier.size(LumiraTokens.Space.S4))
            } else {
                TextButton(onClick = onAdd, enabled = enabled) {
                    Text(
                        text = stringResource(R.string.add_student_action),
                        style = MaterialTheme.typography.labelSmall,
                        color = LumiraTokens.Colors.Purple700,
                    )
                }
            }
        }
    }
}

// ---- shared bits ---------------------------------------------------------

@Composable
private fun BackRow(onBack: () -> Unit, title: String, subtitle: String?) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S3),
    ) {
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
        Column {
            Text(
                text = title,
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onBackground,
            )
            subtitle?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
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

private fun occupancyPercent(occupancy: Int, capacity: Int): String =
    if (capacity <= 0) "—" else "${(occupancy * 100) / capacity}%"
