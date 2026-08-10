// Hand-written mirror of the attendance surface of packages/shared/src/api/openapi.json
// (fallback per ticket mobile-android/02 — see app/build.gradle.kts `generateApiClient`).
// Field names MUST stay 1:1 with the spec; regenerate-by-hand on contract changes.

package br.com.tatame.core.network.dto

import kotlinx.serialization.Serializable

/** `attendance_method` enum values (schema/enums stay English per charter). */
object CheckinMethods {
    const val QR = "qr"
    const val CODE = "code"
    const val MANUAL = "manual"
}

/** `CheckinRequestDto` — exactly one of qrToken/code/classId per method. */
@Serializable
data class CheckinRequest(
    val method: String, // qr | code | manual
    val qrToken: String? = null,
    val code: String? = null,
    val classId: String? = null,
)

/** `AttendanceRefDto` */
@Serializable
data class AttendanceRef(
    val id: String,
    val classSessionId: String,
    val method: String,
    val checkedInAt: String,
)

/** `CheckinSessionRefDto` */
@Serializable
data class CheckinSessionRef(
    val id: String,
    val classId: String,
    val className: String,
    val sessionDate: String, // "2026-08-03"
)

/** `AlunoStatsDto` — `streak` is null when the academy disabled gamification.streak. */
@Serializable
data class AlunoStats(
    val monthPresencePct: Double,
    val monthAttendedSessions: Int,
    val monthTotalSessions: Int,
    val streak: Int?,
    val totalLessons: Int,
)

/** Stable duplicate states of `CheckinResponseDto.status` / `MarkAttendanceResponseDto.status`. */
object CheckinStatus {
    const val CHECKED_IN = "checked_in"
    const val ALREADY_CHECKED_IN = "already_checked_in"
}

/** `CheckinResponseDto` — duplicate attempts land here with `already_checked_in`, never an error. */
@Serializable
data class CheckinResponse(
    val status: String, // checked_in | already_checked_in
    val attendance: AttendanceRef,
    val session: CheckinSessionRef,
    val stats: AlunoStats,
)

/** `AlunoStudentRefDto` */
@Serializable
data class AlunoStudentRef(
    val id: String,
    val fullName: String,
)

/** `AlunoTodayClassDto` — `checkedIn=true` flips the hero to "Presença registrada". */
@Serializable
data class AlunoTodayClass(
    val classId: String,
    val className: String,
    val slot: ScheduleSlotView,
    val checkedIn: Boolean,
)

/**
 * `AlunoHomeResponseDto` — `graduation` is the real derived card payload
 * (GRD.7); `mensalidade` is the real "mensalidade em aberto" alert (spec 006,
 * story 7) deep-linking into the Carteira, null = nothing open;
 * `upcomingEvents` is "Próximos eventos": the next 2 published events with
 * own registration state (spec 008); `storeStrip` is the "Loja da academia"
 * strip — the first 3 active store products + "Ver tudo" (spec 009, additive).
 */
@Serializable
data class AlunoHomeResponse(
    val student: AlunoStudentRef,
    val todayClass: AlunoTodayClass? = null,
    val stats: AlunoStats,
    val graduation: AlunoHomeGraduation? = null,
    val mensalidade: MensalidadeAlert? = null,
    val upcomingEvents: List<AlunoEventItem> = emptyList(),
    val storeStrip: List<ProductCard> = emptyList(),
)

/** `LiveSessionDto` */
@Serializable
data class LiveSession(
    val id: String,
    val classId: String,
    val className: String,
    val sessionDate: String,
    val startsAt: String?,
    val status: String, // scheduled | done | canceled
)

/** `LiveCodeResponseDto` — the QR encodes `qrToken`, never the digits. */
@Serializable
data class LiveCodeResponse(
    val id: String,
    val code: String, // 4 digits
    val qrToken: String,
    val expiresAt: String,
    val revokedAt: String?,
    val session: LiveSession,
    val presentCount: Int,
)

/** `SnapshotCodeDto` */
@Serializable
data class SnapshotCode(
    val id: String,
    val expiresAt: String,
    val revokedAt: String?,
)

/** `SnapshotAttendanceDto` */
@Serializable
data class SnapshotAttendance(
    val id: String,
    val studentId: String,
    val studentName: String,
    val method: String,
    val checkedInAt: String,
)

/** `LiveSnapshotResponseDto` — active rows only; doubles as the 5 s polling target. */
@Serializable
data class LiveSnapshotResponse(
    val presentCount: Int,
    val code: SnapshotCode,
    val attendances: List<SnapshotAttendance>,
)

/** `StreamTicketResponseDto` — single-purpose ~60 s ticket, `?ticket=` on the stream route only. */
@Serializable
data class StreamTicketResponse(
    val ticket: String,
    val expiresInSeconds: Double,
)

/** `LiveStreamCheckinEventDto` (SSE `event: checkin` payload — contract exception). */
@Serializable
data class LiveStreamCheckinEvent(
    val attendanceId: String,
    val studentId: String,
    val studentName: String,
    val method: String,
    val checkedInAt: String,
    val presentCount: Int,
)

/** `LiveStreamRevokeEventDto` (SSE `event: revoke` payload). */
@Serializable
data class LiveStreamRevokeEvent(
    val attendanceId: String,
    val presentCount: Int,
)

/** `RosterAttendanceDto` — `recordedByUserId` null = self check-in; set = professor manual row. */
@Serializable
data class RosterAttendance(
    val id: String,
    val method: String,
    val checkedInAt: String,
    val recordedByUserId: String?,
)

/** `RosterRowDto` — self check-ins appear pre-toggled (attendance non-null). */
@Serializable
data class RollCallRosterRow(
    val studentId: String,
    val fullName: String,
    val attendance: RosterAttendance? = null,
)

/** `RollCallResponseDto` */
@Serializable
data class RollCallResponse(
    val session: LiveSession,
    val presentCount: Int,
    val roster: List<RollCallRosterRow>,
)

/** `MarkAttendanceDto` */
@Serializable
data class MarkAttendanceRequest(val studentId: String)

/** `MarkAttendanceResultDto` */
@Serializable
data class MarkAttendanceResult(
    val id: String,
    val classSessionId: String,
    val studentId: String,
    val checkedInAt: String,
)

/** `MarkAttendanceResponseDto` — a second toggle-on is benign (`already_checked_in`). */
@Serializable
data class MarkAttendanceResponse(
    val status: String, // checked_in | already_checked_in
    val attendance: MarkAttendanceResult,
    val presentCount: Int,
)

/** `RevokeAttendanceDto` */
@Serializable
data class RevokeAttendanceRequest(val reason: String? = null)

/** `RevokeAttendanceResponseDto` — a second toggle-off is benign (`already_revoked`). */
@Serializable
data class RevokeAttendanceResponse(
    val status: String, // revoked | already_revoked
    val attendanceId: String,
    val presentCount: Int,
)

/** `ProfessorNextClassDto` */
@Serializable
data class ProfessorNextClass(
    val classId: String,
    val className: String,
    val slot: ScheduleSlotView,
    val checkedInCount: Int,
)

/** `ProfessorTodayClassDto` */
@Serializable
data class ProfessorTodayClass(
    val classId: String,
    val className: String,
    val slot: ScheduleSlotView,
    val checkedInCount: Int,
    val enrolledCount: Int,
)

/**
 * `ProfessorDashboardResponseDto` — `upcomingEventsCount` is the "eventos
 * futuros" stat tile and `upcomingEvents` the read-only "Eventos futuros"
 * dashboard list (spec 008 retires the Phase-4 placeholder).
 */
@Serializable
data class ProfessorDashboardResponse(
    val alunosHoje: Int,
    val presencaMediaPct: Double,
    val nextClass: ProfessorNextClass? = null,
    val todayClasses: List<ProfessorTodayClass> = emptyList(),
    val upcomingEventsCount: Int = 0,
    val upcomingEvents: List<ProfessorUpcomingEvent> = emptyList(),
)

/** `ProfessorStudentDto` — the "Adicionar aluno" picker candidate; `belt` derived (GRD.6). */
@Serializable
data class ProfessorStudent(
    val id: String,
    val fullName: String,
    val birthDate: String,
    val badge: String, // ativo | pendente
    val belt: BeltView? = null,
)

/** `ProfessorStudentsResponseDto` */
@Serializable
data class ProfessorStudentsResponse(val students: List<ProfessorStudent>)
