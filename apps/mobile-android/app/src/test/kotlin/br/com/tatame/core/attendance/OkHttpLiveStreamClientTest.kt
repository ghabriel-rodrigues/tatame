package br.com.tatame.core.attendance

import br.com.tatame.core.network.ApiConfig
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * ATT.20 — [OkHttpLiveStreamClient] over a real SSE body (MockWebServer):
 * named events per the contract (`checkin` / `revoke` / `heartbeat`), ticket
 * in the query string, failure surfaced as [LiveStreamException].
 */
class OkHttpLiveStreamClientTest {

    private lateinit var server: MockWebServer
    private lateinit var client: OkHttpLiveStreamClient

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        client = OkHttpLiveStreamClient(
            baseClient = OkHttpClient(),
            apiConfig = ApiConfig(server.url("/").toString()),
        )
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun `parses named checkin revoke and heartbeat events then completes on close`() = runBlocking {
        server.enqueue(
            MockResponse()
                .setHeader("Content-Type", "text/event-stream")
                .setBody(
                    """
                    |event: checkin
                    |data: {"attendanceId":"a1","studentId":"s1","studentName":"Lucas Almeida","method":"qr","checkedInAt":"2026-08-03T13:05:00Z","presentCount":1}
                    |
                    |event: heartbeat
                    |data: {}
                    |
                    |event: revoke
                    |data: {"attendanceId":"a1","presentCount":0}
                    |
                    """.trimMargin() + "\n", // blank line terminates the final event
                ),
        )

        val events = client.stream("lc1", "signed.ticket").toList()

        val request = server.takeRequest()
        assertEquals(
            "/v1/professor/live-codes/lc1/stream?ticket=signed.ticket",
            request.path,
        )
        assertEquals("text/event-stream", request.getHeader("Accept"))

        assertEquals(LiveStreamEvent.Opened, events[0])
        val checkin = events[1] as LiveStreamEvent.Checkin
        assertEquals("Lucas Almeida", checkin.payload.studentName)
        assertEquals(1, checkin.payload.presentCount)
        assertEquals(LiveStreamEvent.Heartbeat, events[2])
        val revoke = events[3] as LiveStreamEvent.Revoke
        assertEquals(0, revoke.payload.presentCount)
        assertEquals(4, events.size)
    }

    @Test
    fun `non-2xx connect fails the flow with LiveStreamException`() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(401))

        var failure: Throwable? = null
        val events = client.stream("lc1", "expired.ticket")
            .catch { failure = it }
            .toList()

        assertTrue(events.isEmpty())
        assertTrue(failure is LiveStreamException)
    }
}
