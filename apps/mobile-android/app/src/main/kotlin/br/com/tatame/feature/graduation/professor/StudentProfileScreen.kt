package br.com.tatame.feature.graduation.professor

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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import br.com.tatame.R
import br.com.tatame.core.designsystem.components.BeltBar
import br.com.tatame.core.designsystem.components.BeltBarSize
import br.com.tatame.core.designsystem.theme.PillShape
import br.com.tatame.core.network.dto.StudentNote
import br.com.tatame.core.network.dto.StudentProfileResponse
import br.com.tatame.feature.enrollment.AvatarBubble
import br.com.tatame.feature.enrollment.EnrollmentErrorState
import br.com.tatame.feature.enrollment.EnrollmentNotice
import br.com.tatame.feature.graduation.GraduationFormat
import br.com.tatame.feature.graduation.toBeltDisplay
import com.tatame.designsystem.tokens.LumiraTokens
import org.koin.androidx.compose.koinViewModel
import org.koin.core.parameter.parametersOf

/**
 * Professor perfil do aluno (GRD.20, professor-11): identity header, belt
 * card (BeltBar + progress + Adicionar grau / Promover faixa gated by the
 * `graduation.update` toggle — hidden when off, story 15), Phase-4 stat
 * tiles (mensalidade stays the billing-slice placeholder), and persistent
 * observações. Reached from a turma roster tap.
 */
@Composable
fun StudentProfileScreen(
    studentId: String,
    canUpdateGraduations: Boolean,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: StudentProfileViewModel = koinViewModel(key = studentId) {
        parametersOf(studentId, canUpdateGraduations)
    },
) {
    val state by viewModel.uiState.collectAsState()

    Column(modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        Spacer(Modifier.height(LumiraTokens.Space.S6))
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S3),
        ) {
            BackBubble(onBack = onBack)
            Text(
                text = stringResource(R.string.student_profile_title),
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onBackground,
            )
        }
        Spacer(Modifier.height(LumiraTokens.Space.S4))

        when (val profile = state.profile) {
            is StudentProfileState.Loading -> CenteredLoading()
            is StudentProfileState.Error ->
                EnrollmentErrorState(messageRes = profile.messageRes, onRetry = viewModel::refresh)
            is StudentProfileState.Loaded -> ProfileContent(
                profile = profile.profile,
                state = state,
                onRequestAddDegree = viewModel::requestAddDegree,
                onRequestPromote = viewModel::requestPromoteBelt,
                onNoteInput = viewModel::updateNoteInput,
                onSaveNote = viewModel::saveNote,
            )
        }
        Spacer(Modifier.height(LumiraTokens.Space.S8))
    }

    state.awardDialog?.let { dialog ->
        val studentName =
            (state.profile as? StudentProfileState.Loaded)?.profile?.student?.fullName.orEmpty()
        AwardConfirmDialog(
            dialog = dialog,
            studentName = studentName,
            onNotesChange = viewModel::updateAwardNotes,
            onConfirm = viewModel::confirmAward,
            onDismiss = viewModel::dismissAwardDialog,
        )
    }
}

@Composable
private fun ProfileContent(
    profile: StudentProfileResponse,
    state: StudentProfileUiState,
    onRequestAddDegree: () -> Unit,
    onRequestPromote: () -> Unit,
    onNoteInput: (String) -> Unit,
    onSaveNote: () -> Unit,
) {
    // Identity header (professor-11).
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S3),
    ) {
        AvatarBubble(
            fullName = profile.student.fullName,
            size = LumiraTokens.Space.S10,
            containerColor = LumiraTokens.Colors.Pink500,
            contentColor = LumiraTokens.Colors.FgOnColor,
        )
        Column {
            Text(
                text = profile.student.fullName,
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onBackground,
            )
            Text(
                text = GraduationFormat.chipLabel(profile.belt),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
    Spacer(Modifier.height(LumiraTokens.Space.S4))

    // Belt + progress + award actions card.
    Surface(
        shape = RoundedCornerShape(LumiraTokens.Radius.Lg),
        color = MaterialTheme.colorScheme.surface,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(LumiraTokens.Space.S4)) {
            BeltBar(
                belt = profile.belt.toBeltDisplay(),
                size = BeltBarSize.Md,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(LumiraTokens.Space.S3))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = GraduationFormat.chipLabel(profile.belt),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    text = stringResource(
                        R.string.student_profile_progress_line,
                        GraduationFormat.lessonsLabel(profile.progress.current, profile.progress.target),
                        profile.progress.label,
                    ),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.height(LumiraTokens.Space.S2))
            LinearProgressIndicator(
                progress = {
                    GraduationFormat.progressFraction(
                        profile.progress.current,
                        profile.progress.target,
                    )
                },
                modifier = Modifier.fillMaxWidth(),
                color = MaterialTheme.colorScheme.primary,
                trackColor = MaterialTheme.colorScheme.surfaceVariant,
            )

            // Hidden entirely when the academy turned the toggle off (story 15).
            if (state.canUpdateGraduations) {
                Spacer(Modifier.height(LumiraTokens.Space.S4))
                Row(horizontalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S2)) {
                    Button(
                        onClick = onRequestAddDegree,
                        enabled = state.canAddDegree,
                        shape = PillShape,
                        modifier = Modifier.weight(1f),
                    ) {
                        Text(
                            text = stringResource(R.string.student_profile_add_degree),
                            style = MaterialTheme.typography.labelSmall,
                        )
                    }
                    OutlinedButton(
                        onClick = onRequestPromote,
                        enabled = state.promoteTarget != null,
                        shape = PillShape,
                        modifier = Modifier.weight(1f),
                    ) {
                        Text(
                            text = stringResource(R.string.student_profile_promote),
                            style = MaterialTheme.typography.labelSmall,
                        )
                    }
                }
            }
        }
    }
    Spacer(Modifier.height(LumiraTokens.Space.S4))

    // Stat tiles: frequência + aulas no mês are Phase-4 truth; mensalidade
    // stays the billing-slice placeholder (recorded, not silently dropped).
    Row(horizontalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S2)) {
        StatTile(
            value = "${profile.stats.monthPresencePct.toInt()}%",
            label = stringResource(R.string.student_profile_stat_frequency),
            modifier = Modifier.weight(1f),
        )
        StatTile(
            value = "${profile.stats.monthAttendedSessions}",
            label = stringResource(R.string.student_profile_stat_month),
            modifier = Modifier.weight(1f),
        )
        StatTile(
            value = "—",
            label = stringResource(R.string.student_profile_stat_billing),
            caption = stringResource(R.string.student_profile_stat_billing_placeholder),
            modifier = Modifier.weight(1f),
        )
    }
    Spacer(Modifier.height(LumiraTokens.Space.S5))

    // Observações persistentes (stories 18/19 — staff-visible only).
    Text(
        text = stringResource(R.string.student_profile_notes_title),
        style = MaterialTheme.typography.titleMedium,
        color = MaterialTheme.colorScheme.onSurface,
    )
    Spacer(Modifier.height(LumiraTokens.Space.S3))
    Column(verticalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S2)) {
        profile.notes.forEach { note -> NoteCard(note = note) }
    }
    state.noteErrorRes?.let {
        Spacer(Modifier.height(LumiraTokens.Space.S3))
        EnrollmentNotice(
            text = stringResource(it),
            containerColor = LumiraTokens.Colors.Danger100,
        )
    }
    Spacer(Modifier.height(LumiraTokens.Space.S3))
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S2),
    ) {
        OutlinedTextField(
            value = state.noteInput,
            onValueChange = onNoteInput,
            enabled = !state.savingNote,
            placeholder = {
                Text(
                    text = stringResource(R.string.student_profile_note_placeholder),
                    color = LumiraTokens.Colors.Fg4,
                )
            },
            singleLine = true,
            shape = RoundedCornerShape(LumiraTokens.Radius.Md),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = MaterialTheme.colorScheme.primary,
                unfocusedBorderColor = LumiraTokens.Colors.Border1,
            ),
            modifier = Modifier.weight(1f),
        )
        Button(
            onClick = onSaveNote,
            enabled = state.noteInput.isNotBlank() && !state.savingNote,
            shape = PillShape,
        ) {
            if (state.savingNote) {
                CircularProgressIndicator(
                    modifier = Modifier.size(LumiraTokens.Space.S4),
                    color = LumiraTokens.Colors.FgOnColor,
                )
            } else {
                Text(
                    text = stringResource(R.string.student_profile_note_save),
                    style = MaterialTheme.typography.labelSmall,
                )
            }
        }
    }
}

@Composable
private fun NoteCard(note: StudentNote) {
    Surface(
        shape = RoundedCornerShape(LumiraTokens.Radius.Md),
        color = MaterialTheme.colorScheme.surface,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(LumiraTokens.Space.S3)) {
            Text(
                text = note.body,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Spacer(Modifier.height(LumiraTokens.Space.S1))
            Text(
                text = stringResource(
                    R.string.student_profile_note_meta,
                    GraduationFormat.dayMonth(note.createdAt),
                    note.author.fullName,
                ),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

// ---- award confirmation dialog (stories 10-13) ---------------------------

@Composable
private fun AwardConfirmDialog(
    dialog: AwardDialogState,
    studentName: String,
    onNotesChange: (String) -> Unit,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    val title = when (dialog.action) {
        AwardAction.ADD_DEGREE -> stringResource(R.string.student_profile_add_degree)
        AwardAction.PROMOTE_BELT -> stringResource(R.string.student_profile_promote)
    }
    val body = when (dialog.action) {
        AwardAction.ADD_DEGREE -> stringResource(
            R.string.award_degree_body,
            dialog.nextDegree ?: 0,
            studentName,
        )
        AwardAction.PROMOTE_BELT -> stringResource(
            R.string.award_belt_body,
            studentName,
            dialog.targetBelt?.name?.lowercase().orEmpty(),
        )
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column {
                Text(body)
                Spacer(Modifier.height(LumiraTokens.Space.S3))
                OutlinedTextField(
                    value = dialog.notes,
                    onValueChange = onNotesChange,
                    enabled = !dialog.submitting,
                    placeholder = {
                        Text(
                            text = stringResource(R.string.award_notes_placeholder),
                            color = LumiraTokens.Colors.Fg4,
                        )
                    },
                    shape = RoundedCornerShape(LumiraTokens.Radius.Md),
                    modifier = Modifier.fillMaxWidth(),
                )
                dialog.errorRes?.let {
                    Spacer(Modifier.height(LumiraTokens.Space.S3))
                    Text(
                        text = stringResource(it),
                        style = MaterialTheme.typography.bodySmall,
                        color = LumiraTokens.Colors.Danger500,
                        textAlign = TextAlign.Start,
                    )
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onConfirm, enabled = !dialog.submitting) {
                Text(stringResource(R.string.award_confirm))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !dialog.submitting) {
                Text(stringResource(R.string.award_cancel))
            }
        },
    )
}

// ---- shared bits ---------------------------------------------------------

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
