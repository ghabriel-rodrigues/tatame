package br.com.tatame.core.events

import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.EventsApi
import br.com.tatame.core.network.ProblemJson
import br.com.tatame.core.network.apiCall
import br.com.tatame.core.network.dto.AlunoEventDetailResponse
import br.com.tatame.core.network.dto.RegisterEventResponse
import br.com.tatame.core.network.dto.ResponsavelEventsResponse
import kotlinx.serialization.json.Json

/**
 * Seam the events feature ViewModels talk through (fakeable in JVM tests) —
 * same convention as [br.com.tatame.core.billing.BillingRepository]. Paid
 * flows stop at the returned `chargeId`: payment itself rides the existing
 * billing repository (spec 008 — events never touches the provider port).
 */
interface EventsRepository {
    // aluno (EVT.12)
    suspend fun alunoEventDetail(eventId: String): ApiResult<AlunoEventDetailResponse>
    suspend fun alunoRegister(eventId: String): ApiResult<RegisterEventResponse>
    suspend fun alunoCancelRegistration(eventId: String): ApiResult<Unit>

    // responsável (EVT.13)
    suspend fun responsavelEvents(): ApiResult<ResponsavelEventsResponse>
    suspend fun responsavelRegister(
        eventId: String,
        studentId: String,
    ): ApiResult<RegisterEventResponse>
    suspend fun responsavelCancelRegistration(
        eventId: String,
        studentId: String,
    ): ApiResult<Unit>
}

class EventsRepositoryImpl(
    private val api: EventsApi,
    private val json: Json = ProblemJson,
) : EventsRepository {

    override suspend fun alunoEventDetail(eventId: String): ApiResult<AlunoEventDetailResponse> =
        apiCall(json) { api.alunoEventDetail(eventId) }

    override suspend fun alunoRegister(eventId: String): ApiResult<RegisterEventResponse> =
        apiCall(json) { api.alunoRegister(eventId) }

    override suspend fun alunoCancelRegistration(eventId: String): ApiResult<Unit> =
        apiCall(json) { api.alunoCancelRegistration(eventId) }

    override suspend fun responsavelEvents(): ApiResult<ResponsavelEventsResponse> =
        apiCall(json) { api.responsavelEvents() }

    override suspend fun responsavelRegister(
        eventId: String,
        studentId: String,
    ): ApiResult<RegisterEventResponse> =
        apiCall(json) { api.responsavelRegister(eventId, studentId) }

    override suspend fun responsavelCancelRegistration(
        eventId: String,
        studentId: String,
    ): ApiResult<Unit> =
        apiCall(json) { api.responsavelCancelRegistration(eventId, studentId) }
}
