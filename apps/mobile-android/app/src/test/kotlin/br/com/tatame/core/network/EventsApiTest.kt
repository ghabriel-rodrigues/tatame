package br.com.tatame.core.network

import br.com.tatame.core.di.buildRetrofit
import br.com.tatame.core.network.dto.AlunoAgendaResponse
import br.com.tatame.core.network.dto.AlunoHomeResponse
import br.com.tatame.core.network.dto.CalendarResponse
import br.com.tatame.core.network.dto.EventRegistrationStatuses
import br.com.tatame.core.network.dto.ProfessorDashboardResponse
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * EVT.12/13 — hand-written [EventsApi] against MockWebServer: paths, verbs
 * and spec-mirroring DTO decoding (same doctrine as BillingApiTest). Also
 * pins the events arrays folded into the existing home/agenda/calendar/
 * dashboard responses (spec 008 fills the Phase-7 stable contracts
 * shape-additively).
 */
class EventsApiTest {

    private lateinit var server: MockWebServer
    private lateinit var api: EventsApi

    private val eventDetailJson = """
        {"id":"ev1","name":"Open mat de verão","bannerPreset":"event-purple-pink",
         "location":"Tatame principal","startsAt":"2026-08-15T13:00:00.000Z",
         "date":"2026-08-15","time":"10:00","priceCents":null,
         "description":"Treino aberto para todas as faixas.",
         "responsible":{"userId":"u-prof","fullName":"Rafael Nunes"},
         "registration":null}
    """.trimIndent()

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        api = buildRetrofit(server.url("/").toString(), OkHttpClient(), ProblemJson)
            .create(EventsApi::class.java)
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

    // ---- aluno (EVT.12) --------------------------------------------------

    @Test
    fun `alunoEventDetail decodes the aluno-10 payload`() = runBlocking {
        enqueueJson(eventDetailJson)

        val response = api.alunoEventDetail("ev1")

        assertEquals("/v1/aluno/events/ev1", server.takeRequest().path)
        assertEquals("Open mat de verão", response.name)
        assertEquals("event-purple-pink", response.bannerPreset)
        assertNull(response.priceCents) // null = gratuito (charter rule)
        assertEquals("Rafael Nunes", response.responsible.fullName)
        assertNull(response.registration)
    }

    @Test
    fun `alunoRegister posts and decodes the paid pending shape`() = runBlocking {
        enqueueJson(
            """
            {"registration":{"id":"reg1","status":"pending_payment","chargeId":"ch-ev1"},
             "chargeId":"ch-ev1"}
            """.trimIndent(),
            code = 201,
        )

        val response = api.alunoRegister("ev1")

        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/v1/aluno/events/ev1/registration", request.path)
        assertEquals(EventRegistrationStatuses.PENDING_PAYMENT, response.registration.status)
        assertEquals("ch-ev1", response.chargeId)
    }

    @Test
    fun `alunoCancelRegistration deletes the registration`() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(204))

        api.alunoCancelRegistration("ev1")

        val request = server.takeRequest()
        assertEquals("DELETE", request.method)
        assertEquals("/v1/aluno/events/ev1/registration", request.path)
    }

    // ---- responsável (EVT.13) --------------------------------------------

    @Test
    fun `responsavelEvents decodes per-dependent registration states`() = runBlocking {
        enqueueJson(
            """
            {"events":[{"id":"ev1","name":"Festival Kids","bannerPreset":"event-purple-pink",
              "location":"Ginásio Municipal","startsAt":"2026-09-13T12:30:00.000Z",
              "date":"2026-09-13","time":"09:30","priceCents":6000,"description":null,
              "dependents":[
                {"studentId":"dst1","fullName":"Pedro Silveira",
                 "registration":{"id":"reg1","status":"confirmed","chargeId":null}},
                {"studentId":"dst2","fullName":"Júlia Silveira","registration":null}]}]}
            """.trimIndent(),
        )

        val response = api.responsavelEvents()

        assertEquals("/v1/responsavel/events", server.takeRequest().path)
        val event = response.events.single()
        assertEquals(6_000L, event.priceCents)
        // Pedro confirmed never implies Júlia confirmed (spec story 21).
        assertEquals(
            EventRegistrationStatuses.CONFIRMED,
            event.dependents[0].registration?.status,
        )
        assertNull(event.dependents[1].registration)
    }

    @Test
    fun `responsavelRegister posts per dependent`() = runBlocking {
        enqueueJson(
            """
            {"registration":{"id":"reg2","status":"pending_payment","chargeId":"ch-ev2"},
             "chargeId":"ch-ev2"}
            """.trimIndent(),
            code = 201,
        )

        val response = api.responsavelRegister("ev1", "dst2")

        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/v1/responsavel/events/ev1/registrations/dst2", request.path)
        assertEquals("ch-ev2", response.chargeId)
    }

    @Test
    fun `responsavelCancelRegistration deletes per dependent`() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(204))

        api.responsavelCancelRegistration("ev1", "dst1")

        val request = server.takeRequest()
        assertEquals("DELETE", request.method)
        assertEquals("/v1/responsavel/events/ev1/registrations/dst1", request.path)
    }

    // ---- events folded into the existing stable contracts ----------------

    @Test
    fun `home agenda calendar and dashboard decode their events arrays`() {
        val home = ProblemJson.decodeFromString(
            AlunoHomeResponse.serializer(),
            """
            {"student":{"id":"st1","fullName":"Lucas Almeida"},
             "stats":{"monthPresencePct":86,"monthAttendedSessions":12,"monthTotalSessions":14,
                      "streak":6,"totalLessons":26},
             "upcomingEvents":[{"id":"ev1","name":"Open mat de verão",
               "bannerPreset":"event-purple-pink","location":"Tatame principal",
               "date":"2026-08-15","time":"10:00","priceCents":null,
               "registration":{"id":"reg1","status":"confirmed","chargeId":null}}]}
            """.trimIndent(),
        )
        assertEquals(
            EventRegistrationStatuses.CONFIRMED,
            home.upcomingEvents.single().registration?.status,
        )

        val agenda = ProblemJson.decodeFromString(
            AlunoAgendaResponse.serializer(),
            """
            {"weekday":6,"isToday":true,"classes":[],
             "events":[{"id":"ev1","name":"Open mat de verão",
               "bannerPreset":"event-purple-pink","date":"2026-08-15","time":"10:00",
               "priceCents":null,"registration":null}]}
            """.trimIndent(),
        )
        assertEquals("Open mat de verão", agenda.events.single().name)

        val calendar = ProblemJson.decodeFromString(
            CalendarResponse.serializer(),
            """
            {"month":"2026-08",
             "classesByWeekday":{"0":[],"1":[],"2":[],"3":[],"4":[],"5":[],"6":[]},
             "events":[{"id":"ev1","name":"Open mat de verão",
               "bannerPreset":"event-purple-pink","date":"2026-08-15","time":"10:00",
               "priceCents":6000}]}
            """.trimIndent(),
        )
        assertEquals(6_000L, calendar.events.single().priceCents)

        val dashboard = ProblemJson.decodeFromString(
            ProfessorDashboardResponse.serializer(),
            """
            {"alunosHoje":24,"presencaMediaPct":82.0,"todayClasses":[],
             "upcomingEventsCount":2,
             "upcomingEvents":[{"id":"ev1","name":"Open mat de verão",
               "bannerPreset":"event-purple-pink","date":"2026-08-15","time":"10:00",
               "priceCents":null,"confirmedCount":18}]}
            """.trimIndent(),
        )
        assertEquals(2, dashboard.upcomingEventsCount)
        assertEquals(18, dashboard.upcomingEvents.single().confirmedCount)
        assertTrue(dashboard.upcomingEvents.single().priceCents == null)
    }
}
