package br.com.tatame.core.network

import br.com.tatame.core.di.buildRetrofit
import br.com.tatame.testutil.InMemoryTokenStore
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.HttpException

/**
 * Single-flight refresh semantics of [RefreshAuthenticator] against
 * MockWebServer (ticket 07: networking logic is pure-JVM testable).
 */
class RefreshAuthenticatorTest {

    private lateinit var server: MockWebServer
    private lateinit var tokenProvider: SessionTokenProvider
    private lateinit var tokenStore: InMemoryTokenStore
    private lateinit var authEvents: AuthEvents
    private lateinit var api: AuthApi
    private val refreshCalls = AtomicInteger(0)

    private val meBody = """
        {"user":{"id":"u1","email":"aluno@tatame.dev","fullName":"Aluno Dev","phone":null,"avatarUrl":null,"locale":"pt-BR"},
         "memberships":[{"id":"m1","type":"academy","role":"student","tenantId":"t1","academyName":"Alliance",
                         "academySlug":"alliance","academyStatus":"active","status":"active"}],
         "activeMembershipId":"m1","activeRole":"student",
         "academy":{"id":"t1","name":"Alliance","slug":"alliance","status":"active","logoUrl":null,"theme":null},
         "permissions":{},"impersonation":{"isImpersonated":false}}
    """.trimIndent()

    @Before
    fun setUp() {
        refreshCalls.set(0)
        server = MockWebServer()
        tokenProvider = SessionTokenProvider()
        tokenStore = InMemoryTokenStore("refresh-1")
        authEvents = AuthEvents()
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    /** Wires an authed client whose refresh endpoint behavior is [refreshResponse]. */
    private fun start(refreshResponse: () -> MockResponse) {
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse = when (request.path) {
                "/v1/auth/refresh" -> {
                    refreshCalls.incrementAndGet()
                    refreshResponse()
                }
                "/v1/auth/me" ->
                    if (request.getHeader("Authorization") == "Bearer fresh-access") {
                        MockResponse().setResponseCode(200)
                            .setHeader("Content-Type", "application/json")
                            .setBody(meBody)
                    } else {
                        MockResponse().setResponseCode(401)
                            .setHeader("Content-Type", "application/problem+json")
                            .setBody("""{"status":401,"code":"auth.token_expired"}""")
                    }
                else -> MockResponse().setResponseCode(404)
            }
        }
        server.start()

        val baseUrl = server.url("/").toString()
        val bareApi = buildRetrofit(baseUrl, OkHttpClient.Builder().build(), ProblemJson)
            .create(AuthApi::class.java)
        val authenticator = RefreshAuthenticator(
            tokenProvider = tokenProvider,
            tokenStore = tokenStore,
            refreshApi = lazy { bareApi },
            authEvents = authEvents,
        )
        val authedClient = OkHttpClient.Builder()
            .addInterceptor(AuthInterceptor(tokenProvider))
            .authenticator(authenticator)
            .build()
        api = buildRetrofit(baseUrl, authedClient, ProblemJson).create(AuthApi::class.java)
    }

    private fun successfulRefresh() = MockResponse()
        .setResponseCode(200)
        .setHeader("Content-Type", "application/json")
        .setBody("""{"accessToken":"fresh-access","accessExpiresIn":900,"refreshToken":"refresh-2"}""")

    @Test
    fun `401 triggers refresh, rotates tokens, and replays the request`() {
        start(::successfulRefresh)
        tokenProvider.accessToken = "stale-access"

        val me = runBlocking { api.me() }

        assertEquals("aluno@tatame.dev", me.user.email)
        assertEquals(1, refreshCalls.get())
        assertEquals("fresh-access", tokenProvider.accessToken)
        assertEquals("refresh-2", runBlocking { tokenStore.read() })
    }

    @Test
    fun `concurrent 401s refresh exactly once (single-flight)`() {
        start(::successfulRefresh)
        tokenProvider.accessToken = "stale-access"

        val results = runBlocking {
            (1..4).map { async(Dispatchers.IO) { api.me() } }.awaitAll()
        }

        assertEquals(4, results.size)
        assertEquals("refresh exactly once across concurrent callers", 1, refreshCalls.get())
    }

    @Test
    fun `rejected refresh token expires the session and clears storage`() {
        start {
            MockResponse().setResponseCode(401)
                .setHeader("Content-Type", "application/problem+json")
                .setBody("""{"status":401,"code":"auth.refresh_reused"}""")
        }
        tokenProvider.accessToken = "stale-access"

        val failure = runBlocking { runCatching { api.me() } }

        assertTrue(failure.exceptionOrNull() is HttpException)
        assertEquals(401, (failure.exceptionOrNull() as HttpException).code())
        assertNull("access token wiped", tokenProvider.accessToken)
        assertNull("refresh token wiped", runBlocking { tokenStore.read() })
    }

    @Test
    fun `missing refresh token gives up without calling refresh`() {
        start(::successfulRefresh)
        runBlocking { tokenStore.clear() }
        tokenProvider.accessToken = "stale-access"

        val failure = runBlocking { runCatching { api.me() } }

        assertTrue(failure.exceptionOrNull() is HttpException)
        assertEquals(0, refreshCalls.get())
    }
}
