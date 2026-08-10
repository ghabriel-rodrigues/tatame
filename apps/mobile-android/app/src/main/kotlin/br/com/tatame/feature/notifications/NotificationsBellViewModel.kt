package br.com.tatame.feature.notifications

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.notifications.NotificationsRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * The home-header bell dot (NOT.10/11): one unread-count fetch on creation,
 * re-fetched via [refresh] whenever the shell returns from the Notificações
 * screen (read-all just ran — the dot must die). Failures degrade to "no
 * dot": a badge is never worth an error surface. Mute semantics are
 * server-side (the endpoint returns 0 while the membership is muted).
 */
class NotificationsBellViewModel(
    private val repository: NotificationsRepository,
) : ViewModel() {

    private val _unreadCount = MutableStateFlow(0)
    val unreadCount: StateFlow<Int> = _unreadCount.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            when (val result = repository.unreadCount()) {
                is ApiResult.Success -> _unreadCount.value = result.value.count
                is ApiResult.Failure -> _unreadCount.value = 0
            }
        }
    }
}
