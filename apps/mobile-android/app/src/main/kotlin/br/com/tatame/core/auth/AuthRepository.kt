package br.com.tatame.core.auth

import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.AuthApi
import br.com.tatame.core.network.ProblemJson
import br.com.tatame.core.network.apiCall
import br.com.tatame.core.network.dto.AuthSessionResponse
import br.com.tatame.core.network.dto.LoginRequest
import br.com.tatame.core.network.dto.MeResponse
import br.com.tatame.core.network.dto.MfaChallengeResponse
import br.com.tatame.core.network.dto.RefreshRequest
import br.com.tatame.core.network.dto.SwitchMembershipRequest
import br.com.tatame.core.network.dto.SwitchMembershipResponse
import br.com.tatame.core.network.dto.TokenPairResponse
import kotlinx.serialization.json.Json
import retrofit2.HttpException

/** Outcome of POST /v1/auth/login — 200 session or 202 platform-MFA challenge. */
sealed interface LoginOutcome {
    data class Session(val session: AuthSessionResponse) : LoginOutcome
    data class MfaRequired(val challenge: MfaChallengeResponse) : LoginOutcome
}

/** Seam the session layer talks through (fakeable in JVM tests). */
interface AuthRepository {
    suspend fun login(email: String, password: String): ApiResult<LoginOutcome>
    suspend fun refresh(refreshToken: String): ApiResult<TokenPairResponse>
    suspend fun switchMembership(membershipId: String): ApiResult<SwitchMembershipResponse>
    suspend fun me(): ApiResult<MeResponse>
    suspend fun logout(): ApiResult<Unit>
    suspend fun logoutAll(): ApiResult<Unit>
}

class AuthRepositoryImpl(
    private val api: AuthApi,
    private val json: Json = ProblemJson,
) : AuthRepository {

    override suspend fun login(email: String, password: String): ApiResult<LoginOutcome> = apiCall(json) {
        val response = api.login(LoginRequest(email = email, password = password, transport = "body"))
        val body = response.body()
        when {
            response.code() == 200 && body != null ->
                LoginOutcome.Session(json.decodeFromJsonElement(AuthSessionResponse.serializer(), body))
            response.code() == 202 && body != null ->
                LoginOutcome.MfaRequired(json.decodeFromJsonElement(MfaChallengeResponse.serializer(), body))
            else -> throw HttpException(response)
        }
    }

    override suspend fun refresh(refreshToken: String): ApiResult<TokenPairResponse> = apiCall(json) {
        api.refresh(RefreshRequest(refreshToken = refreshToken, transport = "body"))
    }

    override suspend fun switchMembership(membershipId: String): ApiResult<SwitchMembershipResponse> =
        apiCall(json) { api.switchMembership(SwitchMembershipRequest(membershipId)) }

    override suspend fun me(): ApiResult<MeResponse> = apiCall(json) { api.me() }

    override suspend fun logout(): ApiResult<Unit> = apiCall(json) {
        val response = api.logout()
        if (!response.isSuccessful) throw HttpException(response)
    }

    override suspend fun logoutAll(): ApiResult<Unit> = apiCall(json) {
        val response = api.logoutAll()
        if (!response.isSuccessful) throw HttpException(response)
    }
}
