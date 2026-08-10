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

    // Graduation slice (spec 005) additions.
    const val GRADUATION_DEGREE_AT_MAX = "graduation.degree_at_max"
    const val GRADUATION_BELT_INVALID_TARGET = "graduation.belt_invalid_target"
    const val GRADUATION_ALREADY_REVERSED = "graduation.already_reversed"
    const val GRADUATION_LESSONS_BELOW_MINIMUM = "graduation.lessons_below_minimum"
    const val GRADUATION_CANNOT_DISABLE_NON_KIDS_BELT = "graduation.cannot_disable_non_kids_belt"

    // Billing slice (spec 006) additions.
    const val BILLING_CHARGE_NOT_PAYABLE = "billing.charge_not_payable"
    const val BILLING_METHOD_MANDATE_MISMATCH = "billing.method_mandate_mismatch"
    const val BILLING_MANDATE_ALREADY_ACTIVE = "billing.mandate_already_active"
    const val BILLING_REFUND_UNSETTLED = "billing.refund_unsettled"
    const val BILLING_SIMULATE_UNAVAILABLE = "billing.simulate_unavailable"

    // Events slice (spec 008) additions.
    const val EVENT_PUBLISH_REQUIREMENTS = "event.publish_requirements"
    const val EVENT_NOT_PUBLISHED = "event.not_published"
    const val EVENT_REGISTRATION_SETTLED = "event.registration_settled"

    // Store slice (spec 009) additions.
    const val STORE_INSUFFICIENT_STOCK = "store.insufficient_stock"
    const val STORE_SIZE_REQUIRED = "store.size_required"
    const val STORE_SIZE_INVALID = "store.size_invalid"
    const val STORE_PRODUCT_NOT_PURCHASABLE = "store.product_not_purchasable"
    const val STORE_ORDER_NOT_CANCELABLE = "store.order_not_cancelable"
    const val STORE_ORDER_INVALID_TRANSITION = "store.order_invalid_transition"
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

    /** Graduation-slice stable codes (spec 005) the award/rules UX maps to PT-BR copy. */
    sealed interface Graduation : ApiError {
        /** `graduation.degree_at_max` — add-degree on a belt already at `max_degrees`. */
        data object DegreeAtMax : Graduation

        /** `graduation.belt_invalid_target` — disabled, unknown, or current belt as target. */
        data object BeltInvalidTarget : Graduation

        /** `graduation.already_reversed` — second revocation of the same award. */
        data object AlreadyReversed : Graduation

        /** `graduation.lessons_below_minimum` — rules PUT below the 10-lesson floor (admin web). */
        data object LessonsBelowMinimum : Graduation

        /** `graduation.cannot_disable_non_kids_belt` — kids-only toggle violated (admin web). */
        data object CannotDisableNonKidsBelt : Graduation
    }

    /** Billing-slice stable codes (spec 006) the Carteira/Pagamentos UX maps to PT-BR copy. */
    sealed interface Billing : ApiError {
        /** `billing.charge_not_payable` — paying a charge already paid/canceled/refunded. */
        data object ChargeNotPayable : Billing

        /** `billing.method_mandate_mismatch` — recurrence toggle on a non-card method. */
        data object MethodMandateMismatch : Billing

        /** `billing.mandate_already_active` — second recurrence opt-in while one is active. */
        data object MandateAlreadyActive : Billing

        /** `billing.refund_unsettled` — refund on a non-succeeded payment (admin path). */
        data object RefundUnsettled : Billing

        /** `billing.simulate_unavailable` — reserved non-hidden gating (route is 404 by default). */
        data object SimulateUnavailable : Billing
    }

    /** Events-slice stable codes (spec 008) the event registration UX maps to PT-BR copy. */
    sealed interface Events : ApiError {
        /** `event.publish_requirements` — publish without date/local (admin web path). */
        data object PublishRequirements : Events

        /** `event.not_published` — registration/announce against a draft or canceled event. */
        data object NotPublished : Events

        /** `event.registration_settled` — self-cancel of a paid confirmed registration. */
        data object RegistrationSettled : Events
    }

    /** Store-slice stable codes (spec 009) the vitrine/compra UX maps to PT-BR copy. */
    sealed interface Store : ApiError {
        /** `store.insufficient_stock` — quantity > current stock at order creation. */
        data object InsufficientStock : Store

        /** `store.size_required` — sized product ordered without a size. */
        data object SizeRequired : Store

        /** `store.size_invalid` — size not among the product's pills. */
        data object SizeInvalid : Store

        /** `store.product_not_purchasable` — archived or otherwise unbuyable product. */
        data object ProductNotPurchasable : Store

        /** `store.order_not_cancelable` — buyer cancel of an already-paid order. */
        data object OrderNotCancelable : Store

        /** `store.order_invalid_transition` — admin board path (web console). */
        data object OrderInvalidTransition : Store
    }

    /** 422 `validation.failed` with field-level errors. */
    data class Validation(val fieldErrors: Map<String, List<String>>) : ApiError

    data object NotFound : ApiError

    data object Conflict : ApiError

    data class Server(val status: Int) : ApiError

    /** Unmapped code/status — never crash on registry growth. */
    data class Unknown(val status: Int, val code: String? = null) : ApiError
}
