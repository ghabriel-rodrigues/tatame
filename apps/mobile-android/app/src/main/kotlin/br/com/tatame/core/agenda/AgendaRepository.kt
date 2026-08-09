package br.com.tatame.core.agenda

import br.com.tatame.core.network.AgendaApi
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.ProblemJson
import br.com.tatame.core.network.apiCall
import br.com.tatame.core.network.dto.AlunoAgendaResponse
import br.com.tatame.core.network.dto.CalendarResponse
import kotlinx.serialization.json.Json

/**
 * Seam the agenda feature ViewModels talk through (fakeable in JVM tests) —
 * same convention as [br.com.tatame.core.attendance.AttendanceRepository].
 * Read-only by design: spec 007 ships two read models and zero writes.
 */
interface AgendaRepository {
    /** `weekday` null = today in the tenant timezone (server default). */
    suspend fun alunoAgenda(weekday: Int? = null): ApiResult<AlunoAgendaResponse>
    suspend fun alunoCalendar(month: String? = null): ApiResult<CalendarResponse>
    suspend fun professorCalendar(month: String? = null): ApiResult<CalendarResponse>
}

class AgendaRepositoryImpl(
    private val api: AgendaApi,
    private val json: Json = ProblemJson,
) : AgendaRepository {

    override suspend fun alunoAgenda(weekday: Int?): ApiResult<AlunoAgendaResponse> =
        apiCall(json) { api.alunoAgenda(weekday) }

    override suspend fun alunoCalendar(month: String?): ApiResult<CalendarResponse> =
        apiCall(json) { api.alunoCalendar(month) }

    override suspend fun professorCalendar(month: String?): ApiResult<CalendarResponse> =
        apiCall(json) { api.professorCalendar(month) }
}
