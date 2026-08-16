package br.com.tatame.core.rankings

import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.ProblemJson
import br.com.tatame.core.network.RankingsApi
import br.com.tatame.core.network.apiCall
import br.com.tatame.core.network.dto.RankingResponse
import kotlinx.serialization.json.Json

/**
 * Seam the ranking ViewModel talks through (fakeable in JVM tests) — same
 * convention as [br.com.tatame.core.graduation.GraduationRepository].
 */
interface RankingsRepository {
    /** [by] is `lessons` (month) or `events` (semester); null month = current. */
    suspend fun ranking(by: String, month: String? = null): ApiResult<RankingResponse>
}

class RankingsRepositoryImpl(
    private val api: RankingsApi,
    private val json: Json = ProblemJson,
) : RankingsRepository {

    override suspend fun ranking(by: String, month: String?): ApiResult<RankingResponse> =
        apiCall(json) { api.ranking(by = by, month = month) }
}
