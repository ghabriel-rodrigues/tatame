package br.com.tatame.feature.rankings

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import br.com.tatame.R
import br.com.tatame.core.designsystem.theme.PillShape
import br.com.tatame.core.network.dto.RankingBys
import br.com.tatame.core.network.dto.RankingMe
import br.com.tatame.core.network.dto.RankingResponse
import br.com.tatame.core.network.dto.RankingRow
import br.com.tatame.feature.enrollment.EnrollmentErrorState
import com.tatame.designsystem.tokens.LumiraTokens
import org.koin.androidx.compose.koinViewModel

/** The two ranking personas — same screen, different header/footnote copy. */
enum class RankingPersona { ALUNO, PROFESSOR }

/**
 * Shared full ranking screen (REP.14, aluno-06/07 · professor-05/06): back
 * header with the dynamic subtitle, Por aulas / Por eventos segmented control,
 * position circles (leader filled), gradient bars scaled to the leader,
 * "você" chip + outlined row for the aluno's own row, the below-the-cut own
 * row when outside the top 10, and the selos footnote — per-segment copy on
 * the professor side (the prototype's professor-06 footnote repeats the aulas
 * copy on the eventos segment; recorded as a prototype bug, not reproduced).
 */
@Composable
fun RankingScreen(
    persona: RankingPersona,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    academyName: String? = null,
    viewModel: RankingViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val segmentState = when (state.segment) {
        RankingSegment.LESSONS -> state.lessons
        RankingSegment.EVENTS -> state.events ?: RankingSegmentState.Loading
    }

    Column(modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        Spacer(Modifier.height(LumiraTokens.Space.S6))
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S3),
        ) {
            RankingBackBubble(onBack = onBack)
            Column {
                Text(
                    text = stringResource(
                        when (persona) {
                            RankingPersona.ALUNO -> R.string.ranking_title_aluno
                            RankingPersona.PROFESSOR -> R.string.ranking_title_professor
                        },
                    ),
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onBackground,
                )
                Text(
                    text = subtitle(state.segment, segmentState, academyName),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Spacer(Modifier.height(LumiraTokens.Space.S4))

        RankingSegmentedControl(selected = state.segment, onSelect = viewModel::selectSegment)
        Spacer(Modifier.height(LumiraTokens.Space.S4))

        when (segmentState) {
            is RankingSegmentState.Loading -> Box(
                modifier = Modifier.fillMaxWidth().padding(vertical = LumiraTokens.Space.S8),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
            }
            is RankingSegmentState.Error -> EnrollmentErrorState(
                messageRes = segmentState.messageRes,
                onRetry = viewModel::refresh,
            )
            is RankingSegmentState.Loaded -> RankingContent(
                persona = persona,
                segment = state.segment,
                ranking = segmentState.ranking,
            )
        }
        Spacer(Modifier.height(LumiraTokens.Space.S8))
    }
}

@Composable
private fun subtitle(
    segment: RankingSegment,
    state: RankingSegmentState,
    academyName: String?,
): String = when (segment) {
    RankingSegment.EVENTS -> stringResource(R.string.ranking_subtitle_events)
    RankingSegment.LESSONS -> {
        val label = (state as? RankingSegmentState.Loaded)?.ranking?.window?.label
        stringResource(
            R.string.ranking_subtitle_month,
            label?.let(RankingFormat::monthName) ?: "",
            academyName ?: stringResource(R.string.ranking_academy_fallback),
        ).trim(' ', '·')
    }
}

@Composable
private fun RankingContent(
    persona: RankingPersona,
    segment: RankingSegment,
    ranking: RankingResponse,
) {
    val leaderCount = ranking.top.firstOrNull()?.count ?: 0

    when (persona) {
        // Aluno (aluno-06/07): one card per row, own row outlined + chip.
        RankingPersona.ALUNO -> Column(
            verticalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S2),
        ) {
            ranking.top.forEach { row ->
                Surface(
                    shape = RoundedCornerShape(LumiraTokens.Radius.Md),
                    color = MaterialTheme.colorScheme.surface,
                    modifier = Modifier
                        .fillMaxWidth()
                        .then(
                            if (row.isMe) {
                                Modifier.border(
                                    width = 1.dp,
                                    color = LumiraTokens.Colors.Purple500,
                                    shape = RoundedCornerShape(LumiraTokens.Radius.Md),
                                )
                            } else {
                                Modifier
                            },
                        ),
                ) {
                    RankingRowItem(
                        row = row,
                        by = ranking.by,
                        leaderCount = leaderCount,
                        showVoceChip = row.isMe,
                    )
                }
            }
            // Outside the top 10 the ranking never hides the aluno (story 16).
            if (ranking.me != null && ranking.top.none { it.isMe }) {
                MeBelowCutRow(me = ranking.me, by = ranking.by, leaderCount = leaderCount)
            }
        }

        // Professor (professor-05/06): one grouped card with hairline dividers.
        RankingPersona.PROFESSOR -> Surface(
            shape = RoundedCornerShape(LumiraTokens.Radius.Md),
            color = MaterialTheme.colorScheme.surface,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column {
                ranking.top.forEachIndexed { index, row ->
                    if (index > 0) {
                        HorizontalDivider(
                            thickness = 1.dp,
                            color = MaterialTheme.colorScheme.surfaceVariant,
                        )
                    }
                    RankingRowItem(
                        row = row,
                        by = ranking.by,
                        leaderCount = leaderCount,
                        showVoceChip = false,
                    )
                }
            }
        }
    }

    Spacer(Modifier.height(LumiraTokens.Space.S4))
    SelosFootnote(persona = persona, segment = segment)
}

/** The aluno's own row when it fell below the top-10 cut. */
@Composable
private fun MeBelowCutRow(me: RankingMe, by: String, leaderCount: Int) {
    Surface(
        shape = RoundedCornerShape(LumiraTokens.Radius.Md),
        color = MaterialTheme.colorScheme.surface,
        modifier = Modifier
            .fillMaxWidth()
            .border(
                width = 1.dp,
                color = LumiraTokens.Colors.Purple500,
                shape = RoundedCornerShape(LumiraTokens.Radius.Md),
            ),
    ) {
        RankingRowItem(
            row = RankingRow(
                position = me.position,
                name = stringResource(R.string.ranking_me_row_name),
                count = me.count,
                isMe = true,
            ),
            by = by,
            leaderCount = leaderCount,
            showVoceChip = true,
        )
    }
}

@Composable
private fun RankingRowItem(
    row: RankingRow,
    by: String,
    leaderCount: Int,
    showVoceChip: Boolean,
) {
    Row(
        modifier = Modifier.padding(
            horizontal = LumiraTokens.Space.S3,
            vertical = LumiraTokens.Space.S2,
        ),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S3),
    ) {
        PositionCircle(position = row.position)
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = row.name,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                if (showVoceChip) {
                    Spacer(Modifier.width(LumiraTokens.Space.S2))
                    VoceChip()
                }
            }
            Spacer(Modifier.height(LumiraTokens.Space.S1))
            GradientBar(fraction = RankingFormat.barFraction(row.count, leaderCount))
        }
        Text(
            text = RankingFormat.countLabel(by, row.count),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/** Position circle — the leader renders filled, the rest tonal. */
@Composable
private fun PositionCircle(position: Int) {
    val leader = position == 1
    Box(
        modifier = Modifier
            .size(LumiraTokens.Space.S6)
            .background(
                color = if (leader) LumiraTokens.Colors.Purple700 else LumiraTokens.Colors.Gray100,
                shape = PillShape,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = "$position",
            style = MaterialTheme.typography.labelSmall,
            color = if (leader) LumiraTokens.Colors.FgOnColor else LumiraTokens.Colors.Fg2,
        )
    }
}

/** Purple→pink gradient bar scaled to the leader (aluno-06 anatomy). */
@Composable
private fun GradientBar(fraction: Float, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(LumiraTokens.Space.S1)
            .background(
                color = MaterialTheme.colorScheme.surfaceVariant,
                shape = PillShape,
            ),
    ) {
        if (fraction > 0f) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(fraction)
                    .fillMaxHeight()
                    .background(
                        brush = Brush.horizontalGradient(
                            colors = listOf(
                                LumiraTokens.Colors.Purple600,
                                LumiraTokens.Colors.Pink500,
                            ),
                        ),
                        shape = PillShape,
                    ),
            )
        }
    }
}

@Composable
private fun VoceChip() {
    Box(
        modifier = Modifier
            .background(color = LumiraTokens.Colors.Purple100, shape = PillShape)
            .padding(horizontal = LumiraTokens.Space.S2, vertical = 2.dp),
    ) {
        Text(
            text = stringResource(R.string.ranking_voce_chip),
            style = MaterialTheme.typography.labelSmall,
            color = LumiraTokens.Colors.Purple700,
        )
    }
}

@Composable
private fun RankingSegmentedControl(
    selected: RankingSegment,
    onSelect: (RankingSegment) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(color = LumiraTokens.Colors.BgSunken, shape = PillShape)
            .padding(LumiraTokens.Space.S1),
        horizontalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S1),
    ) {
        SegmentPill(
            label = stringResource(R.string.ranking_segment_aulas),
            selected = selected == RankingSegment.LESSONS,
            onClick = { onSelect(RankingSegment.LESSONS) },
            modifier = Modifier.weight(1f),
        )
        SegmentPill(
            label = stringResource(R.string.ranking_segment_eventos),
            selected = selected == RankingSegment.EVENTS,
            onClick = { onSelect(RankingSegment.EVENTS) },
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun SegmentPill(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .background(
                color = if (selected) MaterialTheme.colorScheme.surface else LumiraTokens.Colors.BgSunken,
                shape = PillShape,
            )
            .clickable(onClick = onClick)
            .padding(vertical = LumiraTokens.Space.S2),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = if (selected) LumiraTokens.Colors.Purple700 else LumiraTokens.Colors.Fg3,
        )
    }
}

/**
 * Static selos footnote (badge computation is out of scope): the aluno copy
 * names both selos on both segments (aluno-06/07); the professor copy is
 * per-segment — Constância on aulas, Espírito de equipe on eventos.
 */
@Composable
private fun SelosFootnote(persona: RankingPersona, segment: RankingSegment) {
    val text = stringResource(
        when (persona) {
            RankingPersona.ALUNO -> R.string.ranking_footnote_aluno
            RankingPersona.PROFESSOR -> when (segment) {
                RankingSegment.LESSONS -> R.string.ranking_footnote_professor_lessons
                RankingSegment.EVENTS -> R.string.ranking_footnote_professor_events
            }
        },
    )
    val seloConstancia = stringResource(R.string.ranking_selo_constancia)
    val seloEquipe = stringResource(R.string.ranking_selo_equipe)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                color = LumiraTokens.Colors.Purple50,
                shape = RoundedCornerShape(LumiraTokens.Radius.Md),
            )
            .padding(LumiraTokens.Space.S3),
    ) {
        Text(
            text = highlightSelos(text, listOf(seloConstancia, seloEquipe)),
            style = MaterialTheme.typography.labelSmall,
            color = LumiraTokens.Colors.Fg2,
        )
    }
}

/** Bold+pink span over each selo name found in the footnote copy. */
private fun highlightSelos(text: String, terms: List<String>) = buildAnnotatedString {
    append(text)
    terms.forEach { term ->
        val start = text.indexOf(term)
        if (start >= 0) {
            addStyle(
                style = SpanStyle(
                    color = LumiraTokens.Colors.Pink600,
                    fontWeight = FontWeight.SemiBold,
                ),
                start = start,
                end = start + term.length,
            )
        }
    }
}

// ---- entry points (home card + dashboard section) --------------------------

/**
 * Aluno home "Ranking do mês" entry card (REP.14): pink bar-chart icon +
 * live position line from the endpoint's `me`. Hidden while loading/failed
 * or when `me` is absent — an entry card never renders placeholder numbers.
 */
@Composable
fun RankingHomeCard(
    onOpen: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: RankingViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val me = (state.lessons as? RankingSegmentState.Loaded)?.ranking?.me ?: return

    Spacer(Modifier.height(LumiraTokens.Space.S3))
    Surface(
        shape = RoundedCornerShape(LumiraTokens.Radius.Lg),
        color = MaterialTheme.colorScheme.surface,
        modifier = modifier.fillMaxWidth().clickable(onClick = onOpen),
    ) {
        Row(
            modifier = Modifier.padding(LumiraTokens.Space.S3),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(LumiraTokens.Space.S10)
                    .background(
                        color = LumiraTokens.Colors.Pink100,
                        shape = RoundedCornerShape(LumiraTokens.Radius.Md),
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "▂▄▆",
                    style = MaterialTheme.typography.labelSmall,
                    color = LumiraTokens.Colors.Pink600,
                )
            }
            Spacer(Modifier.width(LumiraTokens.Space.S3))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = stringResource(R.string.ranking_home_title),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = stringResource(R.string.ranking_home_line, me.position),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.width(LumiraTokens.Space.S2))
            Text(
                text = "›",
                style = MaterialTheme.typography.titleMedium,
                color = LumiraTokens.Colors.Fg3,
            )
        }
    }
}

/**
 * Professor dashboard "Ranking de presença" section (REP.14) — the Phase-4
 * placeholder finally paid: real top 3 + "Ver todos" opening the full screen.
 * Hidden until the lessons ranking loads with at least one row.
 */
@Composable
fun RankingDashboardSection(
    onVerTodos: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: RankingViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val ranking = (state.lessons as? RankingSegmentState.Loaded)?.ranking ?: return
    if (ranking.top.isEmpty()) return
    val leaderCount = ranking.top.first().count

    Column(modifier = modifier) {
        Spacer(Modifier.height(LumiraTokens.Space.S5))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = stringResource(
                    R.string.ranking_dashboard_title,
                    RankingFormat.monthName(ranking.window.label),
                ),
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = stringResource(R.string.ranking_ver_todos),
                style = MaterialTheme.typography.labelSmall,
                color = LumiraTokens.Colors.Purple700,
                modifier = Modifier
                    .clickable(onClick = onVerTodos)
                    .padding(LumiraTokens.Space.S1),
            )
        }
        Spacer(Modifier.height(LumiraTokens.Space.S3))
        Surface(
            shape = RoundedCornerShape(LumiraTokens.Radius.Md),
            color = MaterialTheme.colorScheme.surface,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column {
                ranking.top.take(3).forEachIndexed { index, row ->
                    if (index > 0) {
                        HorizontalDivider(
                            thickness = 1.dp,
                            color = MaterialTheme.colorScheme.surfaceVariant,
                        )
                    }
                    RankingRowItem(
                        row = row,
                        by = ranking.by,
                        leaderCount = leaderCount,
                        showVoceChip = false,
                    )
                }
            }
        }
    }
}

@Composable
private fun RankingBackBubble(onBack: () -> Unit) {
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
