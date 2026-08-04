package br.com.tatame.core.network

import br.com.tatame.core.di.buildRetrofit
import br.com.tatame.core.network.dto.CheckinRequest
import br.com.tatame.core.network.dto.CheckinMethods
import br.com.tatame.core.network.dto.CheckinStatus
import br.com.tatame.core.network.dto.MarkAttendanceRequest
import br.com.tatame.core.network.dto.RevokeAttendanceRequest
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
 * ATT.19–21 — hand-written [AttendanceApi] against MockWebServer: paths,
 * verbs, request bodies, and spec-mirroring DTO decoding (same doctrine as
 * EnrollmentApiTest).
 */
class AttendanceApiTest {

    private lateinit var server: MockWebServer
    private lateinit var api: AttendanceApi

    private val statsJson = """
        {"monthPresencePct":86,"monthAttendedSessions":12,"monthTotalSessions":14,
         "streak":6,"totalLessons":26}
    """.trimIndent()

    private val sessionJson = """
        {"id":"cs1","classId":"c1","className":"Open mat","sessionDate":"2026-08-03",
         "startsAt":"2026-08-03T13:00:00Z","status":"scheduled"}
    """.trimIndent()

    private fun liveCodeJson(revoked: Boolean = false) = """
        {"id":"lc1","code":"4729","qrToken":"opaque-token","expiresAt":"2026-08-03T14:15:00Z",
         "revokedAt":${if (revoked) "\"2026-08-03T13:30:00Z\"" else "null"},
         "session":$sessionJson,"presentCount":9}
    """.trimIndent()

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        api = buildRetrofit(server.url("/").toString(), OkHttpClient(), ProblemJson)
            .create(AttendanceApi::class.java)
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

    // ---- aluno (ATT.19) --------------------------------------------------

    @Test
    fun `checkIn posts method and its single payload field`() = runBlocking {
        enqueueJson(
            """
            {"status":"checked_in",
             "attendance":{"id":"a1","classSessionId":"cs1","method":"code",
                           "checkedInAt":"2026-08-03T13:02:00Z"},
             "session":{"id":"cs1","classId":"c1","className":"Open mat","sessionDate":"2026-08-03"},
             "stats":$statsJson}
            """.trimIndent(),
        )

        val response = api.checkIn(CheckinRequest(method = CheckinMethods.CODE, code = "4729"))

        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/v1/aluno/checkins", request.path)
        // explicitNulls=false drops the unused method fields — one write path, one payload.
        assertEquals("""{"method":"code","code":"4729"}""", request.body.readUtf8())
        assertEquals(CheckinStatus.CHECKED_IN, response.status)
        assertEquals(6, response.stats.streak)
        assertEquals("c1", response.session.classId)
    }

    @Test
    fun `alunoHome decodes today class and null streak when gamification is off`() = runBlocking {
        enqueueJson(
            """
            {"student":{"id":"st1","fullName":"Lucas Almeida"},
             "todayClass":{"classId":"c1","className":"Open mat",
                           "slot":{"weekday":1,"startTime":"10:00","durationMinutes":120},
                           "checkedIn":false},
             "stats":{"monthPresencePct":86,"monthAttendedSessions":12,"monthTotalSessions":14,
                      "streak":null,"totalLessons":26}}
            """.trimIndent(),
        )

        val response = api.alunoHome()

        assertEquals("/v1/aluno/home", server.takeRequest().path)
        assertEquals("Open mat", response.todayClass?.className)
        assertNull(response.stats.streak)
        assertEquals(26, response.stats.totalLessons)
    }

    // ---- professor chamada ao vivo (ATT.20) ------------------------------

    @Test
    fun `openLiveCode posts on the class path and decodes code and qr token`() = runBlocking {
        enqueueJson(liveCodeJson())

        val response = api.openLiveCode("c1")

        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/v1/professor/classes/c1/live-codes", request.path)
        assertEquals("4729", response.code)
        assertEquals("opaque-token", response.qrToken)
        assertEquals(9, response.presentCount)
        assertNull(response.revokedAt)
    }

    @Test
    fun `closeLiveCode posts on the live-code path and carries revokedAt`() = runBlocking {
        enqueueJson(liveCodeJson(revoked = true))

        val response = api.closeLiveCode("lc1")

        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/v1/professor/live-codes/lc1/close", request.path)
        assertEquals("2026-08-03T13:30:00Z", response.revokedAt)
    }

    @Test
    fun `liveSnapshot decodes active attendances only shape`() = runBlocking {
        enqueueJson(
            """
            {"presentCount":2,
             "code":{"id":"lc1","expiresAt":"2026-08-03T14:15:00Z","revokedAt":null},
             "attendances":[
               {"id":"a1","studentId":"s1","studentName":"Lucas Almeida","method":"qr",
                "checkedInAt":"2026-08-03T13:05:00Z"},
               {"id":"a2","studentId":"s2","studentName":"Tiago Mota","method":"manual",
                "checkedInAt":"2026-08-03T13:06:00Z"}]}
            """.trimIndent(),
        )

        val response = api.liveSnapshot("lc1")

        assertEquals("/v1/professor/live-codes/lc1/attendances", server.takeRequest().path)
        assertEquals(2, response.presentCount)
        assertEquals("manual", response.attendances[1].method)
    }

    @Test
    fun `mintStreamTicket posts and decodes the short-lived ticket`() = runBlocking {
        enqueueJson("""{"ticket":"signed.ticket","expiresInSeconds":60}""")

        val response = api.mintStreamTicket("lc1")

        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/v1/professor/live-codes/lc1/stream-ticket", request.path)
        assertEquals("signed.ticket", response.ticket)
    }

    // ---- professor chamada manual (ATT.21) -------------------------------

    @Test
    fun `openRollCall decodes roster with pre-toggled self check-ins`() = runBlocking {
        enqueueJson(
            """
            {"session":$sessionJson,"presentCount":1,
             "roster":[
               {"studentId":"s1","fullName":"Lucas Almeida",
                "attendance":{"id":"a1","method":"qr","checkedInAt":"2026-08-03T13:05:00Z",
                              "recordedByUserId":null}},
               {"studentId":"s2","fullName":"João Ferraz","attendance":null}]}
            """.trimIndent(),
        )

        val response = api.openRollCall("c1")

        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/v1/professor/classes/c1/roll-call", request.path)
        assertEquals(1, response.presentCount)
        assertNull(response.roster[0].attendance?.recordedByUserId) // self check-in
        assertNull(response.roster[1].attendance)
    }

    @Test
    fun `markAttendance posts the studentId body on the session path`() = runBlocking {
        enqueueJson(
            """
            {"status":"checked_in",
             "attendance":{"id":"a9","classSessionId":"cs1","studentId":"s2",
                           "checkedInAt":"2026-08-03T13:10:00Z"},
             "presentCount":2}
            """.trimIndent(),
        )

        val response = api.markAttendance("cs1", MarkAttendanceRequest("s2"))

        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/v1/professor/sessions/cs1/attendances", request.path)
        assertEquals("""{"studentId":"s2"}""", request.body.readUtf8())
        assertEquals(2, response.presentCount)
    }

    @Test
    fun `revokeAttendance posts on the attendance path`() = runBlocking {
        enqueueJson("""{"status":"revoked","attendanceId":"a9","presentCount":1}""")

        val response = api.revokeAttendance("a9", RevokeAttendanceRequest())

        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/v1/professor/attendances/a9/revoke", request.path)
        assertEquals("revoked", response.status)
        assertEquals(1, response.presentCount)
    }

    // ---- professor dashboard & students (ATT.21) -------------------------

    @Test
    fun `dashboard decodes tiles hero and today classes`() = runBlocking {
        enqueueJson(
            """
            {"alunosHoje":23,"presencaMediaPct":81,
             "nextClass":{"classId":"c1","className":"Open mat",
                          "slot":{"weekday":1,"startTime":"10:00","durationMinutes":120},
                          "checkedInCount":18},
             "todayClasses":[{"classId":"c1","className":"Open mat",
                              "slot":{"weekday":1,"startTime":"10:00","durationMinutes":120},
                              "checkedInCount":18,"enrolledCount":24}]}
            """.trimIndent(),
        )

        val response = api.dashboard()

        assertEquals("/v1/professor/dashboard", server.takeRequest().path)
        assertEquals(23, response.alunosHoje)
        assertEquals(18, response.nextClass?.checkedInCount)
        assertEquals(24, response.todayClasses.single().enrolledCount)
    }

    @Test
    fun `students sends the notEnrolledInClassId filter and omits it when null`() = runBlocking {
        enqueueJson(
            """{"students":[{"id":"s9","fullName":"Bia Andrade",
                "birthDate":"2010-04-20","badge":"pendente"}]}""",
        )
        val filtered = api.students(notEnrolledInClassId = "c1")
        assertEquals(
            "/v1/professor/students?notEnrolledInClassId=c1",
            server.takeRequest().path,
        )
        assertEquals("pendente", filtered.students.single().badge)

        enqueueJson("""{"students":[]}""")
        val unfiltered = api.students()
        assertEquals("/v1/professor/students", server.takeRequest().path)
        assertTrue(unfiltered.students.isEmpty())
    }
}
