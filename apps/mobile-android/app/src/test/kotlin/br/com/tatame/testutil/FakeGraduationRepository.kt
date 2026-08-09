package br.com.tatame.testutil

import br.com.tatame.core.graduation.GraduationRepository
import br.com.tatame.core.network.ApiError
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.dto.AlunoGraduationResponse
import br.com.tatame.core.network.dto.AwardGraduationResponse
import br.com.tatame.core.network.dto.BeltRef
import br.com.tatame.core.network.dto.BeltView
import br.com.tatame.core.network.dto.GraduationActor
import br.com.tatame.core.network.dto.GraduationEntry
import br.com.tatame.core.network.dto.GraduationKinds
import br.com.tatame.core.network.dto.GraduationProgress
import br.com.tatame.core.network.dto.NextMilestone
import br.com.tatame.core.network.dto.ProfessorProfileResponse
import br.com.tatame.core.network.dto.ProfileStudent
import br.com.tatame.core.network.dto.StudentNote
import br.com.tatame.core.network.dto.StudentProfileResponse
import br.com.tatame.core.network.dto.ValidGraduation

/** Configurable in-memory [GraduationRepository] for ViewModel tests. */
class FakeGraduationRepository : GraduationRepository {

    var alunoGraduationResult: ApiResult<AlunoGraduationResponse> =
        ApiResult.Failure(ApiError.Network)
    var studentProfileResult: ApiResult<StudentProfileResponse> =
        ApiResult.Failure(ApiError.Network)
    var addDegreeResult: ApiResult<AwardGraduationResponse> = ApiResult.Failure(ApiError.Network)
    var promoteResult: ApiResult<AwardGraduationResponse> = ApiResult.Failure(ApiError.Network)
    var listNotesResult: ApiResult<List<StudentNote>> = ApiResult.Success(emptyList())
    var createNoteResult: ApiResult<StudentNote> = ApiResult.Failure(ApiError.Network)
    var professorProfileResult: ApiResult<ProfessorProfileResponse> =
        ApiResult.Failure(ApiError.Network)

    var alunoGraduationCalls = 0
    val studentProfileCalls = mutableListOf<String>()
    val addDegreeCalls = mutableListOf<Pair<String, String?>>()
    val promoteCalls = mutableListOf<Triple<String, String, String?>>()
    val listNotesCalls = mutableListOf<String>()
    val createNoteCalls = mutableListOf<Pair<String, String>>()
    var professorProfileCalls = 0

    override suspend fun alunoGraduation(): ApiResult<AlunoGraduationResponse> {
        alunoGraduationCalls++
        return alunoGraduationResult
    }

    override suspend fun studentProfile(studentId: String): ApiResult<StudentProfileResponse> {
        studentProfileCalls += studentId
        return studentProfileResult
    }

    override suspend fun addDegree(
        studentId: String,
        notes: String?,
    ): ApiResult<AwardGraduationResponse> {
        addDegreeCalls += studentId to notes
        return addDegreeResult
    }

    override suspend fun promoteBelt(
        studentId: String,
        beltId: String,
        notes: String?,
    ): ApiResult<AwardGraduationResponse> {
        promoteCalls += Triple(studentId, beltId, notes)
        return promoteResult
    }

    override suspend fun listNotes(studentId: String): ApiResult<List<StudentNote>> {
        listNotesCalls += studentId
        return listNotesResult
    }

    override suspend fun createNote(studentId: String, body: String): ApiResult<StudentNote> {
        createNoteCalls += studentId to body
        return createNoteResult
    }

    override suspend fun professorProfile(): ApiResult<ProfessorProfileResponse> {
        professorProfileCalls++
        return professorProfileResult
    }
}

// ---- fixture builders ----------------------------------------------------

fun beltView(
    beltId: String = "b-blue",
    name: String = "Azul",
    colorSlug: String = "belt.blue",
    tipColorSlug: String? = null,
    maxDegrees: Int = 4,
    degrees: Int = 2,
) = BeltView(
    beltId = beltId,
    name = name,
    colorSlug = colorSlug,
    tipColorSlug = tipColorSlug,
    maxDegrees = maxDegrees,
    degrees = degrees,
)

fun beltRef(
    beltId: String = "b-blue",
    name: String = "Azul",
    colorSlug: String = "belt.blue",
    tipColorSlug: String? = null,
    maxDegrees: Int = 4,
) = BeltRef(
    beltId = beltId,
    name = name,
    colorSlug = colorSlug,
    tipColorSlug = tipColorSlug,
    maxDegrees = maxDegrees,
)

fun graduationProgress(
    current: Int = 26,
    target: Int = 40,
    label: String = "Próximo 3º grau",
    milestone: NextMilestone = NextMilestone(kind = GraduationKinds.DEGREE, degree = 3),
) = GraduationProgress(current = current, target = target, label = label, nextMilestone = milestone)

fun graduationEntry(
    id: String = "g1",
    kind: String = GraduationKinds.DEGREE,
    belt: BeltRef = beltRef(),
    degree: Int = 2,
    awardedAt: String = "2026-05-14T18:00:00.000Z",
    notes: String? = null,
    reversed: Boolean = false,
    certificateAvailable: Boolean = false,
) = GraduationEntry(
    id = id,
    kind = kind,
    belt = belt,
    degree = degree,
    awardedAt = awardedAt,
    awardedBy = GraduationActor(userId = "u-prof", fullName = "Rafael Nunes"),
    notes = notes,
    reversed = reversed,
    reversesGraduationId = null,
    certificateAvailable = certificateAvailable,
)

fun alunoGraduation(
    belt: BeltView = beltView(),
    progress: GraduationProgress = graduationProgress(),
    timeline: List<GraduationEntry> = listOf(graduationEntry()),
) = AlunoGraduationResponse(belt = belt, progress = progress, timeline = timeline)

fun studentNote(
    id: String = "n1",
    body: String = "Boa evolução na guarda fechada.",
    createdAt: String = "2026-07-12T10:00:00.000Z",
    author: String = "Rafael Nunes",
) = StudentNote(
    id = id,
    body = body,
    createdAt = createdAt,
    author = GraduationActor(userId = "u-prof", fullName = author),
)

fun studentProfile(
    belt: BeltView = beltView(),
    progress: GraduationProgress = graduationProgress(current = 38, target = 40),
    notes: List<StudentNote> = listOf(studentNote()),
) = StudentProfileResponse(
    student = ProfileStudent(
        id = "st1",
        fullName = "Lucas Almeida",
        birthDate = "2000-03-15",
        status = "active",
        badge = "ativo",
    ),
    belt = belt,
    progress = progress,
    stats = alunoStats(presencePct = 86.0, streak = null, totalLessons = 38),
    notes = notes,
)

fun validGraduation(
    beltId: String,
    name: String = beltId,
    colorSlug: String = "belt.blue",
    ladderKind: String = "adult",
    enabled: Boolean = true,
    maxDegrees: Int = 4,
    tipColorSlug: String? = null,
) = ValidGraduation(
    beltId = beltId,
    name = name,
    colorSlug = colorSlug,
    tipColorSlug = tipColorSlug,
    maxDegrees = maxDegrees,
    ladderKind = ladderKind,
    enabled = enabled,
)

/** Handoff régua order: Branca, Cinza, Amarela, Laranja, Verde, Azul, Roxa… */
fun defaultRegua(): List<ValidGraduation> = listOf(
    validGraduation("b-white", "Branca", "belt.white"),
    validGraduation("b-gray", "Cinza", "belt.gray", ladderKind = "kids"),
    validGraduation("b-yellow", "Amarela", "belt.yellow", ladderKind = "kids"),
    validGraduation("b-orange", "Laranja", "belt.orange", ladderKind = "kids"),
    validGraduation("b-green", "Verde", "belt.green", ladderKind = "kids"),
    validGraduation("b-blue", "Azul", "belt.blue"),
    validGraduation("b-purple", "Roxa", "belt.purple"),
    validGraduation("b-brown", "Marrom", "belt.brown"),
    validGraduation("b-black", "Preta", "belt.black", maxDegrees = 6, tipColorSlug = "belt.red"),
    validGraduation("b-red", "Vermelha", "belt.red", maxDegrees = 0),
)

fun professorProfile(
    belt: BeltView? = beltView(
        beltId = "b-black",
        name = "Preta",
        colorSlug = "belt.black",
        tipColorSlug = "belt.red",
        maxDegrees = 6,
        degrees = 2,
    ),
    validGraduations: List<ValidGraduation> = defaultRegua(),
) = ProfessorProfileResponse(
    professor = GraduationActor(userId = "u-prof", fullName = "Rafael Nunes"),
    belt = belt,
    validGraduations = validGraduations,
)

fun awardResponse(
    entry: GraduationEntry = graduationEntry(id = "g-new", degree = 3),
    belt: BeltView = beltView(degrees = 3),
) = AwardGraduationResponse(graduation = entry, belt = belt)
