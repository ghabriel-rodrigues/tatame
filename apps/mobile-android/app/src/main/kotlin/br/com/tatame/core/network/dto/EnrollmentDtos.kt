// Hand-written mirror of the enrollment surface of packages/shared/src/api/openapi.json
// (fallback per ticket mobile-android/02 — see app/build.gradle.kts `generateApiClient`).
// Field names MUST stay 1:1 with the spec; regenerate-by-hand on contract changes.

package br.com.tatame.core.network.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** `ScheduleSlotViewDto` — weekday 0 = Sunday … 6 = Saturday. */
@Serializable
data class ScheduleSlotView(
    val weekday: Int,
    val startTime: String, // "19:00"
    val durationMinutes: Int,
)

/** `ClassProfessorDto` */
@Serializable
data class ClassProfessor(
    val userId: String,
    val fullName: String,
)

/** `ClassListItemDto` — occupancy and `lotada` are server-derived, never recomputed. */
@Serializable
data class ClassListItem(
    val id: String,
    val name: String,
    val status: String, // active | archived
    val capacity: Int,
    val occupancy: Int,
    val lotada: Boolean,
    val ageMin: Int?,
    val ageMax: Int?,
    val professor: ClassProfessor,
    val schedules: List<ScheduleSlotView>,
)

/** `RosterStudentDto` — `badge` is the derived Ativo/Pendente state. */
@Serializable
data class RosterStudent(
    val studentId: String,
    val fullName: String,
    val birthDate: String, // "2010-04-20"
    val badge: String, // ativo | pendente
)

/** `ClassDetailDto` */
@Serializable
data class ClassDetail(
    val id: String,
    val name: String,
    val status: String,
    val capacity: Int,
    val occupancy: Int,
    val lotada: Boolean,
    val ageMin: Int?,
    val ageMax: Int?,
    val professor: ClassProfessor,
    val schedules: List<ScheduleSlotView>,
    val roster: List<RosterStudent>,
)

/** `ClassListResponseDto` */
@Serializable
data class ClassListResponse(val classes: List<ClassListItem>)

/** `ClassDetailResponseDto` */
@Serializable
data class ClassDetailResponse(@SerialName("class") val classDetail: ClassDetail)

/** `AddRosterStudentDto` */
@Serializable
data class AddRosterStudentRequest(val studentId: String)

/** `EnrollmentResultDto` */
@Serializable
data class EnrollmentResult(
    val classId: String,
    val studentId: String,
    val status: String, // active | removed
)

/** `EnrollmentResultResponseDto` */
@Serializable
data class EnrollmentResultResponse(val enrollment: EnrollmentResult)

/** `DependentClassDto` — `nextSlot` is server-derived (null when the grid is empty). */
@Serializable
data class DependentClass(
    val id: String,
    val name: String,
    val schedules: List<ScheduleSlotView>,
    val nextSlot: ScheduleSlotView? = null,
)

/** `DependentDetailDto` — `class` is the active class when enrolled. */
@Serializable
data class DependentDetail(
    val id: String,
    val fullName: String,
    val birthDate: String, // "2017-06-10"
    val status: String, // active | inactive
    @SerialName("class") val enrolledClass: DependentClass? = null,
)

/** `DependentListResponseDto` */
@Serializable
data class DependentListResponse(val dependents: List<DependentDetail>)

/** `DependentResponseDto` */
@Serializable
data class DependentResponse(val dependent: DependentDetail)

/**
 * `RegisterDependentDto` — `classId` is the accepted age-suggested class.
 * Registration succeeds even when it is full; the enrollment is skipped
 * (spec 003 story 34).
 */
@Serializable
data class RegisterDependentRequest(
    val fullName: String,
    val birthDate: String,
    val classId: String? = null,
)

/** `RegisterDependentResponseDto` — `enrolled=false` when no class accepted or it was full. */
@Serializable
data class RegisterDependentResponse(
    val dependent: DependentDetail,
    val enrolled: Boolean,
)

/** `ClassSuggestionDto` */
@Serializable
data class ClassSuggestion(
    val id: String,
    val name: String,
    val ageMin: Int?,
    val ageMax: Int?,
    val capacity: Int,
    val occupancy: Int,
    val schedules: List<ScheduleSlotView>,
)

/** `ClassSuggestionResponseDto` — null when no age-matching class with a free slot exists. */
@Serializable
data class ClassSuggestionResponse(val suggestion: ClassSuggestion? = null)
