package br.com.tatame.feature.enrollment

import androidx.annotation.StringRes
import br.com.tatame.R
import br.com.tatame.core.network.ApiError

/**
 * PT-BR copy for enrollment-slice failures (ENR.22/23). Branches on the
 * sealed [ApiError] surface — stable codes, never human text.
 */
@StringRes
internal fun ApiError.toEnrollmentMessageRes(): Int = when (this) {
    is ApiError.Enrollment.ClassFull -> R.string.error_class_full
    is ApiError.Enrollment.ClassArchived -> R.string.error_class_archived
    is ApiError.Enrollment.AlreadyEnrolled -> R.string.error_already_enrolled
    is ApiError.Auth.PermissionDisabled -> R.string.error_permission_disabled
    is ApiError.Tenant.ReadOnly -> R.string.error_read_only
    is ApiError.NotFound -> R.string.error_not_found
    is ApiError.Network -> R.string.error_network
    is ApiError.Timeout -> R.string.error_timeout
    is ApiError.Validation -> R.string.error_form_invalid
    else -> R.string.error_generic
}
