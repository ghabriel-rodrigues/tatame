package br.com.tatame.core.network

import br.com.tatame.core.network.dto.RankingResponse
import retrofit2.http.GET
import retrofit2.http.Query

/**
 * Hand-written thin Retrofit interface over the rankings surface (spec 013,
 * REP.14) — same fallback convention as [AuthApi]/[GraduationApi] (rationale
 * in app/build.gradle.kts `generateApiClient`). Student + professor roles;
 * `month` defaults server-side to the current tenant-timezone month.
 */
interface RankingsApi {

    @GET("v1/rankings")
    suspend fun ranking(
        @Query("by") by: String, // lessons | events
        @Query("month") month: String? = null, // "2026-08"
    ): RankingResponse
}
