package br.com.tatame.core.network

import br.com.tatame.core.network.dto.AlunoAgendaResponse
import br.com.tatame.core.network.dto.CalendarResponse
import retrofit2.http.GET
import retrofit2.http.Query

/**
 * Hand-written thin Retrofit interface over the agenda read models (spec 007)
 * — same fallback convention as [AuthApi]/[AttendanceApi] (rationale in
 * app/build.gradle.kts `generateApiClient`). Reads only: nothing in this
 * surface materializes a `class_sessions` row.
 */
interface AgendaApi {

    // ---- aluno agenda (AGD.7) --------------------------------------------

    /** `weekday` 0 = Sunday … 6 = Saturday; omitted = today in the tenant timezone. */
    @GET("v1/aluno/agenda")
    suspend fun alunoAgenda(@Query("weekday") weekday: Int? = null): AlunoAgendaResponse

    // ---- persona month calendars (AGD.8) ---------------------------------

    /** `month` "YYYY-MM"; omitted = current tenant-local month (v1 windows only the empty events). */
    @GET("v1/aluno/calendar")
    suspend fun alunoCalendar(@Query("month") month: String? = null): CalendarResponse

    @GET("v1/professor/calendar")
    suspend fun professorCalendar(@Query("month") month: String? = null): CalendarResponse
}
