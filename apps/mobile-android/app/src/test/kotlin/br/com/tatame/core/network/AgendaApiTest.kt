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
 * AGD.7/8 — hand-written [AgendaApi] against MockWebServer: paths, query
 * params, and spec-mirroring DTO decoding (same doctrine as
 * AttendanceApiTest).
 */
class AgendaApiTest {

    private lateinit var server: MockWebServer
    private lateinit var api: AgendaApi

    private val agendaClassJson = """
        {"classId":"c1","className":"Fundamentos","startTime":"19:00","endTime":"20:00",
         "professorName":"Rafael Souza","ageMin":null,"ageMax":null,
         "minBelt":{"beltId":"b2","name":"Azul","colorSlug":"belt.blue","maxDegrees":4},
         "maxBelt":null,
         "occupancy":{"active":18,"capacity":24},"checkedIn":false}
    """.trimIndent()

    private val calendarJson = """
        {"month":"2026-08",
         "classesByWeekday":{
           "0":[],
           "1":[{"classId":"c1","className":"Fundamentos","startTime":"19:00","endTime":"20:00",
                 "professorName":"Rafael Souza","occupancy":{"active":18,"capacity":24}}],
           "2":[],"3":[],"4":[],"5":[],
           "6":[{"classId":"c2","className":"Open mat","startTime":"10:00","endTime":"12:00",
                 "professorName":"Rafael Souza","occupancy":{"active":9,"capacity":30}}]},
         "events":[]}
    """.trimIndent()

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        api = buildRetrofit(server.url("/").toString(), OkHttpClient(), ProblemJson)
            .create(AgendaApi::class.java)
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

    // ---- aluno agenda (AGD.7) --------------------------------------------

    @Test
    fun `alunoAgenda sends the weekday filter and decodes class slots`() = runBlocking {
        enqueueJson("""{"weekday":1,"isToday":false,"classes":[$agendaClassJson],"events":[]}""")

        val response = api.alunoAgenda(weekday = 1)

        assertEquals("/v1/aluno/agenda?weekday=1", server.takeRequest().path)
        assertEquals(1, response.weekday)
        assertFalse(response.isToday)
        val item = response.classes.single()
        assertEquals("Fundamentos", item.className)
        assertEquals("20:00", item.endTime)
        assertEquals("Azul", item.minBelt?.name)
        assertNull(item.maxBelt)
        assertEquals(18, item.occupancy.active)
        assertEquals(24, item.occupancy.capacity)
        assertFalse(item.checkedIn)
        assertTrue(response.events.isEmpty())
    }

    @Test
    fun `alunoAgenda omits the weekday when null and decodes the today check-in state`() =
        runBlocking {
            enqueueJson(
                """
                {"weekday":6,"isToday":true,
                 "classes":[{"classId":"c2","className":"Open mat","startTime":"10:00",
                             "endTime":"12:00","professorName":"Rafael Souza",
                             "ageMin":null,"ageMax":null,
                             "occupancy":{"active":9,"capacity":30},"checkedIn":true}],
                 "events":[]}
                """.trimIndent(),
            )

            val response = api.alunoAgenda()

            assertEquals("/v1/aluno/agenda", server.takeRequest().path)
            assertTrue(response.isToday)
            assertTrue(response.classes.single().checkedIn)
        }

    // ---- persona calendars (AGD.8) ---------------------------------------

    @Test
    fun `alunoCalendar sends the month and decodes weekday buckets`() = runBlocking {
        enqueueJson(calendarJson)

        val response = api.alunoCalendar(month = "2026-08")

        assertEquals("/v1/aluno/calendar?month=2026-08", server.takeRequest().path)
        assertEquals("2026-08", response.month)
        assertEquals("Fundamentos", response.classesByWeekday[1].single().className)
        assertEquals("Open mat", response.classesByWeekday[6].single().className)
        assertTrue(response.classesByWeekday[0].isEmpty())
        assertEquals(setOf(1, 6), response.classesByWeekday.nonEmptyWeekdays())
        assertTrue(response.events.isEmpty())
    }

    @Test
    fun `professorCalendar hits its own path and omits the month when null`() = runBlocking {
        enqueueJson(calendarJson)

        val response = api.professorCalendar()

        assertEquals("/v1/professor/calendar", server.takeRequest().path)
        assertEquals(9, response.classesByWeekday[6].single().occupancy.active)
    }
}
