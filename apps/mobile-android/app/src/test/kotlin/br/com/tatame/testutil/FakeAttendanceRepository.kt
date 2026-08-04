package br.com.tatame.testutil

import br.com.tatame.core.attendance.AttendanceRepository
import br.com.tatame.core.attendance.LiveStreamClient
import br.com.tatame.core.attendance.LiveStreamEvent
import br.com.tatame.core.network.ApiError
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.dto.AlunoHomeResponse
import br.com.tatame.core.network.dto.AlunoStats
import br.com.tatame.core.network.dto.AlunoStudentRef
import br.com.tatame.core.network.dto.AlunoTodayClass
import br.com.tatame.core.network.dto.AttendanceRef
import br.com.tatame.core.network.dto.CheckinResponse
import br.com.tatame.core.network.dto.CheckinSessionRef
import br.com.tatame.core.network.dto.CheckinStatus
import br.com.tatame.core.network.dto.LiveCodeResponse
import br.com.tatame.core.network.dto.LiveSession
import br.com.tatame.core.network.dto.LiveSnapshotResponse
import br.com.tatame.core.network.dto.MarkAttendanceResponse
import br.com.tatame.core.network.dto.MarkAttendanceResult
import br.com.tatame.core.network.dto.ProfessorDashboardResponse
import br.com.tatame.core.network.dto.ProfessorStudent
import br.com.tatame.core.network.dto.RevokeAttendanceResponse
import br.com.tatame.core.network.dto.RollCallResponse
import br.com.tatame.core.network.dto.RollCallRosterRow
import br.com.tatame.core.network.dto.RosterAttendance
import br.com.tatame.core.network.dto.SnapshotAttendance
import br.com.tatame.core.network.dto.SnapshotCode
import br.com.tatame.core.network.dto.StreamTicketResponse
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.FlowCollector
import kotlinx.coroutines.flow.flow

/** Configurable in-memory [AttendanceRepository] for ViewModel tests. */
class FakeAttendanceRepository : AttendanceRepository {

    var checkinResult: ApiResult<CheckinResponse> = ApiResult.Failure(ApiError.Network)
    var homeResult: ApiResult<AlunoHomeResponse> = ApiResult.Failure(ApiError.Network)
    var openLiveResult: ApiResult<LiveCodeResponse> = ApiResult.Failure(ApiError.Network)
    var closeLiveResult: ApiResult<LiveCodeResponse> = ApiResult.Failure(ApiError.Network)
    var snapshotResult: ApiResult<LiveSnapshotResponse> = ApiResult.Failure(ApiError.Network)
    var ticketResult: ApiResult<StreamTicketResponse> =
        ApiResult.Success(StreamTicketResponse(ticket = "ticket-1", expiresInSeconds = 60.0))
    var rollCallResult: ApiResult<RollCallResponse> = ApiResult.Failure(ApiError.Network)
    var markResult: ApiResult<MarkAttendanceResponse> = ApiResult.Failure(ApiError.Network)
    var revokeResult: ApiResult<RevokeAttendanceResponse> = ApiResult.Failure(ApiError.Network)
    var dashboardResult: ApiResult<ProfessorDashboardResponse> = ApiResult.Failure(ApiError.Network)
    var studentsResult: ApiResult<List<ProfessorStudent>> = ApiResult.Success(emptyList())

    val qrCalls = mutableListOf<String>()
    val codeCalls = mutableListOf<String>()
    val manualCalls = mutableListOf<String>()
    var homeCalls = 0
    val openLiveCalls = mutableListOf<String>()
    val closeLiveCalls = mutableListOf<String>()
    val snapshotCalls = mutableListOf<String>()
    val ticketCalls = mutableListOf<String>()
    val rollCallCalls = mutableListOf<String>()
    val markCalls = mutableListOf<Pair<String, String>>()
    val revokeCalls = mutableListOf<String>()
    var dashboardCalls = 0
    val studentsCalls = mutableListOf<String?>()

    override suspend fun checkInQr(qrToken: String): ApiResult<CheckinResponse> {
        qrCalls += qrToken
        return checkinResult
    }

    override suspend fun checkInCode(code: String): ApiResult<CheckinResponse> {
        codeCalls += code
        return checkinResult
    }

    override suspend fun checkInManual(classId: String): ApiResult<CheckinResponse> {
        manualCalls += classId
        return checkinResult
    }

    override suspend fun alunoHome(): ApiResult<AlunoHomeResponse> {
        homeCalls++
        return homeResult
    }

    override suspend fun openLiveCode(classId: String): ApiResult<LiveCodeResponse> {
        openLiveCalls += classId
        return openLiveResult
    }

    override suspend fun closeLiveCode(liveCodeId: String): ApiResult<LiveCodeResponse> {
        closeLiveCalls += liveCodeId
        return closeLiveResult
    }

    override suspend fun liveSnapshot(liveCodeId: String): ApiResult<LiveSnapshotResponse> {
        snapshotCalls += liveCodeId
        return snapshotResult
    }

    override suspend fun mintStreamTicket(liveCodeId: String): ApiResult<StreamTicketResponse> {
        ticketCalls += liveCodeId
        return ticketResult
    }

    override suspend fun openRollCall(classId: String): ApiResult<RollCallResponse> {
        rollCallCalls += classId
        return rollCallResult
    }

    override suspend fun markAttendance(
        sessionId: String,
        studentId: String,
    ): ApiResult<MarkAttendanceResponse> {
        markCalls += sessionId to studentId
        return markResult
    }

    override suspend fun revokeAttendance(attendanceId: String): ApiResult<RevokeAttendanceResponse> {
        revokeCalls += attendanceId
        return revokeResult
    }

    override suspend fun dashboard(): ApiResult<ProfessorDashboardResponse> {
        dashboardCalls++
        return dashboardResult
    }

    override suspend fun students(notEnrolledInClassId: String?): ApiResult<List<ProfessorStudent>> {
        studentsCalls += notEnrolledInClassId
        return studentsResult
    }
}

/**
 * Scriptable [LiveStreamClient]: each connect consumes one script entry.
 * With the script exhausted, connects fail — the fallback path in tests
 * stays deterministic.
 */
class FakeLiveStreamClient : LiveStreamClient {

    sealed interface Script {
        /** Fail the connection immediately. */
        data object Fail : Script

        /** Emit [events] then suspend until cancelled (a healthy stream). */
        data class EmitThenHang(val events: List<LiveStreamEvent>) : Script

        /** Emit [events] then drop with a failure. */
        data class EmitThenFail(val events: List<LiveStreamEvent>) : Script
    }

    val script = ArrayDeque<Script>()
    val connections = mutableListOf<Pair<String, String>>()

    override fun stream(liveCodeId: String, ticket: String): Flow<LiveStreamEvent> = flow {
        connections += liveCodeId to ticket
        when (val entry = script.removeFirstOrNull() ?: Script.Fail) {
            is Script.Fail -> throw br.com.tatame.core.attendance.LiveStreamException("scripted failure")
            is Script.EmitThenHang -> {
                emitAll(entry.events)
                awaitCancellation()
            }
            is Script.EmitThenFail -> {
                emitAll(entry.events)
                throw br.com.tatame.core.attendance.LiveStreamException("scripted drop")
            }
        }
    }

    private suspend fun FlowCollector<LiveStreamEvent>.emitAll(events: List<LiveStreamEvent>) {
        events.forEach { emit(it) }
    }
}

// ---- fixture builders ----------------------------------------------------

fun alunoStats(
    presencePct: Double = 86.0,
    streak: Int? = 6,
    totalLessons: Int = 26,
) = AlunoStats(
    monthPresencePct = presencePct,
    monthAttendedSessions = 12,
    monthTotalSessions = 14,
    streak = streak,
    totalLessons = totalLessons,
)

fun alunoToday(
    classId: String = "c1",
    className: String = "Open mat",
    checkedIn: Boolean = false,
) = AlunoTodayClass(
    classId = classId,
    className = className,
    slot = slot(startTime = "10:00", durationMinutes = 120),
    checkedIn = checkedIn,
)

fun alunoHome(
    todayClass: AlunoTodayClass? = alunoToday(),
    stats: AlunoStats = alunoStats(),
) = AlunoHomeResponse(
    student = AlunoStudentRef(id = "st1", fullName = "Lucas Almeida"),
    todayClass = todayClass,
    stats = stats,
)

fun checkinResponse(
    status: String = CheckinStatus.CHECKED_IN,
    classId: String = "c1",
    stats: AlunoStats = alunoStats(presencePct = 88.0, streak = 7, totalLessons = 27),
) = CheckinResponse(
    status = status,
    attendance = AttendanceRef(
        id = "a1",
        classSessionId = "cs1",
        method = "code",
        checkedInAt = "2026-08-03T13:02:00Z",
    ),
    session = CheckinSessionRef(
        id = "cs1",
        classId = classId,
        className = "Open mat",
        sessionDate = "2026-08-03",
    ),
    stats = stats,
)

fun liveSession(classId: String = "c1") = LiveSession(
    id = "cs1",
    classId = classId,
    className = "Open mat",
    sessionDate = "2026-08-03",
    startsAt = "2026-08-03T13:00:00Z",
    status = "scheduled",
)

fun liveCode(
    id: String = "lc1",
    code: String = "4729",
    presentCount: Int = 0,
    expiresAt: String = "2026-08-03T14:15:00Z",
) = LiveCodeResponse(
    id = id,
    code = code,
    qrToken = "qr-token-$id",
    expiresAt = expiresAt,
    revokedAt = null,
    session = liveSession(),
    presentCount = presentCount,
)

fun snapshotAttendance(
    id: String,
    name: String = "Aluno $id",
    method: String = "qr",
) = SnapshotAttendance(
    id = id,
    studentId = "st-$id",
    studentName = name,
    method = method,
    checkedInAt = "2026-08-03T13:05:00Z",
)

fun liveSnapshot(
    presentCount: Int = 0,
    attendances: List<SnapshotAttendance> = emptyList(),
) = LiveSnapshotResponse(
    presentCount = presentCount,
    code = SnapshotCode(id = "lc1", expiresAt = "2026-08-03T14:15:00Z", revokedAt = null),
    attendances = attendances,
)

fun rollCallRow(
    studentId: String,
    name: String = "Aluno $studentId",
    attendance: RosterAttendance? = null,
) = RollCallRosterRow(studentId = studentId, fullName = name, attendance = attendance)

fun selfAttendance(id: String = "a1", method: String = "qr") =
    RosterAttendance(id = id, method = method, checkedInAt = "2026-08-03T13:05:00Z", recordedByUserId = null)

fun rollCallResponse(
    rows: List<RollCallRosterRow>,
    presentCount: Int = rows.count { it.attendance != null },
) = RollCallResponse(session = liveSession(), presentCount = presentCount, roster = rows)

fun markResponse(
    status: String = CheckinStatus.CHECKED_IN,
    attendanceId: String = "a-new",
    studentId: String = "s1",
    presentCount: Int = 1,
) = MarkAttendanceResponse(
    status = status,
    attendance = MarkAttendanceResult(
        id = attendanceId,
        classSessionId = "cs1",
        studentId = studentId,
        checkedInAt = "2026-08-03T13:10:00Z",
    ),
    presentCount = presentCount,
)

fun revokeResponse(
    attendanceId: String = "a1",
    presentCount: Int = 0,
    status: String = "revoked",
) = RevokeAttendanceResponse(status = status, attendanceId = attendanceId, presentCount = presentCount)

fun professorStudent(id: String, name: String = "Aluno $id", badge: String = "ativo") =
    ProfessorStudent(id = id, fullName = name, birthDate = "2010-04-20", badge = badge)
