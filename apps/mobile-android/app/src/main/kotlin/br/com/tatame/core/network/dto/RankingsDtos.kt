// Hand-written mirror of the rankings surface of packages/shared/src/api/openapi.json
// (fallback per ticket mobile-android/02 — see app/build.gradle.kts `generateApiClient`).
// Field names MUST stay 1:1 with the spec; regenerate-by-hand on contract changes.

package br.com.tatame.core.network.dto

import kotlinx.serialization.Serializable

/** `by` query values of GET /v1/rankings (spec 013, REP.5/REP.14). */
object RankingBys {
    const val LESSONS = "lessons"
    const val EVENTS = "events"
}

/** `ReportWindowDto` — `label` is `YYYY-MM` for months, `YYYY-S1`/`YYYY-S2` for semesters. */
@Serializable
data class ReportWindow(
    val label: String,
    val start: String, // inclusive tenant-local first day
    val endExclusive: String, // exclusive tenant-local end day
)

/** `RankingRowDto` — 1-based position after count-desc, name-asc sort. */
@Serializable
data class RankingRow(
    val position: Int,
    val name: String,
    val count: Int, // aulas no mês / eventos no semestre
    val isMe: Boolean, // the requesting student's own row ("você" chip)
)

/** `RankingMeDto` — the requester's own position/count (aluno only). */
@Serializable
data class RankingMe(
    val position: Int,
    val count: Int,
)

/** `RankingResponseDto` — top 10 + `me` (always null for professors). */
@Serializable
data class RankingResponse(
    val by: String, // lessons | events
    val window: ReportWindow,
    val top: List<RankingRow>,
    val me: RankingMe? = null,
    val totalRanked: Int, // active students ranked (zero counts included)
)
