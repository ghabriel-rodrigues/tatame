package br.com.tatame.core.network

import br.com.tatame.core.network.dto.AlunoProfileResponse
import kotlinx.serialization.json.JsonObject
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PUT

/**
 * Hand-written thin Retrofit interface over the aluno profile surface
 * (spec 013, REP.13) — same fallback convention as [AuthApi]/[GraduationApi]
 * (rationale in app/build.gradle.kts `generateApiClient`).
 *
 * The PUT body is a partial update where "absent" means unchanged and an
 * explicit `null` clears a nullable field — the shared Json drops nulls
 * (`explicitNulls = false`), so the repository builds a [JsonObject] with
 * explicit nulls instead of a data-class DTO (documented deviation).
 */
interface ProfileApi {

    @GET("v1/aluno/profile")
    suspend fun profile(): AlunoProfileResponse

    @PUT("v1/aluno/profile")
    suspend fun update(@Body body: JsonObject): AlunoProfileResponse
}
