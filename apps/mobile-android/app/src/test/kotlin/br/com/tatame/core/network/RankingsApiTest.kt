package br.com.tatame.core.network

import br.com.tatame.core.di.buildRetrofit
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * REP.14 — hand-written [RankingsApi] against MockWebServer: query params,
 * spec-mirroring DTO decoding, the null `me` (professor requester) and the
 * semester window shape (same doctrine as GraduationApiTest).
 */
class RankingsApiTest {

    private lateinit var server: MockWebServer
    private lateinit var api: RankingsApi

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        api = buildRetrofit(server.url("/").toString(), OkHttpClient(), ProblemJson)
            .create(RankingsApi::class.java)
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    private fun enqueueJson(body: String) {
        server.enqueue(
            MockResponse().setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody(body),
        )
    }

    @Test
    fun `lessons ranking decodes rows me and the month window`() = runBlocking {
        enqueueJson(
            """
            {"by":"lessons",
             "window":{"label":"2026-08","start":"2026-08-01","endExclusive":"2026-09-01"},
             "top":[{"position":1,"name":"Marina Costa","count":17,"isMe":false},
                    {"position":2,"name":"Lucas Almeida","count":14,"isMe":true}],
             "me":{"position":2,"count":14},
             "totalRanked":24}
            """.trimIndent(),
        )

        val response = api.ranking(by = "lessons")

        assertEquals("/v1/rankings?by=lessons", server.takeRequest().path)
        assertEquals("lessons", response.by)
        assertEquals("2026-08", response.window.label)
        assertEquals(2, response.top.size)
        assertTrue(response.top[1].isMe)
        assertEquals(14, response.me?.count)
        assertEquals(24, response.totalRanked)
    }

    @Test
    fun `events ranking rides the by and month query params`() = runBlocking {
        enqueueJson(
            """
            {"by":"events",
             "window":{"label":"2026-S2","start":"2026-07-01","endExclusive":"2027-01-01"},
             "top":[{"position":1,"name":"João Ferraz","count":5,"isMe":false}],
             "me":null,
             "totalRanked":24}
            """.trimIndent(),
        )

        val response = api.ranking(by = "events", month = "2026-08")

        assertEquals("/v1/rankings?by=events&month=2026-08", server.takeRequest().path)
        assertEquals("2026-S2", response.window.label)
        assertNull(response.me) // professor requester — never ranked
        assertFalse(response.top.single().isMe)
    }

    @Test
    fun `an empty academy decodes to empty top with zero ranked`() = runBlocking {
        enqueueJson(
            """{"by":"lessons",
                "window":{"label":"2026-08","start":"2026-08-01","endExclusive":"2026-09-01"},
                "top":[],"me":null,"totalRanked":0}""",
        )

        val response = api.ranking(by = "lessons")

        assertTrue(response.top.isEmpty())
        assertEquals(0, response.totalRanked)
    }
}
