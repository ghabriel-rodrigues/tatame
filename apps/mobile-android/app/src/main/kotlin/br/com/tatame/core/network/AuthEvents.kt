package br.com.tatame.core.network

import java.util.concurrent.CopyOnWriteArrayList

/**
 * Decouples the OkHttp [RefreshAuthenticator] (which detects terminal session
 * loss) from the session layer (which owns state) — breaks the DI cycle
 * network → session → network. Synchronous listener fan-out: the emitter has
 * already cleared tokens when it fires, listeners only need to flip state
 * (StateFlow writes are thread-safe), so no coroutine machinery is needed.
 */
class AuthEvents {
    private val listeners = CopyOnWriteArrayList<(AuthEvent) -> Unit>()

    fun subscribe(listener: (AuthEvent) -> Unit) {
        listeners += listener
    }

    fun emit(event: AuthEvent) {
        listeners.forEach { it(event) }
    }
}

sealed interface AuthEvent {
    /** Refresh token rejected/absent — the whole session family is gone (tokens already wiped). */
    data object SessionExpired : AuthEvent
}
