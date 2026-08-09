package br.com.tatame.feature.agenda.aluno

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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import br.com.tatame.R
import br.com.tatame.core.designsystem.theme.PillShape
import br.com.tatame.core.network.dto.AlunoAgendaClass
import br.com.tatame.feature.agenda.AgendaFormat
import br.com.tatame.feature.agenda.AlunoCalendarScreen
import br.com.tatame.feature.attendance.aluno.AlunoCheckinSheetHost
import br.com.tatame.feature.attendance.aluno.AlunoHomeViewModel
import br.com.tatame.feature.enrollment.EnrollmentChip
import br.com.tatame.feature.enrollment.EnrollmentErrorState
import br.com.tatame.feature.enrollment.ScheduleFormat
import com.tatame.designsystem.tokens.LumiraTokens
import org.koin.androidx.compose.koinViewModel

/**
 * Aluno Agenda tab (AGD.7, aluno-11): header with the academy name and the
 * "Mês" button (pushing the month calendar, AGD.8), seven day pills (today
 * default), the selected day's enrolled-class cards with the check-in
 * affordance (`isToday && !checkedIn` → button opening the shared Phase-4
 * sheet; green check when registered), the "Sem aulas neste dia" empty state,
 * and the honestly-empty "Eventos do mês" section (events-phase debt).
 */
@Composable
fun AlunoAgendaTab(
    academyName: String?,
    modifier: Modifier = Modifier,
    viewModel: AlunoAgendaViewModel = koinViewModel(),
    checkinViewModel: AlunoHomeViewModel = koinViewModel(),
) {
    var calendarOpen by rememberSaveable { mutableStateOf(false) }

    if (calendarOpen) {
        AlunoCalendarScreen(onBack = { calendarOpen = false }, modifier = modifier)
        return
    }

    val state by viewModel.uiState.collectAsState()

    Column(modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        Spacer(Modifier.height(LumiraTokens.Space.S6))
        AgendaHeader(academyName = academyName, onOpenMonth = { calendarOpen = true })
        Spacer(Modifier.height(LumiraTokens.Space.S4))

        DayPillsRow(selectedWeekday = state.selectedWeekday, onSelect = viewModel::selectWeekday)
        Spacer(Modifier.height(LumiraTokens.Space.S4))

        when (val day = state.day) {
            is AgendaDayState.Loading -> Box(
                modifier = Modifier.fillMaxWidth().padding(vertical = LumiraTokens.Space.S8),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
            }

            is AgendaDayState.Error ->
                EnrollmentErrorState(messageRes = day.messageRes, onRetry = viewModel::retry)

            is AgendaDayState.Loaded -> {
                if (day.agenda.classes.isEmpty()) {
                    EmptyDayCard()
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S3)) {
                        day.agenda.classes.forEach { item ->
                            AgendaClassCard(
                                item = item,
                                isToday = day.agenda.isToday,
                                onCheckin = checkinViewModel::openCheckinSheet,
                            )
                        }
                    }
                }
            }
        }

        Spacer(Modifier.height(LumiraTokens.Space.S6))
        EventsSection()
        Spacer(Modifier.height(LumiraTokens.Space.S8))
    }

    // The exact Phase-4 sheet the home FAB opens (spec 007 story 7); a landed
    // check-in refetches the agenda so the row flips to the green check.
    AlunoCheckinSheetHost(
        viewModel = checkinViewModel,
        onCheckinApplied = viewModel::refreshAfterCheckin,
    )
}

// ---- header + pills (aluno-11) -------------------------------------------

@Composable
private fun AgendaHeader(academyName: String?, onOpenMonth: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = stringResource(R.string.agenda_title),
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
        }
        Box(
            modifier = Modifier
                .border(width = 1.dp, color = LumiraTokens.Colors.Border1, shape = PillShape)
                .background(color = MaterialTheme.colorScheme.surface, shape = PillShape)
                .clickable(onClick = onOpenMonth)
                .padding(horizontal = LumiraTokens.Space.S3, vertical = LumiraTokens.Space.S1),
        ) {
            Text(
                text = stringResource(R.string.agenda_month_button),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }
    }
}

@Composable
private fun DayPillsRow(selectedWeekday: Int, onSelect: (Int) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S1)) {
        (0..6).forEach { weekday ->
            val selected = weekday == selectedWeekday
            Box(
                modifier = Modifier
                    .weight(1f)
                    .background(
                        color = if (selected) {
                            LumiraTokens.Colors.Purple700
                        } else {
                            MaterialTheme.colorScheme.surface
                        },
                        shape = PillShape,
                    )
                    .border(
                        width = 1.dp,
                        color = if (selected) LumiraTokens.Colors.Purple700 else LumiraTokens.Colors.Border1,
                        shape = PillShape,
                    )
                    .clickable { onSelect(weekday) }
                    .padding(vertical = LumiraTokens.Space.S2),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = ScheduleFormat.weekdayAbbrev(weekday),
                    style = MaterialTheme.typography.labelSmall,
                    color = if (selected) LumiraTokens.Colors.FgOnColor else LumiraTokens.Colors.Fg3,
                )
            }
        }
    }
}

// ---- class cards ---------------------------------------------------------

@Composable
private fun AgendaClassCard(item: AlunoAgendaClass, isToday: Boolean, onCheckin: () -> Unit) {
    Surface(
        shape = RoundedCornerShape(LumiraTokens.Radius.Lg),
        color = MaterialTheme.colorScheme.surface,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.padding(LumiraTokens.Space.S3),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(
                modifier = Modifier.width(LumiraTokens.Space.S12),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    text = item.startTime,
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = item.endTime,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.width(LumiraTokens.Space.S3))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = item.className,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = stringResource(R.string.agenda_card_professor, item.professorName),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(LumiraTokens.Space.S2))
                Row(horizontalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S2)) {
                    EnrollmentChip(
                        text = AgendaFormat.levelChipLabel(
                            ageMin = item.ageMin,
                            ageMax = item.ageMax,
                            minBeltName = item.minBelt?.name,
                            maxBeltName = item.maxBelt?.name,
                        ),
                        containerColor = LumiraTokens.Colors.Purple100,
                        contentColor = LumiraTokens.Colors.Purple700,
                    )
                    EnrollmentChip(
                        text = stringResource(
                            R.string.turma_occupancy_chip,
                            item.occupancy.active,
                            item.occupancy.capacity,
                        ),
                        containerColor = LumiraTokens.Colors.Gray100,
                        contentColor = LumiraTokens.Colors.Fg3,
                    )
                }
            }
            Spacer(Modifier.width(LumiraTokens.Space.S2))
            when {
                item.checkedIn -> CheckedInBadge()
                AgendaFormat.showCheckinButton(isToday, item.checkedIn) -> Button(
                    onClick = onCheckin,
                    shape = PillShape,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = LumiraTokens.Colors.Purple700,
                        contentColor = LumiraTokens.Colors.FgOnColor,
                    ),
                ) {
                    Text(
                        text = stringResource(R.string.agenda_checkin_cta),
                        style = MaterialTheme.typography.labelSmall,
                    )
                }
                // Off-today: no affordance at all (spec 007 story 9).
            }
        }
    }
}

/** Green presence check (spec 007 story 8). */
@Composable
private fun CheckedInBadge() {
    Box(
        modifier = Modifier
            .size(LumiraTokens.Space.S8)
            .background(color = LumiraTokens.Colors.Success100, shape = PillShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = "✓",
            style = MaterialTheme.typography.titleMedium,
            color = LumiraTokens.Colors.Success500,
        )
    }
}

// ---- empty states --------------------------------------------------------

@Composable
private fun EmptyDayCard() {
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = LumiraTokens.Space.S6),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier
                .size(LumiraTokens.Space.S10)
                .background(color = LumiraTokens.Colors.Gray100, shape = PillShape),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = "◷",
                style = MaterialTheme.typography.titleMedium,
                color = LumiraTokens.Colors.Fg3,
            )
        }
        Spacer(Modifier.height(LumiraTokens.Space.S3))
        Text(
            text = stringResource(R.string.agenda_empty_title),
            style = MaterialTheme.typography.titleMedium,
            color = LumiraTokens.Colors.Fg2,
        )
        Spacer(Modifier.height(LumiraTokens.Space.S1))
        Text(
            text = stringResource(R.string.agenda_empty_body),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}

/**
 * "Eventos do mês" — the section exists with an honest empty state wired to
 * the API's always-empty `events` array; the events phase fills data, not UI
 * plumbing (recorded debt, spec 007).
 */
@Composable
private fun EventsSection() {
    Text(
        text = stringResource(R.string.agenda_events_title),
        style = MaterialTheme.typography.titleMedium,
        color = MaterialTheme.colorScheme.onSurface,
    )
    Spacer(Modifier.height(LumiraTokens.Space.S3))
    Surface(
        shape = RoundedCornerShape(LumiraTokens.Radius.Md),
        color = MaterialTheme.colorScheme.surface,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text(
            text = stringResource(R.string.agenda_events_empty),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().padding(vertical = LumiraTokens.Space.S5),
        )
    }
}
