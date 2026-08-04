package br.com.tatame.core.network

import br.com.tatame.core.network.dto.AlunoHomeResponse
import br.com.tatame.core.network.dto.CheckinRequest
import br.com.tatame.core.network.dto.CheckinResponse
import br.com.tatame.core.network.dto.LiveCodeResponse
import br.com.tatame.core.network.dto.LiveSnapshotResponse
import br.com.tatame.core.network.dto.MarkAttendanceRequest
import br.com.tatame.core.network.dto.MarkAttendanceResponse
import br.com.tatame.core.network.dto.ProfessorDashboardResponse
import br.com.tatame.core.network.dto.ProfessorStudentsResponse
import br.com.tatame.core.network.dto.RevokeAttendanceRequest
import br.com.tatame.core.network.dto.RevokeAttendanceResponse
import br.com.tatame.core.network.dto.RollCallResponse
import br.com.tatame.core.network.dto.StreamTicketResponse
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Hand-written thin Retrofit interface over the attendance surface (spec 004)
 * — same fallback convention as [AuthApi]/[EnrollmentApi] (rationale in
 * app/build.gradle.kts `generateApiClient`).
 *
 * The SSE stream route (`GET /v1/professor/live-codes/{id}/stream`) is the
 * documented contract exception and is NOT here — it is wired by
 * [br.com.tatame.core.attendance.OkHttpLiveStreamClient] over okhttp-sse.
 * Ownership is server-side: a foreign class/live code behaves as 404.
 */
interface AttendanceApi {

    // ---- aluno (ATT.19) --------------------------------------------------

    @POST("v1/aluno/checkins")
    suspend fun checkIn(@Body body: CheckinRequest): CheckinResponse

    @GET("v1/aluno/home")
    suspend fun alunoHome(): AlunoHomeResponse

    // ---- professor chamada ao vivo (ATT.20) ------------------------------

    @POST("v1/professor/classes/{id}/live-codes")
    suspend fun openLiveCode(@Path("id") classId: String): LiveCodeResponse

    @POST("v1/professor/live-codes/{id}/close")
    suspend fun closeLiveCode(@Path("id") liveCodeId: String): LiveCodeResponse

    @GET("v1/professor/live-codes/{id}/attendances")
    suspend fun liveSnapshot(@Path("id") liveCodeId: String): LiveSnapshotResponse

    @POST("v1/professor/live-codes/{id}/stream-ticket")
    suspend fun mintStreamTicket(@Path("id") liveCodeId: String): StreamTicketResponse

    // ---- professor chamada manual (ATT.21) -------------------------------

    @POST("v1/professor/classes/{id}/roll-call")
    suspend fun openRollCall(@Path("id") classId: String): RollCallResponse

    @POST("v1/professor/sessions/{id}/attendances")
    suspend fun markAttendance(
        @Path("id") sessionId: String,
        @Body body: MarkAttendanceRequest,
    ): MarkAttendanceResponse

    @POST("v1/professor/attendances/{id}/revoke")
    suspend fun revokeAttendance(
        @Path("id") attendanceId: String,
        @Body body: RevokeAttendanceRequest = RevokeAttendanceRequest(),
    ): RevokeAttendanceResponse

    // ---- professor dashboard & students (ATT.21) -------------------------

    @GET("v1/professor/dashboard")
    suspend fun dashboard(): ProfessorDashboardResponse

    @GET("v1/professor/students")
    suspend fun students(
        @Query("notEnrolledInClassId") notEnrolledInClassId: String? = null,
    ): ProfessorStudentsResponse
}
