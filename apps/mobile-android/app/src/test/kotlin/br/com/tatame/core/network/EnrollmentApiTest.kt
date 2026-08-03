package br.com.tatame.core.network

import br.com.tatame.core.di.buildRetrofit
import br.com.tatame.core.network.dto.AddRosterStudentRequest
import br.com.tatame.core.network.dto.RegisterDependentRequest
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
 * ENR.21–23 — hand-written [EnrollmentApi] against MockWebServer: paths,
 * verbs, request bodies, and spec-mirroring DTO decoding (same doctrine as
 * RefreshAuthenticatorTest: networking logic is pure-JVM testable).
 */
class EnrollmentApiTest {

    private lateinit var server: MockWebServer
    private lateinit var api: EnrollmentApi

    private val scheduleJson = """{"weekday":1,"startTime":"19:00","durationMinutes":90}"""
    private val professorJson = """{"userId":"p1","fullName":"Professor Um"}"""

    private fun classItemJson(id: String, lotada: Boolean = false) = """
        {"id":"$id","name":"Fundamentos","status":"active","capacity":24,"occupancy":24,
         "lotada":$lotada,"ageMin":null,"ageMax":null,
         "professor":$professorJson,"schedules":[$scheduleJson]}
    """.trimIndent()

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        api = buildRetrofit(server.url("/").toString(), OkHttpClient(), ProblemJson)
            .create(EnrollmentApi::class.java)
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

    @Test
    fun `professorClasses hits the list endpoint and decodes chips data`() = runBlocking {
        enqueueJson("""{"classes":[${classItemJson("c1", lotada = true)}]}""")

        val response = api.professorClasses()

        val request = server.takeRequest()
        assertEquals("GET", request.method)
        assertEquals("/v1/professor/classes", request.path)
        assertEquals(1, response.classes.size)
        val turma = response.classes.first()
        assertEquals("Fundamentos", turma.name)
        assertEquals(24, turma.occupancy)
        assertTrue(turma.lotada)
        assertNull(turma.ageMin)
        assertEquals(1, turma.schedules.first().weekday)
    }

    @Test
    fun `professorClassDetail decodes roster with derived badge`() = runBlocking {
        enqueueJson(
            """
            {"class":{"id":"c1","name":"Fundamentos","status":"active","capacity":24,
              "occupancy":1,"lotada":false,"ageMin":4,"ageMax":12,
              "professor":$professorJson,"schedules":[$scheduleJson],
              "roster":[{"studentId":"s1","fullName":"Tiago Mota",
                         "birthDate":"2010-04-20","badge":"pendente"}]}}
            """.trimIndent(),
        )

        val response = api.professorClassDetail("c1")

        val request = server.takeRequest()
        assertEquals("/v1/professor/classes/c1", request.path)
        assertEquals(4, response.classDetail.ageMin)
        assertEquals("pendente", response.classDetail.roster.first().badge)
    }

    @Test
    fun `professorAddStudent posts the studentId body`() = runBlocking {
        enqueueJson("""{"enrollment":{"classId":"c1","studentId":"s9","status":"active"}}""", 201)

        val response = api.professorAddStudent("c1", AddRosterStudentRequest("s9"))

        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/v1/professor/classes/c1/students", request.path)
        assertEquals("""{"studentId":"s9"}""", request.body.readUtf8())
        assertEquals("active", response.enrollment.status)
    }

    @Test
    fun `professorRemoveStudent issues DELETE on the nested path`() = runBlocking {
        enqueueJson("""{"enrollment":{"classId":"c1","studentId":"s1","status":"removed"}}""")

        val response = api.professorRemoveStudent("c1", "s1")

        val request = server.takeRequest()
        assertEquals("DELETE", request.method)
        assertEquals("/v1/professor/classes/c1/students/s1", request.path)
        assertEquals("removed", response.enrollment.status)
    }

    @Test
    fun `dependents decodes class and nextSlot including their absence`() = runBlocking {
        enqueueJson(
            """
            {"dependents":[
              {"id":"d1","fullName":"Pedro Silveira","birthDate":"2017-06-10","status":"active",
               "class":{"id":"c2","name":"Kids","schedules":[$scheduleJson],
                        "nextSlot":{"weekday":2,"startTime":"18:00","durationMinutes":60}}},
              {"id":"d2","fullName":"Júlia Silveira","birthDate":"2013-01-05","status":"active",
               "class":null}]}
            """.trimIndent(),
        )

        val response = api.dependents()

        assertEquals("/v1/responsavel/dependents", server.takeRequest().path)
        assertEquals("Kids", response.dependents[0].enrolledClass?.name)
        assertEquals(2, response.dependents[0].enrolledClass?.nextSlot?.weekday)
        assertNull(response.dependents[1].enrolledClass)
    }

    @Test
    fun `dependent detail hits the id path`() = runBlocking {
        enqueueJson(
            """{"dependent":{"id":"d1","fullName":"Pedro Silveira",
                "birthDate":"2017-06-10","status":"active","class":null}}""",
        )

        val response = api.dependent("d1")

        assertEquals("/v1/responsavel/dependents/d1", server.takeRequest().path)
        assertEquals("Pedro Silveira", response.dependent.fullName)
    }

    @Test
    fun `registerDependent posts fullName birthDate and accepted classId`() = runBlocking {
        enqueueJson(
            """{"dependent":{"id":"d3","fullName":"Bia","birthDate":"2019-02-01",
                "status":"active","class":null},"enrolled":true}""",
            201,
        )

        val response = api.registerDependent(
            RegisterDependentRequest(fullName = "Bia", birthDate = "2019-02-01", classId = "c2"),
        )

        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/v1/responsavel/dependents", request.path)
        assertEquals(
            """{"fullName":"Bia","birthDate":"2019-02-01","classId":"c2"}""",
            request.body.readUtf8(),
        )
        assertTrue(response.enrolled)
    }

    @Test
    fun `registerDependent omits classId when none accepted`() = runBlocking {
        enqueueJson(
            """{"dependent":{"id":"d3","fullName":"Bia","birthDate":"2019-02-01",
                "status":"active","class":null},"enrolled":false}""",
            201,
        )

        val response = api.registerDependent(
            RegisterDependentRequest(fullName = "Bia", birthDate = "2019-02-01", classId = null),
        )

        // explicitNulls=false drops the null key — story 34's "register anyway" shape.
        assertEquals(
            """{"fullName":"Bia","birthDate":"2019-02-01"}""",
            server.takeRequest().body.readUtf8(),
        )
        assertFalse(response.enrolled)
    }

    @Test
    fun `classSuggestion sends birthDate query and handles null suggestion`() = runBlocking {
        enqueueJson(
            """{"suggestion":{"id":"c2","name":"Kids","ageMin":4,"ageMax":12,
                "capacity":16,"occupancy":14,"schedules":[$scheduleJson]}}""",
        )
        val found = api.classSuggestion("2017-06-10")
        assertEquals(
            "/v1/responsavel/class-suggestion?birthDate=2017-06-10",
            server.takeRequest().path,
        )
        assertEquals("Kids", found.suggestion?.name)

        enqueueJson("""{"suggestion":null}""")
        val none = api.classSuggestion("1990-01-01")
        assertNull(none.suggestion)
    }
}
