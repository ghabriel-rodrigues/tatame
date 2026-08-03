package br.com.tatame.core.network

import br.com.tatame.core.network.dto.LoginRequest
import br.com.tatame.core.network.dto.MeResponse
import br.com.tatame.core.network.dto.RefreshRequest
import br.com.tatame.core.network.dto.SwitchMembershipRequest
import br.com.tatame.core.network.dto.SwitchMembershipResponse
import br.com.tatame.core.network.dto.TokenPairResponse
import kotlinx.serialization.json.JsonElement
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

/**
 * Hand-written thin Retrofit interface over the `/v1/auth` surface
 * (fallback per ticket mobile-android/02 — rationale in app/build.gradle.kts).
 *
 * `login` returns a raw [JsonElement] response because the endpoint has two
 * success shapes (200 AuthSessionResponseDto / 202 MfaChallengeResponseDto);
 * [br.com.tatame.core.auth.AuthRepositoryImpl] decodes on the status code.
 * `POST /v1/auth/login/totp` is intentionally absent: platform 2FA is
 * completed on the web console only (mobile shows the web-console screen).
 */
interface AuthApi {

    @POST("v1/auth/login")
    suspend fun login(@Body body: LoginRequest): Response<JsonElement>

    @POST("v1/auth/refresh")
    suspend fun refresh(@Body body: RefreshRequest): TokenPairResponse

    @POST("v1/auth/switch")
    suspend fun switchMembership(@Body body: SwitchMembershipRequest): SwitchMembershipResponse

    @POST("v1/auth/logout")
    suspend fun logout(): Response<Unit>

    @POST("v1/auth/logout-all")
    suspend fun logoutAll(): Response<Unit>

    @GET("v1/auth/me")
    suspend fun me(): MeResponse
}
