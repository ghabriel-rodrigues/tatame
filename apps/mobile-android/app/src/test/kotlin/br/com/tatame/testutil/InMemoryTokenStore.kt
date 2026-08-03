package br.com.tatame.testutil

import br.com.tatame.core.network.TokenStore
import java.util.concurrent.atomic.AtomicReference

/** In-memory [TokenStore] fake for JVM tests. */
class InMemoryTokenStore(initial: String? = null) : TokenStore {
    private val value = AtomicReference(initial)

    override suspend fun read(): String? = value.get()

    override suspend fun write(refreshToken: String) {
        value.set(refreshToken)
    }

    override suspend fun clear() {
        value.set(null)
    }
}
