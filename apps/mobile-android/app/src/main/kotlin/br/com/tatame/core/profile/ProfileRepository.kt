package br.com.tatame.core.profile

import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.ProblemJson
import br.com.tatame.core.network.ProfileApi
import br.com.tatame.core.network.apiCall
import br.com.tatame.core.network.dto.AlunoProfileResponse
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject

/**
 * Full editable field set of one Salvar (spec 013, REP.13 — aluno-18). Every
 * field here is SENT on save — `null` means "clear on the server" (nullable
 * columns), which is why the wire body is a [JsonObject] with explicit nulls
 * (the shared Json drops nulls from data classes). [cpf]/[rg] are the
 * exception: null = omitted from the payload entirely (locked or untouched —
 * write-once fields are never cleared). Email/birthDate are never sent
 * (read-only; sending them is a server 422 `profile.field_read_only`).
 */
data class ProfileUpdate(
    val fullName: String,
    val gender: String? = null,
    val phone: String? = null,
    val cpf: String? = null, // omitted when null (write-once)
    val rg: String? = null, // omitted when null (write-once)
    val addressLine: String? = null,
    val addressCity: String? = null,
    val addressState: String? = null,
    val addressZip: String? = null,
    val emergencyContactName: String? = null,
    val emergencyContactPhone: String? = null,
)

/**
 * Seam the Dados pessoais ViewModel talks through (fakeable in JVM tests) —
 * same convention as [br.com.tatame.core.graduation.GraduationRepository].
 */
interface ProfileRepository {
    suspend fun profile(): ApiResult<AlunoProfileResponse>
    suspend fun update(update: ProfileUpdate): ApiResult<AlunoProfileResponse>
}

class ProfileRepositoryImpl(
    private val api: ProfileApi,
    private val json: Json = ProblemJson,
) : ProfileRepository {

    override suspend fun profile(): ApiResult<AlunoProfileResponse> =
        apiCall(json) { api.profile() }

    override suspend fun update(update: ProfileUpdate): ApiResult<AlunoProfileResponse> =
        apiCall(json) { api.update(update.toBody()) }
}

/** Wire shape: explicit nulls clear; cpf/rg omitted when null (write-once). */
internal fun ProfileUpdate.toBody(): JsonObject = buildJsonObject {
    put("fullName", JsonPrimitive(fullName))
    put("gender", gender.toJson())
    put("phone", phone.toJson())
    cpf?.let { put("cpf", JsonPrimitive(it)) }
    rg?.let { put("rg", JsonPrimitive(it)) }
    put("addressLine", addressLine.toJson())
    put("addressCity", addressCity.toJson())
    put("addressState", addressState.toJson())
    put("addressZip", addressZip.toJson())
    put("emergencyContactName", emergencyContactName.toJson())
    put("emergencyContactPhone", emergencyContactPhone.toJson())
}

private fun String?.toJson() = this?.let(::JsonPrimitive) ?: JsonNull
