// Hand-written mirror of the graduation surface of packages/shared/src/api/openapi.json
// (fallback per ticket mobile-android/02 — see app/build.gradle.kts `generateApiClient`).
// Field names MUST stay 1:1 with the spec; regenerate-by-hand on contract changes.

package br.com.tatame.core.network.dto

import kotlinx.serialization.Serializable

/** `BeltViewDto` — derived current belt; `colorSlug` is a design-token slug, never hex. */
@Serializable
data class BeltView(
    val beltId: String,
    val name: String, // PT-BR display name (client copy), e.g. "Azul"
    val colorSlug: String, // "belt.blue"
    val tipColorSlug: String? = null, // null = default belt.tip; black belt sends "belt.red"
    val maxDegrees: Int, // 0 = no degree stripes (red belt in v1)
    val degrees: Int, // current degrees on this belt (0 after a belt promotion)
)

/** `BeltRefDto` — belt reference on timeline entries (no current degrees). */
@Serializable
data class BeltRef(
    val beltId: String,
    val name: String,
    val colorSlug: String,
    val tipColorSlug: String? = null,
    val maxDegrees: Int,
)

/** `GraduationActorDto` */
@Serializable
data class GraduationActor(
    val userId: String,
    val fullName: String,
)

/** `student_graduations.kind` enum values (schema/enums stay English per charter). */
object GraduationKinds {
    const val DEGREE = "degree"
    const val BELT = "belt"
    const val REVOCATION = "revocation"
}

/** `GraduationEntryDto` — one timeline row; `reversed` awards were revoked later. */
@Serializable
data class GraduationEntry(
    val id: String,
    val kind: String, // degree | belt | revocation
    val belt: BeltRef,
    val degree: Int, // 0 on belt promotions and revocations
    val awardedAt: String,
    val awardedBy: GraduationActor,
    val notes: String? = null,
    val reversed: Boolean,
    val reversesGraduationId: String? = null,
    val certificateAvailable: Boolean, // render-only "Ver certificado" placeholder
)

/** `NextMilestoneDto` — `degree` null when the milestone is the next belt. */
@Serializable
data class NextMilestone(
    val kind: String, // degree | belt
    val degree: Int? = null,
)

/** `GraduationProgressDto` — active lessons since the last award vs the academy rule. */
@Serializable
data class GraduationProgress(
    val current: Int,
    val target: Int,
    val label: String, // PT-BR convenience label, e.g. "Próximo 3º grau"
    val nextMilestone: NextMilestone,
)

/** `AlunoGraduationResponseDto` — hero + progress + Histórico de evolução (newest first). */
@Serializable
data class AlunoGraduationResponse(
    val belt: BeltView,
    val progress: GraduationProgress,
    val timeline: List<GraduationEntry>,
)

/** `AlunoHomeGraduationDto` — the real home graduation card payload (GRD.7). */
@Serializable
data class AlunoHomeGraduation(
    val belt: BeltView,
    val progress: GraduationProgress,
)

/** `AwardGraduationDto` — `beltId` required for kind=belt (enabled, non-current target). */
@Serializable
data class AwardGraduationRequest(
    val kind: String, // degree | belt
    val beltId: String? = null,
    val notes: String? = null,
)

/** `AwardGraduationResponseDto` — the new entry + the freshly derived current belt. */
@Serializable
data class AwardGraduationResponse(
    val graduation: GraduationEntry,
    val belt: BeltView,
)

/** `StudentNoteDto` — staff-visible observação (never shown to the aluno). */
@Serializable
data class StudentNote(
    val id: String,
    val body: String,
    val createdAt: String,
    val author: GraduationActor,
)

/** `StudentNotesResponseDto` — newest first. */
@Serializable
data class StudentNotesResponse(val notes: List<StudentNote>)

/** `StudentNoteResponseDto` */
@Serializable
data class StudentNoteResponse(val note: StudentNote)

/** `CreateStudentNoteDto` */
@Serializable
data class CreateStudentNoteRequest(val body: String)

/** `ProfileStudentDto` */
@Serializable
data class ProfileStudent(
    val id: String,
    val fullName: String,
    val birthDate: String, // "2000-03-15"
    val status: String, // active | inactive
    val badge: String, // ativo | pendente
)

/** `StudentProfileResponseDto` — professor perfil do aluno (belt, progress, tiles, notes). */
@Serializable
data class StudentProfileResponse(
    val student: ProfileStudent,
    val belt: BeltView,
    val progress: GraduationProgress,
    val stats: AlunoStats,
    val notes: List<StudentNote>,
)

/** `ValidGraduationDto` — one merged-régua chip; kids belts reflect the admin toggles. */
@Serializable
data class ValidGraduation(
    val beltId: String,
    val name: String,
    val colorSlug: String,
    val tipColorSlug: String? = null,
    val maxDegrees: Int,
    val ladderKind: String, // adult | kids
    val enabled: Boolean,
)

/** `ProfessorProfileResponseDto` — own belt chip (display-only) + Graduações válidas. */
@Serializable
data class ProfessorProfileResponse(
    val professor: GraduationActor,
    val belt: BeltView? = null,
    val validGraduations: List<ValidGraduation>,
)
