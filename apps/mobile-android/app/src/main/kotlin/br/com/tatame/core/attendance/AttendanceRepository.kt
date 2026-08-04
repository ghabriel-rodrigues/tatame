package br.com.tatame.core.attendance

import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.AttendanceApi
import br.com.tatame.core.network.ProblemJson
import br.com.tatame.core.network.apiCall
import br.com.tatame.core.network.dto.AlunoHomeResponse
import br.com.tatame.core.network.dto.CheckinMethods
import br.com.tatame.core.network.dto.CheckinRequest
import br.com.tatame.core.network.dto.CheckinResponse
import br.com.tatame.core.network.dto.LiveCodeResponse
import br.com.tatame.core.network.dto.LiveSnapshotResponse
import br.com.tatame.core.network.dto.MarkAttendanceRequest
import br.com.tatame.core.network.dto.MarkAttendanceResponse
import br.com.tatame.core.network.dto.ProfessorDashboardResponse
import br.com.tatame.core.network.dto.ProfessorStudent
import br.com.tatame.core.network.dto.RevokeAttendanceRequest
import br.com.tatame.core.network.dto.RevokeAttendanceResponse
import br.com.tatame.core.network.dto.RollCallResponse
import br.com.tatame.core.network.dto.StreamTicketResponse
import br.com.tatame.core.network.map
import kotlinx.serialization.json.Json

/**
 * Seam the attendance feature ViewModels talk through (fakeable in JVM
 * tests) — same convention as [br.com.tatame.core.enrollment.EnrollmentRepository].
 * One repository method per check-in method keeps the request-shape rule
 * (`method` + its single payload field) in one place.
 */
interface AttendanceRepository {
    // aluno (ATT.19)
    suspend fun checkInQr(qrToken: String): ApiResult<CheckinResponse>
    suspend fun checkInCode(code: String): ApiResult<CheckinResponse>
    suspend fun checkInManual(classId: String): ApiResult<CheckinResponse>
    suspend fun alunoHome(): ApiResult<AlunoHomeResponse>

    // professor chamada ao vivo (ATT.20)
    suspend fun openLiveCode(classId: String): ApiResult<LiveCodeResponse>
    suspend fun closeLiveCode(liveCodeId: String): ApiResult<LiveCodeResponse>
    suspend fun liveSnapshot(liveCodeId: String): ApiResult<LiveSnapshotResponse>
    suspend fun mintStreamTicket(liveCodeId: String): ApiResult<StreamTicketResponse>

    // professor chamada manual (ATT.21)
    suspend fun openRollCall(classId: String): ApiResult<RollCallResponse>
    suspend fun markAttendance(sessionId: String, studentId: String): ApiResult<MarkAttendanceResponse>
    suspend fun revokeAttendance(attendanceId: String): ApiResult<RevokeAttendanceResponse>

    // professor dashboard & students (ATT.21)
    suspend fun dashboard(): ApiResult<ProfessorDashboardResponse>
    suspend fun students(notEnrolledInClassId: String? = null): ApiResult<List<ProfessorStudent>>
}

class AttendanceRepositoryImpl(
    private val api: AttendanceApi,
    private val json: Json = ProblemJson,
) : AttendanceRepository {

    override suspend fun checkInQr(qrToken: String): ApiResult<CheckinResponse> =
        apiCall(json) { api.checkIn(CheckinRequest(method = CheckinMethods.QR, qrToken = qrToken)) }

    override suspend fun checkInCode(code: String): ApiResult<CheckinResponse> =
        apiCall(json) { api.checkIn(CheckinRequest(method = CheckinMethods.CODE, code = code)) }

    override suspend fun checkInManual(classId: String): ApiResult<CheckinResponse> =
        apiCall(json) { api.checkIn(CheckinRequest(method = CheckinMethods.MANUAL, classId = classId)) }

    override suspend fun alunoHome(): ApiResult<AlunoHomeResponse> =
        apiCall(json) { api.alunoHome() }

    override suspend fun openLiveCode(classId: String): ApiResult<LiveCodeResponse> =
        apiCall(json) { api.openLiveCode(classId) }

    override suspend fun closeLiveCode(liveCodeId: String): ApiResult<LiveCodeResponse> =
        apiCall(json) { api.closeLiveCode(liveCodeId) }

    override suspend fun liveSnapshot(liveCodeId: String): ApiResult<LiveSnapshotResponse> =
        apiCall(json) { api.liveSnapshot(liveCodeId) }

    override suspend fun mintStreamTicket(liveCodeId: String): ApiResult<StreamTicketResponse> =
        apiCall(json) { api.mintStreamTicket(liveCodeId) }

    override suspend fun openRollCall(classId: String): ApiResult<RollCallResponse> =
        apiCall(json) { api.openRollCall(classId) }

    override suspend fun markAttendance(
        sessionId: String,
        studentId: String,
    ): ApiResult<MarkAttendanceResponse> =
        apiCall(json) { api.markAttendance(sessionId, MarkAttendanceRequest(studentId)) }

    override suspend fun revokeAttendance(attendanceId: String): ApiResult<RevokeAttendanceResponse> =
        apiCall(json) { api.revokeAttendance(attendanceId, RevokeAttendanceRequest()) }

    override suspend fun dashboard(): ApiResult<ProfessorDashboardResponse> =
        apiCall(json) { api.dashboard() }

    override suspend fun students(notEnrolledInClassId: String?): ApiResult<List<ProfessorStudent>> =
        apiCall(json) { api.students(notEnrolledInClassId) }.map { it.students }
}
