package br.com.tatame.core.network

import br.com.tatame.core.di.buildRetrofit
import br.com.tatame.core.network.dto.NotificationCategories
import br.com.tatame.core.network.dto.UpdateNotificationSettingsRequest
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
 * NOT.10/11 — hand-written [NotificationsApi] against MockWebServer: paths,
 * verbs, the cursor query param and spec-mirroring DTO decoding (same
 * doctrine as StoreApiTest/EventsApiTest over the persona-neutral
 * notifications surface of spec 010).
 */
class NotificationsApiTest {

    private lateinit var server: MockWebServer
    private lateinit var api: NotificationsApi

    private val pageJson = """
        {"notifications":[
           {"id":"nt1","category":"payment","chip":"R$","title":"Mensalidade de agosto disponível",
            "body":"Vence em 15/08 · R$ 260,00","route":"wallet",
            "readAt":null,"createdAt":"2026-08-10T12:00:00.000Z"},
           {"id":"nt2","category":"graduation","chip":"2º","title":"Você recebeu o 2º grau",
            "body":"Registrado pelo Prof. Rafael","route":"graduation",
            "readAt":"2026-08-09T10:00:00.000Z","createdAt":"2026-08-08T18:30:00.000Z"},
           {"id":"nt3","category":"attendance","chip":null,"title":"Check-in registrado",
            "body":null,"route":null,
            "readAt":null,"createdAt":"2026-08-01T09:00:00.000Z"}],
         "nextCursor":"cur-2"}
    """.trimIndent()

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        api = buildRetrofit(server.url("/").toString(), OkHttpClient(), ProblemJson)
            .create(NotificationsApi::class.java)
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    private fun enqueueJson(body: String, code: Int = 200) {
        server.enqueue(
            MockResponse().setResponseCode(code)
                .setHeader("Content-Type", "application/json")
                .setBody(body),
        )
    }

    // ---- list ------------------------------------------------------------

    @Test
    fun `list decodes the feed page and the keyset cursor`() = runBlocking {
        enqueueJson(pageJson)

        val response = api.list()

        assertEquals("/v1/notifications", server.takeRequest().path)
        assertEquals(listOf("nt1", "nt2", "nt3"), response.notifications.map { it.id })
        assertEquals("cur-2", response.nextCursor)
        val first = response.notifications[0]
        assertEquals(NotificationCategories.PAYMENT, first.category)
        assertEquals("R$", first.chip)
        assertEquals("wallet", first.route)
        assertNull(first.readAt)
        // The chipless/routeless/bodyless attendance row stays decodable.
        val third = response.notifications[2]
        assertNull(third.chip)
        assertNull(third.route)
        assertNull(third.body)
    }

    @Test
    fun `list passes the cursor as a query param`() = runBlocking {
        enqueueJson("""{"notifications":[],"nextCursor":null}""")

        val response = api.list(cursor = "cur-2")

        assertEquals("/v1/notifications?cursor=cur-2", server.takeRequest().path)
        assertTrue(response.notifications.isEmpty())
        assertNull(response.nextCursor) // last page
    }

    // ---- unread count ----------------------------------------------------

    @Test
    fun `unreadCount decodes the bell dot source`() = runBlocking {
        enqueueJson("""{"count":4}""")

        val response = api.unreadCount()

        assertEquals("/v1/notifications/unread-count", server.takeRequest().path)
        assertEquals(4, response.count)
    }

    // ---- mark read -------------------------------------------------------

    @Test
    fun `markRead posts on the row and decodes the flipped row`() = runBlocking {
        enqueueJson(
            """
            {"notification":{"id":"nt1","category":"payment","chip":"R$",
              "title":"Mensalidade de agosto disponível","body":null,"route":"wallet",
              "readAt":"2026-08-10T13:00:00.000Z","createdAt":"2026-08-10T12:00:00.000Z"}}
            """.trimIndent(),
        )

        val response = api.markRead("nt1")

        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/v1/notifications/nt1/read", request.path)
        assertEquals("2026-08-10T13:00:00.000Z", response.notification.readAt)
    }

    @Test
    fun `readAll posts and decodes the flipped-row count`() = runBlocking {
        enqueueJson("""{"updated":7}""")

        val response = api.readAll()

        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/v1/notifications/read-all", request.path)
        assertEquals(7, response.updated)
    }

    // ---- settings --------------------------------------------------------

    @Test
    fun `settings reads the perfil switch state`() = runBlocking {
        enqueueJson("""{"enabled":true}""")

        val response = api.settings()

        val request = server.takeRequest()
        assertEquals("GET", request.method)
        assertEquals("/v1/notifications/settings", request.path)
        assertTrue(response.enabled)
    }

    @Test
    fun `updateSettings puts the mute flip and decodes the new state`() = runBlocking {
        enqueueJson("""{"enabled":false}""")

        val response = api.updateSettings(UpdateNotificationSettingsRequest(enabled = false))

        val request = server.takeRequest()
        assertEquals("PUT", request.method)
        assertEquals("/v1/notifications/settings", request.path)
        assertTrue(request.body.readUtf8().contains(""""enabled":false"""))
        assertFalse(response.enabled)
    }
}
