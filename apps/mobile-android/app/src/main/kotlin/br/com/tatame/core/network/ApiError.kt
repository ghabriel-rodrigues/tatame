package br.com.tatame.core.network

import kotlinx.serialization.Serializable

/**
 * RFC 9457 problem document as serialized by the API's global filter
 * (mirror of `packages/shared/src/api/errors.ts#ApiProblem`). Hand-written —
 * stable shape, deliberately not generated (ticket mobile-android/02).
 */
@Serializable
data class ProblemDetails(
    val type: String? = null,
    val title: String? = null,
    val status: Int = 0,
    val detail: String? = null,
    val instance: String? = null,
    val code: String? = null,
    val errors: List<FieldError>? = null,
) {
    @Serializable
    data class FieldError(val field: String, val messages: List<String>)
}

/** Stable machine codes (mirror of `packages/shared/src/api/errors.ts#ApiErrorCodes`). */
object ApiErrorCodes {
    const val AUTH_INVALID_CREDENTIALS = "auth.invalid_credentials"
    const val AUTH_UNAUTHENTICATED = "auth.unauthenticated"
    const val AUTH_TOKEN_EXPIRED = "auth.token_expired"
    const val AUTH_REFRESH_REUSED = "auth.refresh_reused"
    const val AUTH_MFA_REQUIRED = "auth.mfa_required"
    const val AUTH_MFA_INVALID_CODE = "auth.mfa_invalid_code"
    const val AUTHZ_FORBIDDEN_ROLE = "authz.forbidden_role"
    const val AUTHZ_PERMISSION_DISABLED = "authz.permission_disabled"
    const val AUTHZ_IMPERSONATION_RESTRICTED = "authz.impersonation_restricted"
    const val TENANT_SUSPENDED = "tenant.suspended"
    const val TENANT_READ_ONLY = "tenant.read_only"
    const val VALIDATION_FAILED = "validation.failed"
    const val NOT_FOUND = "resource.not_found"
    const val CONFLICT = "resource.conflict"
    const val INTERNAL = "internal.error"

    // Enrollment slice (spec 003) additions to the shared registry.
    const val CLASS_FULL = "class.full"
    const val CLASS_ARCHIVED = "class.archived"
    const val CLASS_CAPACITY_EXCEEDED = "class.capacity_exceeded"
    const val ENROLLMENT_ALREADY_ENROLLED = "enrollment.already_enrolled"

    // Attendance slice (spec 004) additions.
    const val CHECKIN_CODE_INVALID = "checkin.code_invalid"
    const val CHECKIN_NOT_ENROLLED = "checkin.not_enrolled"
    const val CHECKIN_NO_SESSION_TODAY = "checkin.no_session_today"
    const val CHECKIN_OUTSIDE_WINDOW = "checkin.outside_window"
    const val ATTENDANCE_REVOKE_WINDOW_CLOSED = "attendance.revoke_window_closed"
}

/**
 * Sealed error surface per ticket mobile-android/02 — clients branch on
 * `status` + stable `code`, never on human text. Extensions over the ticket's
 * base list (documented): [Auth.InvalidCredentials], [Auth.MfaRequired], and
 * [Auth.PermissionDisabled] carry codes the login/permission UX must
 * distinguish from the generic buckets.
 */
sealed interface ApiError {
    /** IOException — offline, DNS, connection reset. */
    data object Network : ApiError

    data object Timeout : ApiError

    sealed interface Auth : ApiError {
        /** `auth.invalid_credentials` — bad email/password (non-enumerable). */
        data object InvalidCredentials : Auth

        /** `auth.unauthenticated` / `auth.token_expired` / `auth.refresh_reused` — session is gone. */
        data object SessionExpired : Auth

        /** `auth.mfa_required` — platform 2FA (completed on the web console only). */
        data object MfaRequired : Auth

        /** `authz.forbidden_role` / `authz.impersonation_restricted` — RBAC denial. */
        data object Forbidden : Auth

        /** `authz.permission_disabled` — per-academy toggle off. */
        data object PermissionDisabled : Auth
    }

    sealed interface Tenant : ApiError {
        /** `tenant.suspended` — surfaces as session state (blocking screen). */
        data object AcademySuspended : Tenant

        /** `tenant.read_only` — delinquency; surfaces as session state (banner). */
        data object ReadOnly : Tenant
    }

    /** Enrollment-slice stable codes (spec 003) the roster/registration UX maps to PT-BR copy. */
    sealed interface Enrollment : ApiError {
        /** `class.full` / `class.capacity_exceeded` — capacity rule rejection. */
        data object ClassFull : Enrollment

        /** `class.archived` — enrolling into an archived class. */
        data object ClassArchived : Enrollment

        /** `enrollment.already_enrolled` — student already active in the class. */
        data object AlreadyEnrolled : Enrollment
    }

    /** Attendance-slice stable codes (spec 004) mapped to PT-BR copy by the check-in/chamada UX. */
    sealed interface Attendance : ApiError {
        /** `checkin.code_invalid` — wrong, expired, or revoked code/QR (foreign codes look identical). */
        data object CodeInvalid : Attendance

        /** `checkin.not_enrolled` — caller has no active enrollment in the session's class. */
        data object NotEnrolled : Attendance

        /** `checkin.no_session_today` — the class has no schedule slot today (manual method). */
        data object NoSessionToday : Attendance

        /** `checkin.outside_window` — manual check-in outside slot-30min … slot end + grace. */
        data object OutsideWindow : Attendance

        /** `attendance.revoke_window_closed` — professor revoke after day close (admin-only path). */
        data object RevokeWindowClosed : Attendance
    }

    /** 422 `validation.failed` with field-level errors. */
    data class Validation(val fieldErrors: Map<String, List<String>>) : ApiError

    data object NotFound : ApiError

    data object Conflict : ApiError

    data class Server(val status: Int) : ApiError

    /** Unmapped code/status — never crash on registry growth. */
    data class Unknown(val status: Int, val code: String? = null) : ApiError
}
