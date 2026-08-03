package br.com.tatame.core.network

import br.com.tatame.core.network.dto.AddRosterStudentRequest
import br.com.tatame.core.network.dto.ClassDetailResponse
import br.com.tatame.core.network.dto.ClassListResponse
import br.com.tatame.core.network.dto.ClassSuggestionResponse
import br.com.tatame.core.network.dto.DependentListResponse
import br.com.tatame.core.network.dto.DependentResponse
import br.com.tatame.core.network.dto.EnrollmentResultResponse
import br.com.tatame.core.network.dto.RegisterDependentRequest
import br.com.tatame.core.network.dto.RegisterDependentResponse
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Hand-written thin Retrofit interface over the enrollment surface
 * (`/v1/professor/classes…`, `/v1/responsavel/…`) — same fallback convention
 * as [AuthApi] (rationale in app/build.gradle.kts `generateApiClient`).
 *
 * Ownership is server-side: a class the professor does not teach or a
 * dependent that is not the caller's behaves as a 404 (spec 003 stories
 * 28/35) — this client never filters.
 */
interface EnrollmentApi {

    // ---- professor (ENR.21/22) -----------------------------------------

    @GET("v1/professor/classes")
    suspend fun professorClasses(): ClassListResponse

    @GET("v1/professor/classes/{id}")
    suspend fun professorClassDetail(@Path("id") id: String): ClassDetailResponse

    @POST("v1/professor/classes/{id}/students")
    suspend fun professorAddStudent(
        @Path("id") id: String,
        @Body body: AddRosterStudentRequest,
    ): EnrollmentResultResponse

    @DELETE("v1/professor/classes/{id}/students/{studentId}")
    suspend fun professorRemoveStudent(
        @Path("id") id: String,
        @Path("studentId") studentId: String,
    ): EnrollmentResultResponse

    // ---- responsável (ENR.22/23) ---------------------------------------

    @GET("v1/responsavel/dependents")
    suspend fun dependents(): DependentListResponse

    @GET("v1/responsavel/dependents/{id}")
    suspend fun dependent(@Path("id") id: String): DependentResponse

    @POST("v1/responsavel/dependents")
    suspend fun registerDependent(@Body body: RegisterDependentRequest): RegisterDependentResponse

    @GET("v1/responsavel/class-suggestion")
    suspend fun classSuggestion(@Query("birthDate") birthDate: String): ClassSuggestionResponse
}
