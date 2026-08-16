package br.com.tatame.feature.rankings

import androidx.annotation.StringRes
import br.com.tatame.R
import br.com.tatame.core.network.ApiError

/**
 * PT-BR copy for ranking read failures (REP.14). A read-only surface: only
 * the transport buckets are meaningful; everything else is the generic copy.
 */
@StringRes
internal fun ApiError.toRankingMessageRes(): Int = when (this) {
    is ApiError.Network -> R.string.error_network
    is ApiError.Timeout -> R.string.error_timeout
    is ApiError.NotFound -> R.string.error_not_found
    else -> R.string.error_generic
}
