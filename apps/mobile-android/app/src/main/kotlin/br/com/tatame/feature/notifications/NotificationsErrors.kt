package br.com.tatame.feature.notifications

import androidx.annotation.StringRes
import br.com.tatame.R
import br.com.tatame.core.network.ApiError

/**
 * PT-BR copy for notifications-slice failures (NOT.10/11). The surface is
 * read-mostly, so only the transport buckets matter; mark-read/settings ride
 * @BypassReadOnly server-side and never surface `tenant.read_only` here.
 */
@StringRes
internal fun ApiError.toNotificationsMessageRes(): Int = when (this) {
    is ApiError.Network -> R.string.error_network
    is ApiError.Timeout -> R.string.error_timeout
    is ApiError.NotFound -> R.string.error_not_found
    else -> R.string.error_generic
}
