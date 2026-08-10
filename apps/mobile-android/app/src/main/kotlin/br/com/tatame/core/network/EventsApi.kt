package br.com.tatame.core.network

import br.com.tatame.core.network.dto.AlunoEventDetailResponse
import br.com.tatame.core.network.dto.RegisterEventResponse
import br.com.tatame.core.network.dto.ResponsavelEventsResponse
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/**
 * Hand-written thin Retrofit interface over the aluno/responsável events
 * surface (spec 008, EVT.5/6) — same fallback convention as
 * [AuthApi]/[BillingApi] (rationale in app/build.gradle.kts
 * `generateApiClient`). Money never flows through here: paid registrations
 * return a `chargeId` that the existing [BillingApi] wallet rails settle
 * (Pix sheet + gated simulate). Admin event routes are web-console only and
 * NOT mirrored here.
 */
interface EventsApi {

    // ---- aluno (EVT.5, aluno-10) -----------------------------------------

    @GET("v1/aluno/events/{id}")
    suspend fun alunoEventDetail(@Path("id") eventId: String): AlunoEventDetailResponse

    /** Free ⇒ confirmed on the spot; paid ⇒ pending_payment + event charge. */
    @POST("v1/aluno/events/{id}/registration")
    suspend fun alunoRegister(@Path("id") eventId: String): RegisterEventResponse

    /** 204; cancels free/pending (a pending cancel also cancels its open charge). */
    @DELETE("v1/aluno/events/{id}/registration")
    suspend fun alunoCancelRegistration(@Path("id") eventId: String)

    // ---- responsável (EVT.6, responsavel-06) -----------------------------

    @GET("v1/responsavel/events")
    suspend fun responsavelEvents(): ResponsavelEventsResponse

    /** Same free/paid semantics per dependent — the charge bills the guardian. */
    @POST("v1/responsavel/events/{id}/registrations/{studentId}")
    suspend fun responsavelRegister(
        @Path("id") eventId: String,
        @Path("studentId") studentId: String,
    ): RegisterEventResponse

    @DELETE("v1/responsavel/events/{id}/registrations/{studentId}")
    suspend fun responsavelCancelRegistration(
        @Path("id") eventId: String,
        @Path("studentId") studentId: String,
    )
}
