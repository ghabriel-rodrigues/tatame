package br.com.tatame.core.network

import br.com.tatame.core.network.dto.RefreshRequest
import java.io.IOException
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import okhttp3.Authenticator
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route
import retrofit2.HttpException

/**
 * Single-flight 401 refresh (ticket mobile-android/02):
 *
 * - A [Mutex] serializes refresh attempts; on entry, if the in-memory access
 *   token already differs from the one that got the 401, another caller
 *   refreshed first — retry with it, no second refresh call.
 * - The refresh call goes through [refreshApi], a Retrofit instance built on a
 *   BARE OkHttp client (no authenticator/interceptor) to avoid recursion.
 * - Body transport: the rotated refresh token is persisted to [TokenStore].
 * - Terminal failure (refresh token absent or rejected by the server) emits
 *   [AuthEvent.SessionExpired]; transient IO failures just give up on this
 *   request without killing the session.
 */
class RefreshAuthenticator(
    private val tokenProvider: SessionTokenProvider,
    private val tokenStore: TokenStore,
    private val refreshApi: Lazy<AuthApi>,
    private val authEvents: AuthEvents,
) : Authenticator {

    private val mutex = Mutex()

    override fun authenticate(route: Route?, response: Response): Request? {
        // One replay per request: if this response chain already carries a retry, give up.
        if (response.priorResponse != null) return null

        val failedToken = response.request.header("Authorization")?.removePrefix("Bearer ")

        return runBlocking {
            mutex.withLock {
                val current = tokenProvider.accessToken
                if (current != null && current != failedToken) {
                    // Someone else refreshed while we waited on the mutex.
                    return@withLock retryWith(response.request, current)
                }

                val refreshToken = tokenStore.read()
                if (refreshToken == null) {
                    expireSession()
                    return@withLock null
                }

                try {
                    val pair = refreshApi.value.refresh(RefreshRequest(refreshToken = refreshToken))
                    tokenProvider.accessToken = pair.accessToken
                    pair.refreshToken?.let { tokenStore.write(it) }
                    retryWith(response.request, pair.accessToken)
                } catch (e: HttpException) {
                    // Server explicitly rejected the refresh token — family revoked/expired.
                    expireSession()
                    null
                } catch (e: IOException) {
                    // Offline/transient: fail this request, keep the stored session.
                    null
                }
            }
        }
    }

    private suspend fun expireSession() {
        tokenProvider.clear()
        tokenStore.clear()
        authEvents.emit(AuthEvent.SessionExpired)
    }

    private fun retryWith(request: Request, token: String): Request =
        request.newBuilder().header("Authorization", "Bearer $token").build()
}
