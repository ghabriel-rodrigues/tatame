package br.com.tatame.core.network

import br.com.tatame.core.di.buildRetrofit
import br.com.tatame.core.profile.ProfileRepositoryImpl
import br.com.tatame.core.profile.ProfileUpdate
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
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
 * REP.13 — hand-written [ProfileApi] + [ProfileRepositoryImpl] against
 * MockWebServer: paths, verbs, the explicit-null partial-update body
 * (write-once cpf/rg omitted), spec-mirroring DTO decoding, and the
 * profile-slice 422 problem codes mapping onto the sealed [ApiError] surface
 * (same doctrine as GraduationApiTest).
 */
class ProfileApiTest {

    private lateinit var server: MockWebServer
    private lateinit var api: ProfileApi

    private val profileJson = """
        {"fullName":"Lucas Almeida","email":"lucas.almeida@email.com","birthDate":"1998-03-14",
         "phone":"(11) 98765-4321","gender":"male",
         "cpf":"12345678909","cpfLocked":true,"rg":"12.345.678-9","rgLocked":true,
         "addressLine":"Rua das Palmeiras, 120, ap 42","addressCity":"São Paulo",
         "addressState":"SP","addressZip":"01310100",
         "emergencyContactName":"Carla Almeida","emergencyContactPhone":"(11) 91234-5678",
         "avatarUrl":null}
    """.trimIndent()

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        api = buildRetrofit(server.url("/").toString(), OkHttpClient(), ProblemJson)
            .create(ProfileApi::class.java)
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
    fun `profile GET decodes the aluno-18 read model with lock flags`() = runBlocking {
        enqueueJson(profileJson)

        val response = api.profile()

        assertEquals("/v1/aluno/profile", server.takeRequest().path)
        assertEquals("Lucas Almeida", response.fullName)
        assertEquals("1998-03-14", response.birthDate)
        assertTrue(response.cpfLocked)
        assertTrue(response.rgLocked)
        assertEquals("12345678909", response.cpf)
        assertEquals("SP", response.addressState)
        assertNull(response.avatarUrl)
    }

    @Test
    fun `profile GET tolerates an empty unlocked profile`() = runBlocking {
        enqueueJson(
            """{"fullName":"Novo Aluno","email":"novo@email.com","birthDate":null,
                "phone":null,"gender":null,"cpf":null,"cpfLocked":false,"rg":null,
                "rgLocked":false,"addressLine":null,"addressCity":null,"addressState":null,
                "addressZip":null,"emergencyContactName":null,"emergencyContactPhone":null,
                "avatarUrl":null}""",
        )

        val response = api.profile()

        assertFalse(response.cpfLocked)
        assertNull(response.cpf)
        assertNull(response.birthDate)
    }

    @Test
    fun `update PUTs explicit nulls for cleared fields and omits locked cpf and rg`() = runBlocking {
        enqueueJson(profileJson)
        val repository = ProfileRepositoryImpl(api)

        val result = repository.update(
            ProfileUpdate(
                fullName = "Lucas Almeida",
                gender = "male",
                phone = null, // cleared → explicit null on the wire
                cpf = null, // locked → omitted entirely (write-once)
                rg = null, // locked → omitted entirely (write-once)
                addressLine = "Rua das Palmeiras, 120",
                addressCity = "São Paulo",
                addressState = "SP",
                addressZip = "01310100",
                emergencyContactName = null,
                emergencyContactPhone = null,
            ),
        )

        val request = server.takeRequest()
        assertEquals("PUT", request.method)
        assertEquals("/v1/aluno/profile", request.path)
        val body = ProblemJson.decodeFromString(JsonObject.serializer(), request.body.readUtf8())
        assertEquals("Lucas Almeida", body["fullName"]?.jsonPrimitive?.content)
        assertEquals(JsonNull, body["phone"]) // cleared, not dropped
        assertEquals(JsonNull, body["emergencyContactName"])
        assertFalse("cpf" in body) // write-once: never re-sent once locked
        assertFalse("rg" in body)
        assertFalse("email" in body) // read-only facts never sent
        assertFalse("birthDate" in body)
        assertEquals("SP", body["addressState"]?.jsonPrimitive?.content)
        assertTrue(result is ApiResult.Success)
    }

    @Test
    fun `update sends cpf and rg while unlocked`() = runBlocking {
        enqueueJson(profileJson)
        val repository = ProfileRepositoryImpl(api)

        repository.update(
            ProfileUpdate(fullName = "Lucas Almeida", cpf = "12345678909", rg = "12.345.678-9"),
        )

        val body = ProblemJson.decodeFromString(
            JsonObject.serializer(),
            server.takeRequest().body.readUtf8(),
        )
        assertEquals("12345678909", body["cpf"]?.jsonPrimitive?.content)
        assertEquals("12.345.678-9", body["rg"]?.jsonPrimitive?.content)
    }

    @Test
    fun `a field_locked 422 maps to the sealed Profile error with its fields`() = runBlocking {
        enqueueJson(
            """{"type":"about:blank","title":"Unprocessable Entity","status":422,
                "code":"profile.field_locked",
                "detail":"CPF não pode ser alterado após definido",
                "errors":[{"field":"cpf","messages":["locked"]}]}""",
            code = 422,
        )
        val repository = ProfileRepositoryImpl(api)

        val result = repository.update(ProfileUpdate(fullName = "Lucas", cpf = "98765432100"))

        assertEquals(
            ApiError.Profile.FieldLocked(listOf("cpf")),
            (result as ApiResult.Failure).error,
        )
    }

    @Test
    fun `a field_read_only 422 maps to the sealed Profile error`() = runBlocking {
        enqueueJson(
            """{"status":422,"code":"profile.field_read_only",
                "errors":[{"field":"email","messages":["read-only field"]},
                          {"field":"birthDate","messages":["read-only field"]}]}""",
            code = 422,
        )
        val repository = ProfileRepositoryImpl(api)

        val result = repository.update(ProfileUpdate(fullName = "Lucas"))

        assertEquals(
            ApiError.Profile.FieldReadOnly(listOf("email", "birthDate")),
            (result as ApiResult.Failure).error,
        )
    }

    @Test
    fun `a validation 422 keeps the per-field messages`() = runBlocking {
        enqueueJson(
            """{"status":422,"code":"validation.failed",
                "errors":[{"field":"addressState","messages":["UF inválida"]},
                          {"field":"addressZip","messages":["CEP inválido — use 8 dígitos"]}]}""",
            code = 422,
        )
        val repository = ProfileRepositoryImpl(api)

        val result = repository.update(ProfileUpdate(fullName = "Lucas", addressState = "XX"))

        val error = (result as ApiResult.Failure).error
        assertTrue(error is ApiError.Validation)
        assertEquals(
            setOf("addressState", "addressZip"),
            (error as ApiError.Validation).fieldErrors.keys,
        )
    }
}
