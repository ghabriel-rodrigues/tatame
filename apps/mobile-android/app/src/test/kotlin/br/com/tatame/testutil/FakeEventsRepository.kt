package br.com.tatame.testutil

import br.com.tatame.core.events.EventsRepository
import br.com.tatame.core.network.ApiError
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.dto.AlunoEventDetailResponse
import br.com.tatame.core.network.dto.AlunoEventItem
import br.com.tatame.core.network.dto.CalendarEventItem
import br.com.tatame.core.network.dto.EventRegistrationState
import br.com.tatame.core.network.dto.EventRegistrationStatuses
import br.com.tatame.core.network.dto.EventResponsible
import br.com.tatame.core.network.dto.RegisterEventResponse
import br.com.tatame.core.network.dto.ResponsavelEvent
import br.com.tatame.core.network.dto.ResponsavelEventDependent
import br.com.tatame.core.network.dto.ResponsavelEventsResponse

/** Configurable in-memory [EventsRepository] for ViewModel tests (EVT.12/13). */
class FakeEventsRepository : EventsRepository {

    var detailResult: ApiResult<AlunoEventDetailResponse> = ApiResult.Failure(ApiError.Network)
    var registerResult: ApiResult<RegisterEventResponse> = ApiResult.Failure(ApiError.Network)
    var cancelResult: ApiResult<Unit> = ApiResult.Success(Unit)
    var responsavelEventsResult: ApiResult<ResponsavelEventsResponse> =
        ApiResult.Failure(ApiError.Network)
    var responsavelRegisterResult: ApiResult<RegisterEventResponse> =
        ApiResult.Failure(ApiError.Network)
    var responsavelCancelResult: ApiResult<Unit> = ApiResult.Success(Unit)

    val detailCalls = mutableListOf<String>()
    val registerCalls = mutableListOf<String>()
    val cancelCalls = mutableListOf<String>()
    var responsavelEventsCalls = 0
    val responsavelRegisterCalls = mutableListOf<Pair<String, String>>()
    val responsavelCancelCalls = mutableListOf<Pair<String, String>>()

    override suspend fun alunoEventDetail(eventId: String): ApiResult<AlunoEventDetailResponse> {
        detailCalls += eventId
        return detailResult
    }

    override suspend fun alunoRegister(eventId: String): ApiResult<RegisterEventResponse> {
        registerCalls += eventId
        return registerResult
    }

    override suspend fun alunoCancelRegistration(eventId: String): ApiResult<Unit> {
        cancelCalls += eventId
        return cancelResult
    }

    override suspend fun responsavelEvents(): ApiResult<ResponsavelEventsResponse> {
        responsavelEventsCalls++
        return responsavelEventsResult
    }

    override suspend fun responsavelRegister(
        eventId: String,
        studentId: String,
    ): ApiResult<RegisterEventResponse> {
        responsavelRegisterCalls += eventId to studentId
        return responsavelRegisterResult
    }

    override suspend fun responsavelCancelRegistration(
        eventId: String,
        studentId: String,
    ): ApiResult<Unit> {
        responsavelCancelCalls += eventId to studentId
        return responsavelCancelResult
    }
}

// ---- fixture builders ----------------------------------------------------

fun registrationState(
    id: String = "reg1",
    status: String = EventRegistrationStatuses.CONFIRMED,
    chargeId: String? = null,
) = EventRegistrationState(id = id, status = status, chargeId = chargeId)

fun eventDetail(
    id: String = "ev1",
    name: String = "Open mat de verão",
    priceCents: Long? = null,
    registration: EventRegistrationState? = null,
    date: String? = "2026-08-15",
    time: String? = "10:00",
    location: String? = "Tatame principal",
) = AlunoEventDetailResponse(
    id = id,
    name = name,
    bannerPreset = "event-purple-pink",
    location = location,
    startsAt = date?.let { "${it}T13:00:00.000Z" },
    date = date,
    time = time,
    priceCents = priceCents,
    description = "Treino aberto para todas as faixas.",
    responsible = EventResponsible(userId = "u-prof", fullName = "Rafael Nunes"),
    registration = registration,
)

fun alunoEventItem(
    id: String = "ev1",
    name: String = "Open mat de verão",
    priceCents: Long? = null,
    registration: EventRegistrationState? = null,
    date: String? = "2026-08-15",
) = AlunoEventItem(
    id = id,
    name = name,
    bannerPreset = "event-purple-pink",
    location = "Tatame principal",
    startsAt = date?.let { "${it}T13:00:00.000Z" },
    date = date,
    time = "10:00",
    priceCents = priceCents,
    registration = registration,
)

fun calendarEventItem(
    id: String = "ev1",
    name: String = "Open mat de verão",
    date: String? = "2026-08-15",
    time: String? = "10:00",
    priceCents: Long? = null,
) = CalendarEventItem(
    id = id,
    name = name,
    bannerPreset = "event-purple-pink",
    location = "Tatame principal",
    startsAt = date?.let { "${it}T13:00:00.000Z" },
    date = date,
    time = time,
    priceCents = priceCents,
)

fun registerResponse(
    status: String = EventRegistrationStatuses.CONFIRMED,
    chargeId: String? = null,
) = RegisterEventResponse(
    registration = registrationState(status = status, chargeId = chargeId),
    chargeId = chargeId,
)

fun responsavelDependent(
    studentId: String = "dst1",
    fullName: String = "Pedro Silveira",
    registration: EventRegistrationState? = null,
) = ResponsavelEventDependent(
    studentId = studentId,
    fullName = fullName,
    registration = registration,
)

fun responsavelEvent(
    id: String = "ev1",
    name: String = "Festival Kids",
    priceCents: Long? = 6_000,
    dependents: List<ResponsavelEventDependent> = listOf(
        responsavelDependent(),
        responsavelDependent(studentId = "dst2", fullName = "Júlia Silveira"),
    ),
) = ResponsavelEvent(
    id = id,
    name = name,
    bannerPreset = "event-purple-pink",
    location = "Ginásio Municipal",
    startsAt = "2026-09-13T12:30:00.000Z",
    date = "2026-09-13",
    time = "09:30",
    priceCents = priceCents,
    description = null,
    dependents = dependents,
)

fun responsavelEvents(vararg events: ResponsavelEvent) =
    ResponsavelEventsResponse(events = events.toList())
