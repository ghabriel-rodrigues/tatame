package br.com.tatame.feature.attendance.professor

import androidx.compose.foundation.background
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.res.stringResource
import br.com.tatame.R
import br.com.tatame.core.designsystem.theme.PillShape
import br.com.tatame.core.network.dto.ProfessorDashboardResponse
import br.com.tatame.core.network.dto.ProfessorTodayClass
import br.com.tatame.feature.enrollment.EnrollmentErrorState
import com.tatame.designsystem.tokens.LumiraTokens
import org.koin.androidx.compose.koinViewModel

/**
 * Professor "Início" tab (ATT.20/21, professor-02): alunos hoje + presença
 * média tiles (eventos stays an explicit placeholder), next-class hero with
 * check-in count and "Iniciar chamada" opening the live sheet. The dashboard
 * refreshes when the chamada sheet closes so hero counts stay honest.
 */
@Composable
fun ProfessorHomeTab(
    firstName: String,
    onVerTurmas: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: ProfessorDashboardViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    var chamadaFor by remember { mutableStateOf<Pair<String, String>?>(null) } // classId to name

    Column(modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        Spacer(Modifier.height(LumiraTokens.Space.S6))
        Text(
            text = stringResource(R.string.dashboard_greeting, firstName),
            style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.onBackground,
        )
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

@Composable
private fun DashboardContent(
    dashboard: ProfessorDashboardResponse,
    onStartChamada: (classId: String, className: String) -> Unit,
    onVerTurmas: () -> Unit,
) {
    // Stat tiles (professor-02): alunos hoje + presença média are real;
    // eventos futuros is the explicit placeholder owned by the events slice.
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
            value = "—",
            label = stringResource(R.string.dashboard_stat_events_label),
            caption = stringResource(R.string.dashboard_stat_events_placeholder),
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
