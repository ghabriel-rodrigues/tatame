package br.com.tatame.feature.agenda

import androidx.annotation.StringRes
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import br.com.tatame.R
import br.com.tatame.core.designsystem.theme.PillShape
import br.com.tatame.core.network.dto.CalendarBuckets
import br.com.tatame.core.network.dto.CalendarClassItem
import br.com.tatame.core.network.dto.CalendarEventItem
import br.com.tatame.feature.enrollment.EnrollmentErrorState
import br.com.tatame.feature.events.EventFormat
import com.tatame.designsystem.tokens.LumiraTokens
import java.time.LocalDate
import java.time.YearMonth
import org.koin.androidx.compose.koinViewModel

/**
 * Aluno month calendar (AGD.8, aluno-08) — entered from the Agenda header's
 * "Mês" button, dismissed with the back chevron. Purple dots come from the
 * enrolled-class weekday buckets; pink dots from the month's published events
 * (EVT.12 — the Phase-7 legend finally tells the truth). Tapping a day
 * Evento entry pushes the event detail via [onOpenEvent].
 */
@Composable
fun AlunoCalendarScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    onOpenEvent: ((String) -> Unit)? = null,
    viewModel: AlunoCalendarViewModel = koinViewModel(),
) {
    CalendarScreen(
        viewModel = viewModel,
        subtitleRes = R.string.calendar_subtitle_aluno,
        classLegendRes = R.string.calendar_legend_class_aluno,
        emptyDayRes = R.string.calendar_empty_day_aluno,
        showProfessor = true,
        onBack = onBack,
        onOpenEvent = onOpenEvent,
        modifier = modifier,
    )
}

/**
 * Professor month calendar (AGD.8, professor-04) — entered from the dashboard
 * header's calendar icon. Own classes only; legend reads "aula recorrente" /
 * "evento"; free days say "Dia livre — bom descanso.". Event dots and day
 * entries are read-only here (no professor event route, spec 008).
 */
@Composable
fun ProfessorCalendarScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: ProfessorCalendarViewModel = koinViewModel(),
) {
    CalendarScreen(
        viewModel = viewModel,
        subtitleRes = R.string.calendar_subtitle_professor,
        classLegendRes = R.string.calendar_legend_class_professor,
        emptyDayRes = R.string.calendar_empty_day_professor,
        showProfessor = false,
        onBack = onBack,
        onOpenEvent = null,
        modifier = modifier,
    )
}

// ---- shared layout (one shape, persona-parameterized copy) ---------------

@Composable
private fun CalendarScreen(
    viewModel: CalendarViewModel,
    @StringRes subtitleRes: Int,
    @StringRes classLegendRes: Int,
    @StringRes emptyDayRes: Int,
    showProfessor: Boolean,
    onBack: () -> Unit,
    onOpenEvent: ((String) -> Unit)?,
    modifier: Modifier = Modifier,
) {
    val state by viewModel.uiState.collectAsState()

    Column(modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        Spacer(Modifier.height(LumiraTokens.Space.S6))

        when (val calendar = state.calendar) {
            is CalendarState.Loading -> {
                CalendarHeader(title = null, subtitleRes = subtitleRes, onBack = onBack)
                Box(
                    modifier = Modifier.fillMaxWidth().padding(vertical = LumiraTokens.Space.S8),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                }
            }

            is CalendarState.Error -> {
                CalendarHeader(title = null, subtitleRes = subtitleRes, onBack = onBack)
                EnrollmentErrorState(messageRes = calendar.messageRes, onRetry = viewModel::refresh)
            }

            is CalendarState.Loaded -> {
                CalendarHeader(
                    title = CalendarGrid.monthTitle(calendar.month),
                    subtitleRes = subtitleRes,
                    onBack = onBack,
                )
                Spacer(Modifier.height(LumiraTokens.Space.S3))
                MonthCard(
                    month = calendar.month,
                    buckets = calendar.buckets,
                    events = calendar.events,
                    selectedDate = state.selectedDate,
                    onSelect = viewModel::selectDay,
                    classLegendRes = classLegendRes,
                )
                Spacer(Modifier.height(LumiraTokens.Space.S5))
                Text(
                    text = CalendarGrid.dayTitle(state.selectedDate),
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Spacer(Modifier.height(LumiraTokens.Space.S3))
                DayAgenda(
                    items = CalendarGrid.dayItems(calendar.buckets, state.selectedDate),
                    events = CalendarGrid.dayEvents(calendar.events, state.selectedDate),
                    emptyDayRes = emptyDayRes,
                    showProfessor = showProfessor,
                    onOpenEvent = onOpenEvent,
                )
            }
        }
        Spacer(Modifier.height(LumiraTokens.Space.S8))
    }
}

@Composable
private fun CalendarHeader(title: String?, @StringRes subtitleRes: Int, onBack: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
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
        Spacer(Modifier.width(LumiraTokens.Space.S3))
        Column {
            Text(
                text = title ?: stringResource(R.string.calendar_title_fallback),
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = stringResource(subtitleRes),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

// ---- month grid ----------------------------------------------------------

@Composable
private fun MonthCard(
    month: YearMonth,
    buckets: CalendarBuckets,
    events: List<CalendarEventItem>,
    selectedDate: LocalDate,
    onSelect: (LocalDate) -> Unit,
    @StringRes classLegendRes: Int,
) {
    val today = LocalDate.now()
    Surface(
        shape = RoundedCornerShape(LumiraTokens.Radius.Lg),
        color = MaterialTheme.colorScheme.surface,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(LumiraTokens.Space.S3)) {
            Row {
                CalendarGrid.WEEK_HEADER.forEach { letter ->
                    Text(
                        text = letter,
                        style = MaterialTheme.typography.labelSmall,
                        color = LumiraTokens.Colors.Fg4,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
            Spacer(Modifier.height(LumiraTokens.Space.S1))
            CalendarGrid.cells(month).chunked(GRID_COLUMNS).forEach { week ->
                Row {
                    week.forEach { date ->
                        if (date == null) {
                            Spacer(Modifier.weight(1f))
                        } else {
                            DayCell(
                                date = date,
                                selected = date == selectedDate,
                                isToday = date == today,
                                hasDot = CalendarGrid.hasClassDot(buckets, date),
                                hasEventDot = CalendarGrid.hasEventDot(events, date),
                                onSelect = onSelect,
                                modifier = Modifier.weight(1f),
                            )
                        }
                    }
                    // Pad the trailing partial week so columns stay aligned.
                    repeat(GRID_COLUMNS - week.size) { Spacer(Modifier.weight(1f)) }
                }
            }
            Spacer(Modifier.height(LumiraTokens.Space.S3))
            HorizontalDivider(color = LumiraTokens.Colors.Border1)
            Spacer(Modifier.height(LumiraTokens.Space.S3))
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S4),
            ) {
                LegendEntry(color = LumiraTokens.Colors.Purple500, labelRes = classLegendRes)
                // Pink event dots are real data now (EVT.12/13, spec 008).
                LegendEntry(
                    color = LumiraTokens.Colors.Pink500,
                    labelRes = R.string.calendar_legend_event,
                )
            }
        }
    }
}

private const val GRID_COLUMNS = 7

@Composable
private fun DayCell(
    date: LocalDate,
    selected: Boolean,
    isToday: Boolean,
    hasDot: Boolean,
    hasEventDot: Boolean,
    onSelect: (LocalDate) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .padding(2.dp)
            .background(
                color = if (selected) LumiraTokens.Colors.Purple700 else Color.Transparent,
                shape = RoundedCornerShape(LumiraTokens.Radius.Sm),
            )
            .clickable { onSelect(date) }
            .padding(vertical = LumiraTokens.Space.S1),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = "${date.dayOfMonth}",
            style = MaterialTheme.typography.labelSmall,
            color = when {
                selected -> LumiraTokens.Colors.FgOnColor
                isToday -> LumiraTokens.Colors.Purple700
                else -> LumiraTokens.Colors.Fg2
            },
        )
        Spacer(Modifier.height(2.dp))
        // Class dot (purple) + event dot (pink) side by side when both land.
        Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            if (hasDot) {
                Box(
                    modifier = Modifier
                        .size(4.dp)
                        .background(
                            color = if (selected) {
                                LumiraTokens.Colors.FgOnColor
                            } else {
                                LumiraTokens.Colors.Purple500
                            },
                            shape = PillShape,
                        ),
                )
            }
            if (hasEventDot) {
                Box(
                    modifier = Modifier
                        .size(4.dp)
                        .background(color = LumiraTokens.Colors.Pink500, shape = PillShape),
                )
            }
            if (!hasDot && !hasEventDot) {
                Box(modifier = Modifier.size(4.dp))
            }
        }
    }
}

@Composable
private fun LegendEntry(color: Color, @StringRes labelRes: Int) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(modifier = Modifier.size(6.dp).background(color = color, shape = PillShape))
        Spacer(Modifier.width(LumiraTokens.Space.S1))
        Text(
            text = stringResource(labelRes),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

// ---- selected-day agenda -------------------------------------------------

@Composable
private fun DayAgenda(
    items: List<CalendarClassItem>,
    events: List<CalendarEventItem>,
    @StringRes emptyDayRes: Int,
    showProfessor: Boolean,
    onOpenEvent: ((String) -> Unit)?,
) {
    if (items.isEmpty() && events.isEmpty()) {
        Text(
            text = stringResource(emptyDayRes),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().padding(vertical = LumiraTokens.Space.S6),
        )
        return
    }
    Column(verticalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S2)) {
        items.forEach { item ->
            DayAgendaRow(item = item, showProfessor = showProfessor)
        }
        // Evento entries merged after the classes (EVT.12/13, spec 008).
        events.forEach { event ->
            DayEventRow(event = event, onOpen = onOpenEvent)
        }
    }
}

/** Selected-day Evento entry — pink tag; tappable on the aluno calendar only. */
@Composable
private fun DayEventRow(event: CalendarEventItem, onOpen: ((String) -> Unit)?) {
    Surface(
        shape = RoundedCornerShape(LumiraTokens.Radius.Md),
        color = MaterialTheme.colorScheme.surface,
        modifier = Modifier
            .fillMaxWidth()
            .then(
                if (onOpen != null) {
                    Modifier.clickable { onOpen(event.id) }
                } else {
                    Modifier
                },
            ),
    ) {
        Row(
            modifier = Modifier.padding(
                horizontal = LumiraTokens.Space.S3,
                vertical = LumiraTokens.Space.S2,
            ),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = event.time ?: "—",
                style = MaterialTheme.typography.bodyMedium,
                color = LumiraTokens.Colors.Pink600,
                modifier = Modifier.width(LumiraTokens.Space.S12),
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = event.name,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = listOfNotNull(
                        event.location,
                        EventFormat.valorChip(event.priceCents),
                    ).joinToString(" · "),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Box(
                modifier = Modifier
                    .background(color = LumiraTokens.Colors.Pink100, shape = PillShape)
                    .padding(horizontal = LumiraTokens.Space.S2, vertical = LumiraTokens.Space.S1),
            ) {
                Text(
                    text = stringResource(R.string.calendar_tag_evento),
                    style = MaterialTheme.typography.labelSmall,
                    color = LumiraTokens.Colors.Pink700,
                )
            }
        }
    }
}

@Composable
private fun DayAgendaRow(item: CalendarClassItem, showProfessor: Boolean) {
    Surface(
        shape = RoundedCornerShape(LumiraTokens.Radius.Md),
        color = MaterialTheme.colorScheme.surface,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.padding(
                horizontal = LumiraTokens.Space.S3,
                vertical = LumiraTokens.Space.S2,
            ),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = item.startTime,
                style = MaterialTheme.typography.bodyMedium,
                color = LumiraTokens.Colors.Purple700,
                modifier = Modifier.width(LumiraTokens.Space.S12),
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = item.className,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = if (showProfessor) {
                        stringResource(R.string.agenda_card_professor, item.professorName)
                    } else {
                        stringResource(
                            R.string.turma_occupancy_chip,
                            item.occupancy.active,
                            item.occupancy.capacity,
                        )
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            // Every v1 item is a class; the Evento tag arrives with the events phase.
            Box(
                modifier = Modifier
                    .background(color = LumiraTokens.Colors.Purple100, shape = PillShape)
                    .padding(horizontal = LumiraTokens.Space.S2, vertical = LumiraTokens.Space.S1),
            ) {
                Text(
                    text = stringResource(R.string.calendar_tag_aula),
                    style = MaterialTheme.typography.labelSmall,
                    color = LumiraTokens.Colors.Purple700,
                )
            }
        }
    }
}
