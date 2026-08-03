package br.com.tatame.core.auth

import br.com.tatame.core.network.ApiError
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.AuthEvent
import br.com.tatame.core.network.AuthEvents
import br.com.tatame.core.network.SessionTokenProvider
import br.com.tatame.core.network.TokenStore
import br.com.tatame.core.network.dto.MeResponse
import br.com.tatame.core.network.dto.MembershipView
import br.com.tatame.core.network.dto.UserSummary
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Why the user is on the login screen (drives the PT-BR message shown there). */
enum class LogoutReason {
    /** Fresh install / normal state — no message. */
    NONE,

    /** User tapped "Sair". */
    USER_LOGOUT,

    /** Refresh token family revoked/expired — "sua sessão expirou". */
    SESSION_EXPIRED,

    /** Cold-start silent refresh failed on network — session kept, retry later. */
    OFFLINE,
}

/** Session state machine (spec 001-auth, Android slice AUTH.22/23). */
sealed interface SessionState {
    /** Cold start: silent refresh running behind the splash. */
    data object Booting : SessionState

    data class LoggedOut(val reason: LogoutReason = LogoutReason.NONE) : SessionState

    /** Login succeeded with >1 membership — user must pick where to act. */
    data class ChoosingMembership(
        val user: UserSummary,
        val memberships: List<MembershipView>,
        val activeMembershipId: String,
        val switching: Boolean = false,
    ) : SessionState

    data class Authenticated(val me: MeResponse) : SessionState
}

/** Result surfaced to the login screen (state transitions happen internally). */
sealed interface LoginResult {
    data object Ok : LoginResult

    /** Platform 2FA account — mobile directs to the web console. */
    data object MfaOnWebOnly : LoginResult

    data class Error(val error: ApiError) : LoginResult
}

/**
 * Owns the auth state (Koin `single`, flow-based — ticket 06: no custom
 * session scopes; logout resets state, not the graph).
 *
 * Cold start: refresh token absent → LoggedOut; present → silent refresh →
 * /me → Authenticated. Auth-rejected refresh wipes the store; network failure
 * keeps it (retry next launch) but lands on login with an offline notice —
 * stale-shell offline entry needs a profile cache that lands with a later
 * slice.
 */
class SessionManager(
    private val repository: AuthRepository,
    private val tokenStore: TokenStore,
    private val tokenProvider: SessionTokenProvider,
    authEvents: AuthEvents,
    scope: CoroutineScope,
) {
    private val _state = MutableStateFlow<SessionState>(SessionState.Booting)
    val state: StateFlow<SessionState> = _state.asStateFlow()

    init {
        // Synchronous subscription: fired from OkHttp threads by the
        // authenticator, which has already wiped both tokens — only the state
        // flip (thread-safe StateFlow write) remains, plus a best-effort store
        // clear for any other emitter.
        authEvents.subscribe { event ->
            if (event is AuthEvent.SessionExpired && _state.value !is SessionState.LoggedOut) {
                tokenProvider.clear()
                _state.value = SessionState.LoggedOut(LogoutReason.SESSION_EXPIRED)
                scope.launch { tokenStore.clear() }
            }
        }
    }

    /** Cold-start restoration — call once from the splash. */
    suspend fun bootstrap() {
        if (_state.value !is SessionState.Booting) return
        val refreshToken = tokenStore.read()
        if (refreshToken == null) {
            _state.value = SessionState.LoggedOut()
            return
        }
        when (val refreshed = repository.refresh(refreshToken)) {
            is ApiResult.Success -> {
                tokenProvider.accessToken = refreshed.value.accessToken
                refreshed.value.refreshToken?.let { tokenStore.write(it) }
                loadMe()
            }
            is ApiResult.Failure -> when (refreshed.error) {
                is ApiError.Network, is ApiError.Timeout ->
                    _state.value = SessionState.LoggedOut(LogoutReason.OFFLINE)
                else -> wipeTo(LogoutReason.SESSION_EXPIRED)
            }
        }
    }

    suspend fun login(email: String, password: String): LoginResult =
        when (val result = repository.login(email, password)) {
            is ApiResult.Failure -> LoginResult.Error(result.error)
            is ApiResult.Success -> when (val outcome = result.value) {
                is LoginOutcome.MfaRequired -> LoginResult.MfaOnWebOnly
                is LoginOutcome.Session -> {
                    val session = outcome.session
                    tokenProvider.accessToken = session.accessToken
                    session.refreshToken?.let { tokenStore.write(it) }
                    if (session.memberships.size > 1) {
                        _state.value = SessionState.ChoosingMembership(
                            user = session.user,
                            memberships = session.memberships,
                            activeMembershipId = session.activeMembershipId,
                        )
                        LoginResult.Ok
                    } else {
                        loadMe()
                        LoginResult.Ok
                    }
                }
            }
        }

    /** Membership chooser selection — switches server-side when needed. */
    suspend fun chooseMembership(membershipId: String) {
        val choosing = _state.value as? SessionState.ChoosingMembership ?: return
        _state.value = choosing.copy(switching = true)
        if (membershipId != choosing.activeMembershipId) {
            when (val switched = repository.switchMembership(membershipId)) {
                is ApiResult.Success -> tokenProvider.accessToken = switched.value.accessToken
                is ApiResult.Failure -> {
                    _state.value = choosing.copy(switching = false)
                    return
                }
            }
        }
        loadMe()
    }

    /** "Sair" — server revoke is best-effort; local wipe always completes. */
    suspend fun logout() {
        runCatching { repository.logout() }
        wipeTo(LogoutReason.USER_LOGOUT)
    }

    private suspend fun loadMe() {
        when (val me = repository.me()) {
            is ApiResult.Success -> _state.value = SessionState.Authenticated(me.value)
            is ApiResult.Failure -> when (me.error) {
                is ApiError.Auth.SessionExpired -> wipeTo(LogoutReason.SESSION_EXPIRED)
                else -> _state.value = SessionState.LoggedOut(LogoutReason.OFFLINE)
            }
        }
    }

    private suspend fun wipeTo(reason: LogoutReason) {
        tokenProvider.clear()
        tokenStore.clear()
        _state.value = SessionState.LoggedOut(reason)
    }
}
