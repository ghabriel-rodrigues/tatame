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
    ApiErrorCodes.CLASS_FULL, ApiErrorCodes.CLASS_CAPACITY_EXCEEDED -> ApiError.Enrollment.ClassFull
    ApiErrorCodes.CLASS_ARCHIVED -> ApiError.Enrollment.ClassArchived
    ApiErrorCodes.ENROLLMENT_ALREADY_ENROLLED -> ApiError.Enrollment.AlreadyEnrolled
    ApiErrorCodes.CHECKIN_CODE_INVALID -> ApiError.Attendance.CodeInvalid
    ApiErrorCodes.CHECKIN_NOT_ENROLLED -> ApiError.Attendance.NotEnrolled
    ApiErrorCodes.CHECKIN_NO_SESSION_TODAY -> ApiError.Attendance.NoSessionToday
    ApiErrorCodes.CHECKIN_OUTSIDE_WINDOW -> ApiError.Attendance.OutsideWindow
    ApiErrorCodes.ATTENDANCE_REVOKE_WINDOW_CLOSED -> ApiError.Attendance.RevokeWindowClosed
    ApiErrorCodes.GRADUATION_DEGREE_AT_MAX -> ApiError.Graduation.DegreeAtMax
    ApiErrorCodes.GRADUATION_BELT_INVALID_TARGET -> ApiError.Graduation.BeltInvalidTarget
    ApiErrorCodes.GRADUATION_ALREADY_REVERSED -> ApiError.Graduation.AlreadyReversed
    ApiErrorCodes.GRADUATION_LESSONS_BELOW_MINIMUM -> ApiError.Graduation.LessonsBelowMinimum
    ApiErrorCodes.GRADUATION_CANNOT_DISABLE_NON_KIDS_BELT ->
        ApiError.Graduation.CannotDisableNonKidsBelt
    ApiErrorCodes.BILLING_CHARGE_NOT_PAYABLE -> ApiError.Billing.ChargeNotPayable
    ApiErrorCodes.BILLING_METHOD_MANDATE_MISMATCH -> ApiError.Billing.MethodMandateMismatch
    ApiErrorCodes.BILLING_MANDATE_ALREADY_ACTIVE -> ApiError.Billing.MandateAlreadyActive
    ApiErrorCodes.BILLING_REFUND_UNSETTLED -> ApiError.Billing.RefundUnsettled
    ApiErrorCodes.BILLING_SIMULATE_UNAVAILABLE -> ApiError.Billing.SimulateUnavailable
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
