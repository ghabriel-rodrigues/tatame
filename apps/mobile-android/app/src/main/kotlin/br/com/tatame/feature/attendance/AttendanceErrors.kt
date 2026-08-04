package br.com.tatame.feature.attendance

import androidx.annotation.StringRes
import br.com.tatame.R
import br.com.tatame.core.network.ApiError

/**
 * PT-BR copy for attendance-slice failures (ATT.19–21). Branches on the
 * sealed [ApiError] surface — stable codes, never human text. The duplicate
 * check-in is NOT here: `already_checked_in` is a 200-family success state.
 */
@StringRes
internal fun ApiError.toAttendanceMessageRes(): Int = when (this) {
    is ApiError.Attendance.CodeInvalid -> R.string.error_checkin_code_invalid
    is ApiError.Attendance.NotEnrolled -> R.string.error_checkin_not_enrolled
    is ApiError.Attendance.NoSessionToday -> R.string.error_checkin_no_session_today
    is ApiError.Attendance.OutsideWindow -> R.string.error_checkin_outside_window
    is ApiError.Attendance.RevokeWindowClosed -> R.string.error_revoke_window_closed
    is ApiError.Auth.PermissionDisabled -> R.string.error_permission_disabled
    is ApiError.Tenant.ReadOnly -> R.string.error_read_only
    is ApiError.NotFound -> R.string.error_not_found
    is ApiError.Network -> R.string.error_network
    is ApiError.Timeout -> R.string.error_timeout
    is ApiError.Validation -> R.string.error_form_invalid
    else -> R.string.error_generic
}
