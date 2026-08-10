package br.com.tatame.feature.notifications

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.notifications.NotificationsRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Perfil "Notificações" switch state (spec 010 story 9). */
data class NotificationSettingsUiState(
    /** null while the initial GET is in flight (switch renders disabled). */
    val enabled: Boolean? = null,
    /** A PUT round trip is in flight (switch disabled against double taps). */
    val saving: Boolean = false,
)

/**
 * The per-membership mute switch, shared by all three shells' perfil tabs
 * (NOT.10/11): GET on creation, optimistic flip on toggle with revert on
 * failure. Muting silences the badge only — rows keep being written
 * server-side and the Notificações screen stays reachable (the feed doubles
 * as the receipt trail).
 */
class NotificationSettingsViewModel(
    private val repository: NotificationsRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(NotificationSettingsUiState())
    val uiState: StateFlow<NotificationSettingsUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            when (val result = repository.settings()) {
                is ApiResult.Success ->
                    _uiState.update { it.copy(enabled = result.value.enabled) }
                // Load failure keeps the switch disabled-null: no false state.
                is ApiResult.Failure -> Unit
            }
        }
    }

    fun toggle(enabled: Boolean) {
        val current = _uiState.value
        if (current.enabled == null || current.saving || current.enabled == enabled) return
        _uiState.value = NotificationSettingsUiState(enabled = enabled, saving = true)
        viewModelScope.launch {
            when (val result = repository.updateSettings(enabled)) {
                is ApiResult.Success ->
                    _uiState.value =
                        NotificationSettingsUiState(enabled = result.value.enabled, saving = false)
                is ApiResult.Failure ->
                    // Optimistic revert: the switch springs back, no error UI
                    // (a settings flip is retryable at zero cost).
                    _uiState.value =
                        NotificationSettingsUiState(enabled = current.enabled, saving = false)
            }
        }
    }
}
