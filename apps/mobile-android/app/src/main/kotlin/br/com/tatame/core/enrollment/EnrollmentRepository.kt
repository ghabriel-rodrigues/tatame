package br.com.tatame.core.enrollment

import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.EnrollmentApi
import br.com.tatame.core.network.ProblemJson
import br.com.tatame.core.network.apiCall
import br.com.tatame.core.network.dto.AddRosterStudentRequest
import br.com.tatame.core.network.dto.ClassDetail
import br.com.tatame.core.network.dto.ClassListItem
import br.com.tatame.core.network.dto.ClassSuggestion
import br.com.tatame.core.network.dto.DependentDetail
import br.com.tatame.core.network.dto.EnrollmentResult
import br.com.tatame.core.network.dto.RegisterDependentRequest
import br.com.tatame.core.network.dto.RegisterDependentResponse
import br.com.tatame.core.network.map
import kotlinx.serialization.json.Json

/**
 * Seam the enrollment feature ViewModels talk through (fakeable in JVM
 * tests) — same convention as [br.com.tatame.core.auth.AuthRepository].
 * Wraps [EnrollmentApi] with [apiCall] normalization and unwraps the
 * single-key response envelopes.
 */
interface EnrollmentRepository {
    suspend fun professorClasses(): ApiResult<List<ClassListItem>>
    suspend fun professorClassDetail(classId: String): ApiResult<ClassDetail>
    suspend fun addStudent(classId: String, studentId: String): ApiResult<EnrollmentResult>
    suspend fun removeStudent(classId: String, studentId: String): ApiResult<EnrollmentResult>
    suspend fun dependents(): ApiResult<List<DependentDetail>>
    suspend fun dependent(dependentId: String): ApiResult<DependentDetail>
    suspend fun registerDependent(
        fullName: String,
        birthDate: String,
        classId: String?,
    ): ApiResult<RegisterDependentResponse>
    suspend fun classSuggestion(birthDate: String): ApiResult<ClassSuggestion?>
}

class EnrollmentRepositoryImpl(
    private val api: EnrollmentApi,
    private val json: Json = ProblemJson,
) : EnrollmentRepository {

    override suspend fun professorClasses(): ApiResult<List<ClassListItem>> =
        apiCall(json) { api.professorClasses() }.map { it.classes }

    override suspend fun professorClassDetail(classId: String): ApiResult<ClassDetail> =
        apiCall(json) { api.professorClassDetail(classId) }.map { it.classDetail }

    override suspend fun addStudent(classId: String, studentId: String): ApiResult<EnrollmentResult> =
        apiCall(json) { api.professorAddStudent(classId, AddRosterStudentRequest(studentId)) }
            .map { it.enrollment }

    override suspend fun removeStudent(classId: String, studentId: String): ApiResult<EnrollmentResult> =
        apiCall(json) { api.professorRemoveStudent(classId, studentId) }.map { it.enrollment }

    override suspend fun dependents(): ApiResult<List<DependentDetail>> =
        apiCall(json) { api.dependents() }.map { it.dependents }

    override suspend fun dependent(dependentId: String): ApiResult<DependentDetail> =
        apiCall(json) { api.dependent(dependentId) }.map { it.dependent }

    override suspend fun registerDependent(
        fullName: String,
        birthDate: String,
        classId: String?,
    ): ApiResult<RegisterDependentResponse> = apiCall(json) {
        api.registerDependent(
            RegisterDependentRequest(fullName = fullName, birthDate = birthDate, classId = classId),
        )
    }

    override suspend fun classSuggestion(birthDate: String): ApiResult<ClassSuggestion?> =
        apiCall(json) { api.classSuggestion(birthDate) }.map { it.suggestion }
}
