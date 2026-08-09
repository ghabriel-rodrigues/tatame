package br.com.tatame.core.network

import br.com.tatame.core.di.buildRetrofit
import br.com.tatame.core.network.dto.AlunoHomeResponse
import br.com.tatame.core.network.dto.AwardGraduationRequest
import br.com.tatame.core.network.dto.CreateStudentNoteRequest
import br.com.tatame.core.network.dto.DependentListResponse
import br.com.tatame.core.network.dto.GraduationKinds
import br.com.tatame.core.network.dto.ProfessorStudentsResponse
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
 * GRD.19/20 — hand-written [GraduationApi] against MockWebServer: paths,
 * verbs, request bodies, and spec-mirroring DTO decoding (same doctrine as
 * AttendanceApiTest). Also covers the belt payload folded into existing
 * list/home responses (GRD.6 belt exposure).
 */
class GraduationApiTest {

    private lateinit var server: MockWebServer
    private lateinit var api: GraduationApi

    private val beltJson = """
        {"beltId":"b-blue","name":"Azul","colorSlug":"belt.blue","tipColorSlug":null,
         "maxDegrees":4,"degrees":2}
    """.trimIndent()

    private val progressJson = """
        {"current":26,"target":40,"label":"Próximo 3º grau",
         "nextMilestone":{"kind":"degree","degree":3}}
    """.trimIndent()

    private fun entryJson(
        kind: String = "degree",
        certificate: Boolean = false,
        reversed: Boolean = false,
    ) = """
        {"id":"g1","kind":"$kind",
         "belt":{"beltId":"b-blue","name":"Azul","colorSlug":"belt.blue","tipColorSlug":null,
                 "maxDegrees":4},
         "degree":2,"awardedAt":"2026-05-14T18:00:00.000Z",
         "awardedBy":{"userId":"u-prof","fullName":"Rafael Nunes"},
         "notes":"Constância exemplar.","reversed":$reversed,"reversesGraduationId":null,
         "certificateAvailable":$certificate}
    """.trimIndent()

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        api = buildRetrofit(server.url("/").toString(), OkHttpClient(), ProblemJson)
            .create(GraduationApi::class.java)
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

    // ---- aluno (GRD.19) --------------------------------------------------

    @Test
    fun `alunoGraduation decodes hero progress and timeline`() = runBlocking {
        enqueueJson(
            """
            {"belt":$beltJson,"progress":$progressJson,
             "timeline":[${entryJson()},${entryJson(kind = "belt", certificate = true)}]}
            """.trimIndent(),
        )

        val response = api.alunoGraduation()

        assertEquals("/v1/aluno/graduation", server.takeRequest().path)
        assertEquals("Azul", response.belt.name)
        assertEquals(2, response.belt.degrees)
        assertEquals(40, response.progress.target)
        assertEquals(3, response.progress.nextMilestone.degree)
        assertEquals(2, response.timeline.size)
        assertTrue(response.timeline[1].certificateAvailable)
        assertEquals("Rafael Nunes", response.timeline[0].awardedBy.fullName)
    }

    // ---- professor perfil do aluno & awards (GRD.20) ---------------------

    @Test
    fun `studentProfile decodes belt progress tiles and notes`() = runBlocking {
        enqueueJson(
            """
            {"student":{"id":"st1","fullName":"Lucas Almeida","birthDate":"2000-03-15",
                        "status":"active","badge":"ativo"},
             "belt":$beltJson,"progress":$progressJson,
             "stats":{"monthPresencePct":86,"monthAttendedSessions":14,"monthTotalSessions":16,
                      "streak":null,"totalLessons":38},
             "notes":[{"id":"n1","body":"Boa evolução.","createdAt":"2026-07-12T10:00:00.000Z",
                       "author":{"userId":"u-prof","fullName":"Rafael Nunes"}}]}
            """.trimIndent(),
        )

        val response = api.studentProfile("st1")

        assertEquals("/v1/professor/students/st1/profile", server.takeRequest().path)
        assertEquals("Lucas Almeida", response.student.fullName)
        assertEquals(4, response.belt.maxDegrees)
        assertEquals(14, response.stats.monthAttendedSessions)
        assertEquals("Boa evolução.", response.notes.single().body)
    }

    @Test
    fun `award posts kind degree with notes and no beltId`() = runBlocking {
        enqueueJson("""{"graduation":${entryJson()},"belt":$beltJson}""", code = 201)

        val response = api.award(
            "st1",
            AwardGraduationRequest(kind = GraduationKinds.DEGREE, notes = "Exame."),
        )

        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/v1/professor/students/st1/graduations", request.path)
        // explicitNulls=false drops the unused beltId — one write path, one payload.
        assertEquals("""{"kind":"degree","notes":"Exame."}""", request.body.readUtf8())
        assertEquals("Azul", response.belt.name)
    }

    @Test
    fun `award posts kind belt with the target beltId`() = runBlocking {
        enqueueJson("""{"graduation":${entryJson(kind = "belt")},"belt":$beltJson}""", code = 201)

        api.award("st1", AwardGraduationRequest(kind = GraduationKinds.BELT, beltId = "b-purple"))

        assertEquals(
            """{"kind":"belt","beltId":"b-purple"}""",
            server.takeRequest().body.readUtf8(),
        )
    }

    // ---- observações (GRD.20) --------------------------------------------

    @Test
    fun `notes list and create ride the student path`() = runBlocking {
        enqueueJson(
            """{"notes":[{"id":"n1","body":"Pediu foco.","createdAt":"2026-06-18T10:00:00.000Z",
                "author":{"userId":"u-prof","fullName":"Rafael Nunes"}}]}""",
        )
        val listed = api.listNotes("st1")
        assertEquals("/v1/professor/students/st1/notes", server.takeRequest().path)
        assertEquals("Pediu foco.", listed.notes.single().body)

        enqueueJson(
            """{"note":{"id":"n2","body":"Exame em setembro.","createdAt":"2026-08-01T10:00:00.000Z",
                "author":{"userId":"u-prof","fullName":"Rafael Nunes"}}}""",
            code = 201,
        )
        val created = api.createNote("st1", CreateStudentNoteRequest("Exame em setembro."))
        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/v1/professor/students/st1/notes", request.path)
        assertEquals("""{"body":"Exame em setembro."}""", request.body.readUtf8())
        assertEquals("n2", created.note.id)
    }

    // ---- professor own profile (GRD.20) ----------------------------------

    @Test
    fun `professorProfile decodes belt chip and graduações válidas`() = runBlocking {
        enqueueJson(
            """
            {"professor":{"userId":"u-prof","fullName":"Rafael Nunes"},
             "belt":{"beltId":"b-black","name":"Preta","colorSlug":"belt.black",
                     "tipColorSlug":"belt.red","maxDegrees":6,"degrees":2},
             "validGraduations":[
               {"beltId":"b-white","name":"Branca","colorSlug":"belt.white","tipColorSlug":null,
                "maxDegrees":4,"ladderKind":"adult","enabled":true},
               {"beltId":"b-orange","name":"Laranja","colorSlug":"belt.orange","tipColorSlug":null,
                "maxDegrees":4,"ladderKind":"kids","enabled":false}]}
            """.trimIndent(),
        )

        val response = api.professorProfile()

        assertEquals("/v1/professor/profile", server.takeRequest().path)
        assertEquals("belt.red", response.belt?.tipColorSlug)
        assertEquals(2, response.validGraduations.size)
        assertFalse(response.validGraduations[1].enabled)
        assertEquals("kids", response.validGraduations[1].ladderKind)
    }

    @Test
    fun `professorProfile tolerates a null belt chip`() = runBlocking {
        enqueueJson(
            """{"professor":{"userId":"u-prof","fullName":"Rafael Nunes"},
                "belt":null,"validGraduations":[]}""",
        )

        assertNull(api.professorProfile().belt)
    }

    // ---- belt exposure on existing responses (GRD.6) ---------------------

    @Test
    fun `home dependents and students responses decode the folded belt payload`() {
        val home = ProblemJson.decodeFromString(
            AlunoHomeResponse.serializer(),
            """
            {"student":{"id":"st1","fullName":"Lucas Almeida"},
             "stats":{"monthPresencePct":86,"monthAttendedSessions":12,"monthTotalSessions":14,
                      "streak":6,"totalLessons":26},
             "graduation":{"belt":$beltJson,"progress":$progressJson}}
            """.trimIndent(),
        )
        assertEquals(40, home.graduation?.progress?.target)
        assertEquals("belt.blue", home.graduation?.belt?.colorSlug)

        val dependents = ProblemJson.decodeFromString(
            DependentListResponse.serializer(),
            """
            {"dependents":[{"id":"d1","fullName":"Sofia Lima","birthDate":"2017-06-10",
              "status":"active","class":null,
              "belt":{"beltId":"b-gray","name":"Cinza","colorSlug":"belt.gray","tipColorSlug":null,
                      "maxDegrees":4,"degrees":1}}]}
            """.trimIndent(),
        )
        assertEquals("Cinza", dependents.dependents.single().belt?.name)

        val students = ProblemJson.decodeFromString(
            ProfessorStudentsResponse.serializer(),
            """
            {"students":[{"id":"s9","fullName":"Bia Andrade","birthDate":"2010-04-20",
              "badge":"ativo","belt":$beltJson}]}
            """.trimIndent(),
        )
        assertEquals(2, students.students.single().belt?.degrees)
    }
}
