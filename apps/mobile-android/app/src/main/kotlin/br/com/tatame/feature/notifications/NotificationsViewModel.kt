package br.com.tatame.feature.notifications

import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.dto.NotificationItem
import br.com.tatame.core.notifications.NotificationsRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Notificações feed load state (NOT.10/11, aluno-20 / responsavel-09). */
sealed interface NotificationsListState {
    data object Loading : NotificationsListState
    data class Error(@param:StringRes val messageRes: Int) : NotificationsListState
    data class Loaded(
        val notifications: List<NotificationItem>,
        val nextCursor: String?,
        /** A cursor page is in flight (footer spinner; guards double loads). */
        val loadingMore: Boolean = false,
    ) : NotificationsListState
}

/**
 * The shared Notificações screen feed, one instance per screen open (all
 * three shells reuse it — persona only affects route mapping, which lives in
 * the composable layer via [mapNotificationRoute]). Opening the screen IS the
 * read receipt: the first successful page fires `read-all` exactly once
 * (spec 010 story 8 — "the dot always means something new"); the rows of the
 * already-fetched page keep their server-sent `readAt` so the visual
 * unread/read distinction of the open screen stays honest.
 */
class NotificationsViewModel(
    private val repository: NotificationsRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow<NotificationsListState>(NotificationsListState.Loading)
    val uiState: StateFlow<NotificationsListState> = _uiState.asStateFlow()

    private var readAllFired = false

    init {
        refresh()
    }

    fun refresh() {
        _uiState.value = NotificationsListState.Loading
        viewModelScope.launch {
            when (val result = repository.list()) {
                is ApiResult.Success -> {
                    _uiState.value = NotificationsListState.Loaded(
                        notifications = result.value.notifications,
                        nextCursor = result.value.nextCursor,
                    )
                    fireReadAllOnce()
                }
                is ApiResult.Failure ->
                    _uiState.value =
                        NotificationsListState.Error(result.error.toNotificationsMessageRes())
            }
        }
    }

    /** Cursor pagination on scroll — no-op without a next page or mid-flight. */
    fun loadMore() {
        val loaded = _uiState.value as? NotificationsListState.Loaded ?: return
        val cursor = loaded.nextCursor ?: return
        if (loaded.loadingMore) return
        _uiState.value = loaded.copy(loadingMore = true)
        viewModelScope.launch {
            when (val result = repository.list(cursor)) {
                is ApiResult.Success -> _uiState.update { state ->
                    val current = state as? NotificationsListState.Loaded ?: return@update state
                    current.copy(
                        notifications = current.notifications + result.value.notifications,
                        nextCursor = result.value.nextCursor,
                        loadingMore = false,
                    )
                }
                // A failed page keeps the list usable; scrolling retries.
                is ApiResult.Failure -> _uiState.update { state ->
                    (state as? NotificationsListState.Loaded)
                        ?.copy(loadingMore = false)
                        ?: state
                }
            }
        }
    }

    private suspend fun fireReadAllOnce() {
        if (readAllFired) return
        readAllFired = true
        // Fire-and-forget semantics: a failed read-all never disturbs the
        // feed (the dot simply survives until the next successful open).
        repository.readAll()
    }
}
