package br.com.tatame.testutil

import br.com.tatame.core.agenda.AgendaRepository
import br.com.tatame.core.network.ApiError
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.dto.AgendaOccupancy
import br.com.tatame.core.network.dto.AlunoAgendaClass
import br.com.tatame.core.network.dto.AlunoAgendaResponse
import br.com.tatame.core.network.dto.BeltRef
import br.com.tatame.core.network.dto.CalendarBuckets
import br.com.tatame.core.network.dto.CalendarClassItem
import br.com.tatame.core.network.dto.CalendarResponse

/** Configurable in-memory [AgendaRepository] for ViewModel tests (AGD.7/8). */
class FakeAgendaRepository : AgendaRepository {

    var agendaResult: ApiResult<AlunoAgendaResponse> = ApiResult.Failure(ApiError.Network)
    var alunoCalendarResult: ApiResult<CalendarResponse> = ApiResult.Failure(ApiError.Network)
    var professorCalendarResult: ApiResult<CalendarResponse> = ApiResult.Failure(ApiError.Network)

    /** Recorded `weekday` arguments — null entries are server-default (today) fetches. */
    val agendaCalls = mutableListOf<Int?>()
    val alunoCalendarCalls = mutableListOf<String?>()
    val professorCalendarCalls = mutableListOf<String?>()

    override suspend fun alunoAgenda(weekday: Int?): ApiResult<AlunoAgendaResponse> {
        agendaCalls += weekday
        return agendaResult
    }

    override suspend fun alunoCalendar(month: String?): ApiResult<CalendarResponse> {
        alunoCalendarCalls += month
        return alunoCalendarResult
    }

    override suspend fun professorCalendar(month: String?): ApiResult<CalendarResponse> {
        professorCalendarCalls += month
        return professorCalendarResult
    }
}

// ---- fixture builders ----------------------------------------------------

fun agendaClass(
    classId: String = "c1",
    className: String = "Fundamentos",
    startTime: String = "19:00",
    endTime: String = "20:00",
    checkedIn: Boolean = false,
    minBelt: BeltRef? = null,
    maxBelt: BeltRef? = null,
    ageMin: Int? = null,
    ageMax: Int? = null,
) = AlunoAgendaClass(
    classId = classId,
    className = className,
    startTime = startTime,
    endTime = endTime,
    professorName = "Rafael Souza",
    ageMin = ageMin,
    ageMax = ageMax,
    minBelt = minBelt,
    maxBelt = maxBelt,
    occupancy = AgendaOccupancy(active = 18, capacity = 24),
    checkedIn = checkedIn,
)

fun agendaResponse(
    weekday: Int = 1,
    isToday: Boolean = false,
    classes: List<AlunoAgendaClass> = listOf(agendaClass()),
) = AlunoAgendaResponse(weekday = weekday, isToday = isToday, classes = classes)

fun calendarItem(
    classId: String = "c1",
    className: String = "Fundamentos",
    startTime: String = "19:00",
    endTime: String = "20:00",
) = CalendarClassItem(
    classId = classId,
    className = className,
    startTime = startTime,
    endTime = endTime,
    professorName = "Rafael Souza",
    occupancy = AgendaOccupancy(active = 18, capacity = 24),
)

/** Buckets keyed by API weekday (0 = Sunday … 6 = Saturday). */
fun calendarBuckets(vararg buckets: Pair<Int, List<CalendarClassItem>>): CalendarBuckets {
    val byDay = buckets.toMap()
    return CalendarBuckets(
        sunday = byDay[0].orEmpty(),
        monday = byDay[1].orEmpty(),
        tuesday = byDay[2].orEmpty(),
        wednesday = byDay[3].orEmpty(),
        thursday = byDay[4].orEmpty(),
        friday = byDay[5].orEmpty(),
        saturday = byDay[6].orEmpty(),
    )
}

fun calendarResponse(
    month: String = "2026-08",
    buckets: CalendarBuckets = calendarBuckets(1 to listOf(calendarItem())),
) = CalendarResponse(month = month, classesByWeekday = buckets)
