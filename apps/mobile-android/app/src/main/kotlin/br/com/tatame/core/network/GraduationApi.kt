package br.com.tatame.core.network

import br.com.tatame.core.network.dto.AlunoGraduationResponse
import br.com.tatame.core.network.dto.AwardGraduationRequest
import br.com.tatame.core.network.dto.AwardGraduationResponse
import br.com.tatame.core.network.dto.CreateStudentNoteRequest
import br.com.tatame.core.network.dto.ProfessorProfileResponse
import br.com.tatame.core.network.dto.StudentNoteResponse
import br.com.tatame.core.network.dto.StudentNotesResponse
import br.com.tatame.core.network.dto.StudentProfileResponse
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/**
 * Hand-written thin Retrofit interface over the graduation surface (spec 005)
 * — same fallback convention as [AuthApi]/[EnrollmentApi]/[AttendanceApi]
 * (rationale in app/build.gradle.kts `generateApiClient`).
 *
 * Ownership is server-side: a foreign student id behaves as 404. The award
 * route is gated by the `graduation.update` permission toggle (professor);
 * admin surfaces (rules, revoke) are web-console only and NOT mirrored here.
 */
interface GraduationApi {

    // ---- aluno (GRD.19) --------------------------------------------------

    @GET("v1/aluno/graduation")
    suspend fun alunoGraduation(): AlunoGraduationResponse

    // ---- professor perfil do aluno & awards (GRD.20) ---------------------

    @GET("v1/professor/students/{id}/profile")
    suspend fun studentProfile(@Path("id") studentId: String): StudentProfileResponse

    @POST("v1/professor/students/{id}/graduations")
    suspend fun award(
        @Path("id") studentId: String,
        @Body body: AwardGraduationRequest,
    ): AwardGraduationResponse

    // ---- professor observações (GRD.20) ----------------------------------

    @GET("v1/professor/students/{id}/notes")
    suspend fun listNotes(@Path("id") studentId: String): StudentNotesResponse

    @POST("v1/professor/students/{id}/notes")
    suspend fun createNote(
        @Path("id") studentId: String,
        @Body body: CreateStudentNoteRequest,
    ): StudentNoteResponse

    // ---- professor own profile (GRD.20) ----------------------------------

    @GET("v1/professor/profile")
    suspend fun professorProfile(): ProfessorProfileResponse
}
