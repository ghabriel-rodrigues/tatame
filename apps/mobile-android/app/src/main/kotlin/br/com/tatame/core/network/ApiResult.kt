package br.com.tatame.core.network

import java.io.IOException
import java.net.SocketTimeoutException
import kotlinx.serialization.json.Json
import retrofit2.HttpException

/** Normalized outcome of an API call (ticket mobile-android/02). */
sealed interface ApiResult<out T> {
    data class Success<T>(val value: T) : ApiResult<T>
    data class Failure(val error: ApiError) : ApiResult<Nothing>
}

inline fun <T, R> ApiResult<T>.map(transform: (T) -> R): ApiResult<R> = when (this) {
    is ApiResult.Success -> ApiResult.Success(transform(value))
    is ApiResult.Failure -> this
}

fun <T> ApiResult<T>.errorOrNull(): ApiError? = (this as? ApiResult.Failure)?.error

/**
 * Wraps a Retrofit suspend call, normalizing transport and problem+json
 * failures into [ApiError]. Retrofit suspend functions throw [HttpException]
 * on non-2xx; problem bodies are parsed leniently and unknown codes fall
 * through to status-based buckets, never crash.
 */
suspend fun <T> apiCall(json: Json = ProblemJson, block: suspend () -> T): ApiResult<T> = try {
    ApiResult.Success(block())
} catch (e: HttpException) {
    ApiResult.Failure(mapHttpError(e.code(), e.response()?.errorBody()?.string(), json))
} catch (e: SocketTimeoutException) {
    ApiResult.Failure(ApiError.Timeout)
} catch (e: IOException) {
    ApiResult.Failure(ApiError.Network)
}

/** Lenient parser for problem+json bodies (also the shared client Json config). */
val ProblemJson: Json = Json {
    ignoreUnknownKeys = true
    coerceInputValues = true
    explicitNulls = false
}

fun mapHttpError(status: Int, rawBody: String?, json: Json = ProblemJson): ApiError {
    val problem = rawBody
        ?.takeIf { it.isNotBlank() }
        ?.let { runCatching { json.decodeFromString<ProblemDetails>(it) }.getOrNull() }
    return mapProblem(status, problem)
}

fun mapProblem(status: Int, problem: ProblemDetails?): ApiError = when (problem?.code) {
    ApiErrorCodes.AUTH_INVALID_CREDENTIALS -> ApiError.Auth.InvalidCredentials
    ApiErrorCodes.AUTH_UNAUTHENTICATED,
    ApiErrorCodes.AUTH_TOKEN_EXPIRED,
    ApiErrorCodes.AUTH_REFRESH_REUSED,
    -> ApiError.Auth.SessionExpired
    ApiErrorCodes.AUTH_MFA_REQUIRED, ApiErrorCodes.AUTH_MFA_INVALID_CODE -> ApiError.Auth.MfaRequired
    ApiErrorCodes.AUTHZ_FORBIDDEN_ROLE,
    ApiErrorCodes.AUTHZ_IMPERSONATION_RESTRICTED,
    -> ApiError.Auth.Forbidden
    ApiErrorCodes.AUTHZ_PERMISSION_DISABLED -> ApiError.Auth.PermissionDisabled
    ApiErrorCodes.TENANT_SUSPENDED -> ApiError.Tenant.AcademySuspended
    ApiErrorCodes.TENANT_READ_ONLY -> ApiError.Tenant.ReadOnly
    ApiErrorCodes.VALIDATION_FAILED -> ApiError.Validation(
        problem.errors.orEmpty().associate { it.field to it.messages },
    )
    ApiErrorCodes.NOT_FOUND -> ApiError.NotFound
    ApiErrorCodes.CONFLICT -> ApiError.Conflict
    else -> when {
        status == 401 -> ApiError.Auth.SessionExpired
        status == 403 -> ApiError.Auth.Forbidden
        status == 404 -> ApiError.NotFound
        status == 409 -> ApiError.Conflict
        status == 422 -> ApiError.Validation(emptyMap())
        status >= 500 -> ApiError.Server(status)
        else -> ApiError.Unknown(status, problem?.code)
    }
}
