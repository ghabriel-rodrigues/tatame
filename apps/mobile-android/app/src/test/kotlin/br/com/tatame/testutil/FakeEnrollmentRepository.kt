package br.com.tatame.testutil

import br.com.tatame.core.enrollment.EnrollmentRepository
import br.com.tatame.core.network.ApiError
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.dto.ClassDetail
import br.com.tatame.core.network.dto.ClassListItem
import br.com.tatame.core.network.dto.ClassProfessor
import br.com.tatame.core.network.dto.ClassSuggestion
import br.com.tatame.core.network.dto.DependentDetail
import br.com.tatame.core.network.dto.EnrollmentResult
import br.com.tatame.core.network.dto.RegisterDependentResponse
import br.com.tatame.core.network.dto.RosterStudent
import br.com.tatame.core.network.dto.ScheduleSlotView

/** Configurable in-memory [EnrollmentRepository] for ViewModel tests. */
class FakeEnrollmentRepository : EnrollmentRepository {

    var classesResult: ApiResult<List<ClassListItem>> = ApiResult.Success(emptyList())
    val detailResults: MutableMap<String, ApiResult<ClassDetail>> = mutableMapOf()
    var addResult: ApiResult<EnrollmentResult> = ApiResult.Failure(ApiError.Network)
    var removeResult: ApiResult<EnrollmentResult> = ApiResult.Failure(ApiError.Network)
    var dependentsResult: ApiResult<List<DependentDetail>> = ApiResult.Success(emptyList())
    val dependentResults: MutableMap<String, ApiResult<DependentDetail>> = mutableMapOf()
    var registerResult: ApiResult<RegisterDependentResponse> = ApiResult.Failure(ApiError.Network)
    var suggestionResult: ApiResult<ClassSuggestion?> = ApiResult.Success(null)

    var classesCalls = 0
    val detailCalls = mutableListOf<String>()
    val addCalls = mutableListOf<Pair<String, String>>()
    val removeCalls = mutableListOf<Pair<String, String>>()
    var dependentsCalls = 0
    val dependentCalls = mutableListOf<String>()
    val registerCalls = mutableListOf<Triple<String, String, String?>>()
    val suggestionCalls = mutableListOf<String>()

    override suspend fun professorClasses(): ApiResult<List<ClassListItem>> {
        classesCalls++
        return classesResult
    }

    override suspend fun professorClassDetail(classId: String): ApiResult<ClassDetail> {
        detailCalls += classId
        return detailResults[classId] ?: ApiResult.Failure(ApiError.NotFound)
    }

    override suspend fun addStudent(classId: String, studentId: String): ApiResult<EnrollmentResult> {
        addCalls += classId to studentId
        return addResult
    }

    override suspend fun removeStudent(classId: String, studentId: String): ApiResult<EnrollmentResult> {
        removeCalls += classId to studentId
        return removeResult
    }

    override suspend fun dependents(): ApiResult<List<DependentDetail>> {
        dependentsCalls++
        return dependentsResult
    }

    override suspend fun dependent(dependentId: String): ApiResult<DependentDetail> {
        dependentCalls += dependentId
        return dependentResults[dependentId] ?: ApiResult.Failure(ApiError.NotFound)
    }

    override suspend fun registerDependent(
        fullName: String,
        birthDate: String,
        classId: String?,
    ): ApiResult<RegisterDependentResponse> {
        registerCalls += Triple(fullName, birthDate, classId)
        return registerResult
    }

    override suspend fun classSuggestion(birthDate: String): ApiResult<ClassSuggestion?> {
        suggestionCalls += birthDate
        return suggestionResult
    }
}

// ---- fixture builders ----------------------------------------------------

fun slot(weekday: Int = 1, startTime: String = "19:00", durationMinutes: Int = 90) =
    ScheduleSlotView(weekday = weekday, startTime = startTime, durationMinutes = durationMinutes)

fun rosterStudent(id: String, name: String = "Aluno $id", badge: String = "ativo") =
    RosterStudent(studentId = id, fullName = name, birthDate = "2010-04-20", badge = badge)

fun classItem(
    id: String,
    name: String = "Turma $id",
    occupancy: Int = 10,
    capacity: Int = 24,
    lotada: Boolean = false,
) = ClassListItem(
    id = id,
    name = name,
    status = "active",
    capacity = capacity,
    occupancy = occupancy,
    lotada = lotada,
    ageMin = null,
    ageMax = null,
    professor = ClassProfessor(userId = "prof-1", fullName = "Professor Um"),
    schedules = listOf(slot()),
)

fun classDetail(
    id: String,
    name: String = "Turma $id",
    roster: List<RosterStudent> = emptyList(),
    occupancy: Int = roster.size,
    capacity: Int = 24,
) = ClassDetail(
    id = id,
    name = name,
    status = "active",
    capacity = capacity,
    occupancy = occupancy,
    lotada = occupancy >= capacity,
    ageMin = null,
    ageMax = null,
    professor = ClassProfessor(userId = "prof-1", fullName = "Professor Um"),
    schedules = listOf(slot()),
    roster = roster,
)

fun dependent(
    id: String,
    name: String = "Filho $id",
    enrolledClass: br.com.tatame.core.network.dto.DependentClass? = null,
) = DependentDetail(
    id = id,
    fullName = name,
    birthDate = "2017-06-10",
    status = "active",
    enrolledClass = enrolledClass,
)

fun suggestion(id: String = "class-kids", name: String = "Kids") = ClassSuggestion(
    id = id,
    name = name,
    ageMin = 4,
    ageMax = 12,
    capacity = 16,
    occupancy = 14,
    schedules = listOf(slot(weekday = 2, startTime = "18:00", durationMinutes = 60)),
)
