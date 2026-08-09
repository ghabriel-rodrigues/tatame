package br.com.tatame.core.graduation

import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.GraduationApi
import br.com.tatame.core.network.ProblemJson
import br.com.tatame.core.network.apiCall
import br.com.tatame.core.network.dto.AlunoGraduationResponse
import br.com.tatame.core.network.dto.AwardGraduationRequest
import br.com.tatame.core.network.dto.AwardGraduationResponse
import br.com.tatame.core.network.dto.CreateStudentNoteRequest
import br.com.tatame.core.network.dto.GraduationKinds
import br.com.tatame.core.network.dto.ProfessorProfileResponse
import br.com.tatame.core.network.dto.StudentNote
import br.com.tatame.core.network.dto.StudentProfileResponse
import br.com.tatame.core.network.map
import kotlinx.serialization.json.Json

/**
 * Seam the graduation feature ViewModels talk through (fakeable in JVM tests)
 * — same convention as [br.com.tatame.core.attendance.AttendanceRepository].
 * One method per award kind keeps the request-shape rule (`kind` + its
 * payload fields) in one place.
 */
interface GraduationRepository {
    // aluno (GRD.19)
    suspend fun alunoGraduation(): ApiResult<AlunoGraduationResponse>

    // professor perfil do aluno & awards (GRD.20)
    suspend fun studentProfile(studentId: String): ApiResult<StudentProfileResponse>
    suspend fun addDegree(studentId: String, notes: String?): ApiResult<AwardGraduationResponse>
    suspend fun promoteBelt(
        studentId: String,
        beltId: String,
        notes: String?,
    ): ApiResult<AwardGraduationResponse>

    // professor observações (GRD.20)
    suspend fun listNotes(studentId: String): ApiResult<List<StudentNote>>
    suspend fun createNote(studentId: String, body: String): ApiResult<StudentNote>

    // professor own profile (GRD.20)
    suspend fun professorProfile(): ApiResult<ProfessorProfileResponse>
}

class GraduationRepositoryImpl(
    private val api: GraduationApi,
    private val json: Json = ProblemJson,
) : GraduationRepository {

    override suspend fun alunoGraduation(): ApiResult<AlunoGraduationResponse> =
        apiCall(json) { api.alunoGraduation() }

    override suspend fun studentProfile(studentId: String): ApiResult<StudentProfileResponse> =
        apiCall(json) { api.studentProfile(studentId) }

    override suspend fun addDegree(
        studentId: String,
        notes: String?,
    ): ApiResult<AwardGraduationResponse> = apiCall(json) {
        api.award(studentId, AwardGraduationRequest(kind = GraduationKinds.DEGREE, notes = notes))
    }

    override suspend fun promoteBelt(
        studentId: String,
        beltId: String,
        notes: String?,
    ): ApiResult<AwardGraduationResponse> = apiCall(json) {
        api.award(
            studentId,
            AwardGraduationRequest(kind = GraduationKinds.BELT, beltId = beltId, notes = notes),
        )
    }

    override suspend fun listNotes(studentId: String): ApiResult<List<StudentNote>> =
        apiCall(json) { api.listNotes(studentId) }.map { it.notes }

    override suspend fun createNote(studentId: String, body: String): ApiResult<StudentNote> =
        apiCall(json) { api.createNote(studentId, CreateStudentNoteRequest(body)) }.map { it.note }

    override suspend fun professorProfile(): ApiResult<ProfessorProfileResponse> =
        apiCall(json) { api.professorProfile() }
}
