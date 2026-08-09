package br.com.tatame.feature.graduation

import androidx.annotation.StringRes
import br.com.tatame.R
import br.com.tatame.core.network.ApiError

/**
 * PT-BR copy for graduation-slice failures (GRD.19/20). Branches on the
 * sealed [ApiError] surface — stable codes, never human text. The rules-only
 * codes (lessons below minimum, non-kids toggle) belong to the admin web
 * console and fall through to the generic bucket here.
 */
@StringRes
internal fun ApiError.toGraduationMessageRes(): Int = when (this) {
    is ApiError.Graduation.DegreeAtMax -> R.string.error_graduation_degree_at_max
    is ApiError.Graduation.BeltInvalidTarget -> R.string.error_graduation_belt_invalid_target
    is ApiError.Graduation.AlreadyReversed -> R.string.error_graduation_already_reversed
    is ApiError.Auth.PermissionDisabled -> R.string.error_permission_disabled
    is ApiError.Tenant.ReadOnly -> R.string.error_read_only
    is ApiError.NotFound -> R.string.error_not_found
    is ApiError.Network -> R.string.error_network
    is ApiError.Timeout -> R.string.error_timeout
    is ApiError.Validation -> R.string.error_form_invalid
    else -> R.string.error_generic
}
