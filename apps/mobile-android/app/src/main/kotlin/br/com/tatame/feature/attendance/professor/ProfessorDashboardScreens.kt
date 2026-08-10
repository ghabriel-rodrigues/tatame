package br.com.tatame.feature.attendance.professor

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
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.res.stringResource
import br.com.tatame.R
import br.com.tatame.core.designsystem.theme.PillShape
import br.com.tatame.core.network.dto.ProfessorDashboardResponse
import br.com.tatame.core.network.dto.ProfessorTodayClass
import br.com.tatame.feature.agenda.ProfessorCalendarScreen
import br.com.tatame.feature.enrollment.EnrollmentErrorState
import br.com.tatame.feature.events.EventFormat
import br.com.tatame.feature.events.EventListCard
import br.com.tatame.feature.notifications.NotificationDestination
import br.com.tatame.feature.notifications.NotificationsBellBubble
import br.com.tatame.feature.notifications.NotificationsBellViewModel
import br.com.tatame.feature.notifications.NotificationsPersona
import br.com.tatame.feature.notifications.NotificationsScreen
import br.com.tatame.feature.store.pedidos.MeusPedidosScreen
import br.com.tatame.feature.store.vitrine.StoreFlowScreen
import com.tatame.designsystem.tokens.LumiraTokens
import org.koin.androidx.compose.koinViewModel

/**
 * Professor "Início" tab (ATT.20/21, professor-02): alunos hoje + presença
 * média + eventos futuros tiles (EVT.13 retires the Phase-4 placeholder),
 * next-class hero with check-in count and "Iniciar chamada" opening the live
 * sheet, and the read-only "Eventos futuros" list (date square, name,
 * "N confirmados · gratuito/R$ X" — no professor event route, spec 008).
 * The dashboard refreshes when the chamada sheet closes so hero counts stay
 * honest.
 */
@Composable
fun ProfessorHomeTab(
    firstName: String,
    onVerTurmas: () -> Unit,
    modifier: Modifier = Modifier,
    academyName: String? = null,
    viewModel: ProfessorDashboardViewModel = koinViewModel(),
    bellViewModel: NotificationsBellViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val unreadCount by bellViewModel.unreadCount.collectAsState()
    var chamadaFor by remember { mutableStateOf<Pair<String, String>?>(null) } // classId to name
    var calendarOpen by rememberSaveable { mutableStateOf(false) }
    var notificacoesOpen by rememberSaveable { mutableStateOf(false) }
    var pedidosOpen by rememberSaveable { mutableStateOf(false) }
    var storeOpen by rememberSaveable { mutableStateOf(false) }

    // NOT.11 — the header bell pushes the shared Notificações screen; the
    // professor map only navigates the storefront hints (no wallet/event/
    // graduation surface in this shell — spec 006/008), the rest are inert.
    if (notificacoesOpen) {
        NotificationsScreen(
            persona = NotificationsPersona.PROFESSOR,
            onBack = {
                notificacoesOpen = false
                bellViewModel.refresh()
            },
            onNavigate = { destination ->
                notificacoesOpen = false
                bellViewModel.refresh()
                when (destination) {
                    is NotificationDestination.MeusPedidos -> pedidosOpen = true
                    is NotificationDestination.Loja -> storeOpen = true
                    else -> Unit // never emitted by the PROFESSOR route map
                }
            },
            modifier = modifier,
        )
        return
    }

    if (pedidosOpen) {
        MeusPedidosScreen(onBack = { pedidosOpen = false }, modifier = modifier)
        return
    }

    if (storeOpen) {
        StoreFlowScreen(
            academyName = academyName,
            onBack = { storeOpen = false },
            modifier = modifier,
        )
        return
    }

    // AGD.8 — the header calendar icon pushes the professor month view.
    if (calendarOpen) {
        ProfessorCalendarScreen(onBack = { calendarOpen = false }, modifier = modifier)
        return
    }

    Column(modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        Spacer(Modifier.height(LumiraTokens.Space.S6))
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S2),
        ) {
            Text(
                text = stringResource(R.string.dashboard_greeting, firstName),
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.onBackground,
                modifier = Modifier.weight(1f),
            )
            // NOT.11 — the professor header bell with the pink unread dot.
            NotificationsBellBubble(
                unreadCount = unreadCount,
                onClick = { notificacoesOpen = true },
            )
            CalendarBubble(onClick = { calendarOpen = true })
        }
        Spacer(Modifier.height(LumiraTokens.Space.S4))

        when (val dashboard = state) {
            is DashboardState.Loading -> Box(
                modifier = Modifier.fillMaxWidth().padding(vertical = LumiraTokens.Space.S8),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
            }

            is DashboardState.Error ->
                EnrollmentErrorState(messageRes = dashboard.messageRes, onRetry = viewModel::refresh)

            is DashboardState.Loaded -> DashboardContent(
                dashboard = dashboard.dashboard,
                onStartChamada = { classId, className -> chamadaFor = classId to className },
                onVerTurmas = onVerTurmas,
            )
        }
        Spacer(Modifier.height(LumiraTokens.Space.S8))
    }

    chamadaFor?.let { (classId, className) ->
        LiveChamadaSheet(
            classId = classId,
            className = className,
            onDismiss = {
                chamadaFor = null
                viewModel.refresh()
            },
        )
    }
}

/** Header calendar entry point (AGD.8, professor-02 header icon). */
@Composable
private fun CalendarBubble(onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(LumiraTokens.Space.S8)
            .background(color = LumiraTokens.Colors.Gray100, shape = PillShape)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = "▤",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurface,
        )
    }
}

@Composable
private fun DashboardContent(
    dashboard: ProfessorDashboardResponse,
    onStartChamada: (classId: String, className: String) -> Unit,
    onVerTurmas: () -> Unit,
) {
    // Stat tiles (professor-02): all three are real now — eventos futuros
    // carries the upcoming-events count (EVT.13, spec 008).
    Row(horizontalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S2)) {
        DashboardTile(
            value = "${dashboard.alunosHoje}",
            label = stringResource(R.string.dashboard_stat_students_today),
            modifier = Modifier.weight(1f),
        )
        DashboardTile(
            value = "${dashboard.presencaMediaPct.toInt()}%",
            label = stringResource(R.string.dashboard_stat_avg_presence),
            modifier = Modifier.weight(1f),
        )
        DashboardTile(
            value = "${dashboard.upcomingEventsCount}",
            label = stringResource(R.string.dashboard_stat_events_label),
            modifier = Modifier.weight(1f),
        )
    }
    Spacer(Modifier.height(LumiraTokens.Space.S4))

    NextClassHero(dashboard = dashboard, onStartChamada = onStartChamada, onVerTurmas = onVerTurmas)

    if (dashboard.todayClasses.isNotEmpty()) {
        Spacer(Modifier.height(LumiraTokens.Space.S5))
        Text(
            text = stringResource(R.string.dashboard_today_classes_title),
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Spacer(Modifier.height(LumiraTokens.Space.S3))
        Column(verticalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S2)) {
            dashboard.todayClasses.forEach { turma ->
                TodayClassRow(turma = turma, onStartChamada = onStartChamada)
            }
        }
    }

    // "Eventos futuros" — read-only program view (EVT.13, professor-02).
    if (dashboard.upcomingEvents.isNotEmpty()) {
        Spacer(Modifier.height(LumiraTokens.Space.S5))
        Text(
            text = stringResource(R.string.dashboard_events_list_title),
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Spacer(Modifier.height(LumiraTokens.Space.S3))
        Column(verticalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S2)) {
            dashboard.upcomingEvents.forEach { event ->
                EventListCard(
                    name = event.name,
                    date = event.date,
                    subtitle = EventFormat.confirmadosLine(
                        confirmedCount = event.confirmedCount,
                        priceCents = event.priceCents,
                    ),
                )
            }
        }
    }
}

@Composable
private fun NextClassHero(
    dashboard: ProfessorDashboardResponse,
    onStartChamada: (String, String) -> Unit,
    onVerTurmas: () -> Unit,
) {
    val next = dashboard.nextClass
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
            if (next == null) {
                Text(
                    text = stringResource(R.string.dashboard_no_class),
                    style = MaterialTheme.typography.bodyMedium,
                    color = LumiraTokens.Colors.FgOnColor,
                )
                return@Column
            }
            Box(
                modifier = Modifier
                    .background(color = LumiraTokens.Colors.Purple600, shape = PillShape)
                    .padding(horizontal = LumiraTokens.Space.S3, vertical = LumiraTokens.Space.S1),
            ) {
                Text(
                    text = stringResource(R.string.dashboard_hero_chip, next.slot.startTime),
                    style = MaterialTheme.typography.labelSmall,
                    color = LumiraTokens.Colors.FgOnColor,
                )
            }
            Spacer(Modifier.height(LumiraTokens.Space.S2))
            Text(
                text = next.className,
                style = MaterialTheme.typography.headlineMedium,
                color = LumiraTokens.Colors.FgOnColor,
            )
            Spacer(Modifier.height(LumiraTokens.Space.S1))
            Text(
                text = stringResource(R.string.dashboard_hero_confirmed, next.checkedInCount),
                style = MaterialTheme.typography.bodySmall,
                color = LumiraTokens.Colors.Purple100,
            )
            Spacer(Modifier.height(LumiraTokens.Space.S3))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Button(
                    onClick = { onStartChamada(next.classId, next.className) },
                    shape = PillShape,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = LumiraTokens.Colors.White,
                        contentColor = LumiraTokens.Colors.Purple700,
                    ),
                ) {
                    Text(
                        text = stringResource(R.string.dashboard_hero_start_chamada),
                        style = MaterialTheme.typography.labelSmall,
                    )
                }
                Spacer(Modifier.size(LumiraTokens.Space.S2))
                TextButton(onClick = onVerTurmas) {
                    Text(
                        text = stringResource(R.string.dashboard_hero_view_turmas),
                        style = MaterialTheme.typography.labelSmall,
                        color = LumiraTokens.Colors.Purple100,
                    )
                }
            }
        }
    }
}

@Composable
private fun DashboardTile(
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
private fun TodayClassRow(
    turma: ProfessorTodayClass,
    onStartChamada: (String, String) -> Unit,
) {
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
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = turma.className,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = stringResource(
                        R.string.dashboard_today_checked,
                        turma.checkedInCount,
                        turma.enrolledCount,
                    ),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            TextButton(onClick = { onStartChamada(turma.classId, turma.className) }) {
                Text(
                    text = stringResource(R.string.dashboard_hero_start_chamada),
                    style = MaterialTheme.typography.labelSmall,
                    color = LumiraTokens.Colors.Purple700,
                )
            }
        }
    }
}
