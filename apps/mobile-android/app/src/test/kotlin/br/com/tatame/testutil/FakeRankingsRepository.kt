package br.com.tatame.testutil

import br.com.tatame.core.network.ApiError
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.dto.RankingBys
import br.com.tatame.core.network.dto.RankingMe
import br.com.tatame.core.network.dto.RankingResponse
import br.com.tatame.core.network.dto.RankingRow
import br.com.tatame.core.network.dto.ReportWindow
import br.com.tatame.core.rankings.RankingsRepository

/** Configurable in-memory [RankingsRepository] for ViewModel tests. */
class FakeRankingsRepository : RankingsRepository {

    var lessonsResult: ApiResult<RankingResponse> = ApiResult.Failure(ApiError.Network)
    var eventsResult: ApiResult<RankingResponse> = ApiResult.Failure(ApiError.Network)

    val rankingCalls = mutableListOf<Pair<String, String?>>() // by to month

    override suspend fun ranking(by: String, month: String?): ApiResult<RankingResponse> {
        rankingCalls += by to month
        return if (by == RankingBys.EVENTS) eventsResult else lessonsResult
    }
}

// ---- fixture builders ----------------------------------------------------

fun rankingRow(
    position: Int,
    name: String = "Aluno $position",
    count: Int = 20 - position,
    isMe: Boolean = false,
) = RankingRow(position = position, name = name, count = count, isMe = isMe)

fun rankingResponse(
    by: String = RankingBys.LESSONS,
    windowLabel: String = "2026-08",
    top: List<RankingRow> = listOf(
        rankingRow(1, "Marina Costa", 17),
        rankingRow(2, "Lucas Almeida", 14, isMe = true),
        rankingRow(3, "Júlia Silveira", 13),
    ),
    me: RankingMe? = RankingMe(position = 2, count = 14),
    totalRanked: Int = 24,
) = RankingResponse(
    by = by,
    window = ReportWindow(
        label = windowLabel,
        start = "2026-08-01",
        endExclusive = "2026-09-01",
    ),
    top = top,
    me = me,
    totalRanked = totalRanked,
)
