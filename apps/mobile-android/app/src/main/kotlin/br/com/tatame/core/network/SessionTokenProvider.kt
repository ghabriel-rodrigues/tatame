package br.com.tatame.core.network

import java.util.concurrent.atomic.AtomicReference

/**
 * Process-lifetime, memory-only holder of the access token — never persisted
 * (spec 001-auth: access token in memory everywhere). Thread-safe: read by the
 * OkHttp interceptor on IO threads, written by the session layer and the
 * refresh authenticator.
 */
class SessionTokenProvider {
    private val token = AtomicReference<String?>(null)

    var accessToken: String?
        get() = token.get()
        set(value) = token.set(value)

    fun clear() = token.set(null)
}
