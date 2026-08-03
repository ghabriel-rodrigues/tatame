package br.com.tatame.feature.auth

import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import br.com.tatame.R
import br.com.tatame.core.auth.LoginResult
import br.com.tatame.core.auth.SessionManager
import br.com.tatame.core.network.ApiError
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class LoginUiState(
    val email: String = "",
    val password: String = "",
    val isSubmitting: Boolean = false,
    @param:StringRes val errorRes: Int? = null,
    val showForgotDialog: Boolean = false,
)

class LoginViewModel(private val sessionManager: SessionManager) : ViewModel() {

    private val _uiState = MutableStateFlow(LoginUiState())
    val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()

    fun onEmailChange(value: String) = _uiState.update { it.copy(email = value, errorRes = null) }

    fun onPasswordChange(value: String) = _uiState.update { it.copy(password = value, errorRes = null) }

    fun onForgotPassword() = _uiState.update { it.copy(showForgotDialog = true) }

    fun onDismissForgotDialog() = _uiState.update { it.copy(showForgotDialog = false) }

    fun submit() {
        val state = _uiState.value
        if (state.isSubmitting) return
        if (state.email.isBlank() || state.password.isBlank()) {
            _uiState.update { it.copy(errorRes = R.string.error_validation) }
            return
        }
        _uiState.update { it.copy(isSubmitting = true, errorRes = null) }
        viewModelScope.launch {
            val result = sessionManager.login(state.email.trim(), state.password)
            _uiState.update {
                it.copy(
                    isSubmitting = false,
                    errorRes = when (result) {
                        is LoginResult.Ok -> null // navigation reacts to SessionState
                        is LoginResult.MfaOnWebOnly -> R.string.error_mfa_web_only
                        is LoginResult.Error -> result.error.toMessageRes()
                    },
                )
            }
        }
    }
}

@StringRes
internal fun ApiError.toMessageRes(): Int = when (this) {
    is ApiError.Auth.InvalidCredentials -> R.string.error_invalid_credentials
    is ApiError.Auth.MfaRequired -> R.string.error_mfa_web_only
    is ApiError.Network -> R.string.error_network
    is ApiError.Timeout -> R.string.error_timeout
    is ApiError.Validation -> R.string.error_validation
    else -> R.string.error_generic
}
