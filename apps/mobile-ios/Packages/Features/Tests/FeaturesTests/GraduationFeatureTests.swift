import Foundation
import Testing
@testable import GraduationFeature
import TatameCore

// MARK: - Fake (repository-protocol seam, spec 005)

final class FakeGraduationRepository: GraduationRepository, @unchecked Sendable {
    var alunoGraduationResult: Result<AlunoGraduation, ApiError> = .failure(.unknown(status: 0, code: nil))
    private(set) var alunoGraduationCalls = 0

    var studentProfileResult: Result<StudentProfile, ApiError> = .failure(.unknown(status: 0, code: nil))
    private(set) var studentProfileCalls: [UUID] = []

    var awardResult: Result<AwardResult, ApiError> = .failure(.unknown(status: 0, code: nil))
    private(set) var awardCalls: [(studentId: UUID, kind: AwardKind, beltId: UUID?, notes: String?)] = []

    var notesResult: Result<[StudentNote], ApiError> = .success([])
    var createNoteResult: Result<StudentNote, ApiError> = .failure(.unknown(status: 0, code: nil))
    private(set) var createNoteCalls: [(studentId: UUID, body: String)] = []

    var professorProfileResult: Result<ProfessorProfile, ApiError> = .failure(.unknown(status: 0, code: nil))
    private(set) var professorProfileCalls = 0

    func alunoGraduation() async throws -> AlunoGraduation {
        alunoGraduationCalls += 1
        return try alunoGraduationResult.get()
    }

    func studentProfile(studentId: UUID) async throws -> StudentProfile {
        studentProfileCalls.append(studentId)
        return try studentProfileResult.get()
    }

    func award(studentId: UUID, kind: AwardKind, beltId: UUID?, notes: String?) async throws -> AwardResult {
        awardCalls.append((studentId, kind, beltId, notes))
        return try awardResult.get()
    }

    func notes(studentId _: UUID) async throws -> [StudentNote] {
        try notesResult.get()
    }

    func createNote(studentId: UUID, body: String) async throws -> StudentNote {
        createNoteCalls.append((studentId, body))
        return try createNoteResult.get()
    }

    func professorProfile() async throws -> ProfessorProfile {
        professorProfileCalls += 1
        return try professorProfileResult.get()
    }
}

// MARK: - Fixtures

enum GraduationFixtures {
    static let studentId = UUID(uuidString: "0198a7b0-0000-7000-8000-0000000000b1")!
    static let whiteBeltId = UUID(uuidString: "0198a7b0-0000-7000-8000-0000000000b2")!
    static let blueBeltId = UUID(uuidString: "0198a7b0-0000-7000-8000-0000000000b3")!
    static let purpleBeltId = UUID(uuidString: "0198a7b0-0000-7000-8000-0000000000b4")!
    static let professor = GraduationActor(userId: UUID(), fullName: "Rafael Nunes")

    static func belt(
        id: UUID = blueBeltId,
        name: String = "Azul",
        colorSlug: String = "belt.blue",
        maxDegrees: Int = 4,
        degrees: Int = 2
    ) -> BeltView {
        BeltView(
            beltId: id,
            name: name,
            colorSlug: colorSlug,
            tipColorSlug: nil,
            maxDegrees: maxDegrees,
            degrees: degrees
        )
    }

    static func progress(current: Int = 26, target: Int = 40) -> GraduationProgress {
        GraduationProgress(
            current: current,
            target: target,
            label: "Próximo 3º grau",
            nextMilestone: NextMilestone(kind: .degree, degree: 3)
        )
    }

    static func entry(
        kind: GraduationKind = .degree,
        degree: Int = 2,
        reversed: Bool = false,
        certificate: Bool = false,
        notes: String? = nil
    ) -> GraduationEntry {
        GraduationEntry(
            id: UUID(),
            kind: kind,
            belt: BeltRef(beltId: blueBeltId, name: "Azul", colorSlug: "belt.blue", tipColorSlug: nil, maxDegrees: 4),
            degree: degree,
            awardedAt: Date(),
            awardedBy: professor,
            notes: notes,
            reversed: reversed,
            reversesGraduationId: nil,
            certificateAvailable: certificate
        )
    }

    static func alunoGraduation(degrees: Int = 2) -> AlunoGraduation {
        AlunoGraduation(
            belt: belt(degrees: degrees),
            progress: progress(),
            timeline: [
                entry(kind: .degree, degree: 2, notes: "Constância exemplar nos fundamentos."),
                entry(kind: .belt, degree: 0, certificate: true, notes: "Exame de faixa — aprovado com distinção."),
            ]
        )
    }

    static func profile(belt beltView: BeltView = belt(), notes: [StudentNote] = []) -> StudentProfile {
        StudentProfile(
            student: ProfileStudent(
                id: studentId,
                fullName: "Lucas Almeida",
                birthDate: "2000-03-15",
                status: .active,
                badge: .ativo
            ),
            belt: beltView,
            progress: progress(current: 38),
            stats: AlunoStats(
                monthPresencePct: 86,
                monthAttendedSessions: 14,
                monthTotalSessions: 16,
                streak: 5,
                totalLessons: 120
            ),
            notes: notes
        )
    }

    static func valid(
        _ name: String,
        id: UUID = UUID(),
        kind: ValidGraduation.LadderKind = .adult,
        enabled: Bool = true
    ) -> ValidGraduation {
        ValidGraduation(
            beltId: id,
            name: name,
            colorSlug: "belt.blue",
            tipColorSlug: nil,
            maxDegrees: 4,
            ladderKind: kind,
            enabled: enabled
        )
    }

    /// Handoff régua with the kids belts disabled around Azul → Roxa next.
    static func regua() -> [ValidGraduation] {
        [
            valid("Branca", id: whiteBeltId),
            valid("Cinza", kind: .kids, enabled: false),
            valid("Azul", id: blueBeltId),
            valid("Roxa", id: purpleBeltId),
            valid("Marrom"),
        ]
    }

    static func note(body: String = "Boa evolução na guarda fechada.") -> StudentNote {
        StudentNote(id: UUID(), body: body, createdAt: Date(), author: professor)
    }

    static func professorProfile(
        belt beltView: BeltView? = nil,
        regua ladder: [ValidGraduation] = regua()
    ) -> ProfessorProfile {
        ProfessorProfile(professor: professor, belt: beltView, validGraduations: ladder)
    }
}

// MARK: - AlunoGraduationModel

@Suite("AlunoGraduationModel")
@MainActor
struct AlunoGraduationModelTests {
    @Test("load surfaces the hero belt, real progress, and the timeline")
    func loadGraduation() async {
        let repository = FakeGraduationRepository()
        repository.alunoGraduationResult = .success(GraduationFixtures.alunoGraduation())
        let model = AlunoGraduationModel(repository: repository)

        await model.load()

        let graduation = model.graduation
        #expect(graduation?.belt.name == "Azul")
        #expect(graduation?.belt.degrees == 2)
        #expect(graduation?.progress.target == 40)
        #expect(graduation?.timeline.count == 2)
        // Certificate placeholder rides only belt promotions (story 5).
        #expect(graduation?.timeline[0].certificateAvailable == false)
        #expect(graduation?.timeline[1].certificateAvailable == true)
    }

    @Test("load failure maps to PT-BR copy")
    func loadFailure() async {
        let repository = FakeGraduationRepository()
        repository.alunoGraduationResult = .failure(.network(.notConnectedToInternet))
        let model = AlunoGraduationModel(repository: repository)

        await model.load()

        #expect(model.phase == .failed(message: GraduationMessages.offline))
    }
}

// MARK: - StudentProfileModel

@Suite("StudentProfileModel")
@MainActor
struct StudentProfileModelTests {
    private func loadedModel(
        repository: FakeGraduationRepository,
        canAward: Bool = true,
        belt: BeltView = GraduationFixtures.belt()
    ) async -> StudentProfileModel {
        repository.studentProfileResult = .success(GraduationFixtures.profile(belt: belt))
        repository.professorProfileResult = .success(GraduationFixtures.professorProfile())
        let model = StudentProfileModel(
            studentId: GraduationFixtures.studentId,
            canAward: canAward,
            repository: repository
        )
        await model.load()
        return model
    }

    @Test("load surfaces belt, progress, tiles, and fetches the régua for targets")
    func loadProfile() async {
        let repository = FakeGraduationRepository()
        let model = await loadedModel(repository: repository)

        #expect(model.profile?.student.fullName == "Lucas Almeida")
        #expect(model.profile?.belt.degrees == 2)
        #expect(model.profile?.progress.current == 38)
        #expect(model.profile?.stats.monthAttendedSessions == 14)
        #expect(repository.professorProfileCalls == 1)
        #expect(model.canAddDegree)
        // Régua: Azul → Roxa (Cinza disabled belts never become targets).
        #expect(model.nextBelt?.name == "Roxa")
        #expect(model.canPromoteBelt)
    }

    @Test("toggle off hides both award actions and skips the régua fetch (story 15)")
    func toggleOffGating() async {
        let repository = FakeGraduationRepository()
        let model = await loadedModel(repository: repository, canAward: false)

        #expect(!model.canAward)
        #expect(!model.canAddDegree)
        #expect(!model.canPromoteBelt)
        #expect(repository.professorProfileCalls == 0)
    }

    @Test("Adicionar grau blocks at the belt's maximum degrees (story 14)")
    func degreeAtMaxBlocked() async {
        let repository = FakeGraduationRepository()
        let model = await loadedModel(
            repository: repository,
            belt: GraduationFixtures.belt(maxDegrees: 4, degrees: 4)
        )

        #expect(!model.canAddDegree)
        #expect(model.canPromoteBelt)
    }

    @Test("confirm add-degree posts kind=degree with the trimmed observação and reloads")
    func confirmAddDegree() async {
        let repository = FakeGraduationRepository()
        let model = await loadedModel(repository: repository)
        repository.awardResult = .success(
            AwardResult(
                graduation: GraduationFixtures.entry(degree: 3),
                belt: GraduationFixtures.belt(degrees: 3)
            )
        )

        model.askAward(.degree)
        #expect(model.confirmationMessagePTBR == "Conceder o 3º grau a Lucas?")
        model.awardNotesDraft = "  Exame de grau.  "
        await model.confirmAward()

        #expect(repository.awardCalls.count == 1)
        #expect(repository.awardCalls[0].kind == .degree)
        #expect(repository.awardCalls[0].beltId == nil)
        #expect(repository.awardCalls[0].notes == "Exame de grau.")
        #expect(model.pendingAward == nil)
        #expect(model.actionError == nil)
        // Post-award reload re-derives from the server truth.
        #expect(repository.studentProfileCalls.count == 2)
    }

    @Test("confirm promote posts kind=belt with the next enabled belt id (stories 11, 14)")
    func confirmPromote() async {
        let repository = FakeGraduationRepository()
        let model = await loadedModel(repository: repository)
        repository.awardResult = .success(
            AwardResult(
                graduation: GraduationFixtures.entry(kind: .belt, degree: 0, certificate: true),
                belt: GraduationFixtures.belt(id: GraduationFixtures.purpleBeltId, name: "Roxa", degrees: 0)
            )
        )

        model.askAward(.belt)
        #expect(model.confirmationMessagePTBR == "Promover Lucas para a Faixa roxa? Os graus voltam a zero.")
        await model.confirmAward()

        #expect(repository.awardCalls.count == 1)
        #expect(repository.awardCalls[0].kind == .belt)
        #expect(repository.awardCalls[0].beltId == GraduationFixtures.purpleBeltId)
        #expect(repository.awardCalls[0].notes == nil)
    }

    @Test("degree-at-max rejection maps to its PT-BR copy")
    func degreeAtMaxError() async {
        let repository = FakeGraduationRepository()
        let model = await loadedModel(repository: repository)
        repository.awardResult = .failure(.conflict(code: ApiErrorCode.graduationDegreeAtMax))

        model.askAward(.degree)
        await model.confirmAward()

        #expect(model.actionError == GraduationMessages.degreeAtMax)
        #expect(model.pendingAward == nil)
    }

    @Test("server-side toggle denial maps to the permission copy (story 15)")
    func permissionDeniedError() async {
        let repository = FakeGraduationRepository()
        let model = await loadedModel(repository: repository)
        repository.awardResult = .failure(.forbidden(code: ApiErrorCode.permissionDisabled))

        model.askAward(.degree)
        await model.confirmAward()

        #expect(model.actionError == GraduationMessages.awardPermissionDisabled)
    }

    @Test("read-only academy maps to the read-only copy (story 39)")
    func readOnlyError() async {
        let repository = FakeGraduationRepository()
        let model = await loadedModel(repository: repository)
        repository.awardResult = .failure(.forbidden(code: ApiErrorCode.tenantReadOnly))

        model.askAward(.degree)
        await model.confirmAward()

        #expect(model.actionError == GraduationMessages.readOnly)
    }

    @Test("a foreign student surfaces the ownership 404 copy (story 17)")
    func foreignStudent() async {
        let repository = FakeGraduationRepository()
        repository.studentProfileResult = .failure(.notFound(code: ApiErrorCode.notFound))
        let model = StudentProfileModel(
            studentId: UUID(),
            canAward: true,
            repository: repository
        )

        await model.load()

        #expect(model.phase == .failed(message: GraduationMessages.studentNotFound))
    }

    @Test("saveNote posts the body, clears the draft, and prepends newest-first (stories 18-19)")
    func saveNote() async {
        let repository = FakeGraduationRepository()
        repository.studentProfileResult = .success(
            GraduationFixtures.profile(notes: [GraduationFixtures.note(body: "Antiga")])
        )
        repository.professorProfileResult = .success(GraduationFixtures.professorProfile())
        let model = StudentProfileModel(
            studentId: GraduationFixtures.studentId,
            canAward: true,
            repository: repository
        )
        await model.load()
        repository.createNoteResult = .success(GraduationFixtures.note(body: "Pediu foco em raspagens."))

        #expect(!model.canSaveNote)
        model.noteDraft = "  Pediu foco em raspagens.  "
        #expect(model.canSaveNote)
        await model.saveNote()

        #expect(repository.createNoteCalls.count == 1)
        #expect(repository.createNoteCalls[0].body == "Pediu foco em raspagens.")
        #expect(model.noteDraft.isEmpty)
        #expect(model.profile?.notes.map(\.body) == ["Pediu foco em raspagens.", "Antiga"])
    }
}

// MARK: - ProfessorProfileModel

@Suite("ProfessorProfileModel")
@MainActor
struct ProfessorProfileModelTests {
    @Test("load surfaces the belt chip and the merged régua with kids toggles (stories 20-21)")
    func loadProfile() async {
        let repository = FakeGraduationRepository()
        repository.professorProfileResult = .success(
            GraduationFixtures.professorProfile(
                belt: GraduationFixtures.belt(name: "Preta", colorSlug: "belt.black", maxDegrees: 6, degrees: 2)
            )
        )
        let model = ProfessorProfileModel(repository: repository)

        await model.load()

        let profile = model.profile
        #expect(profile?.belt.map { GraduationFormatters.chipLabelPTBR(belt: $0) } == "Faixa preta · 2º dan")
        #expect(profile?.validGraduations.count == 5)
        #expect(profile?.validGraduations[1].enabled == false)
    }

    @Test("an unset rank keeps the chip absent, never a fake white belt")
    func noBelt() async {
        let repository = FakeGraduationRepository()
        repository.professorProfileResult = .success(GraduationFixtures.professorProfile(belt: nil))
        let model = ProfessorProfileModel(repository: repository)

        await model.load()

        #expect(model.profile?.belt == nil)
    }

    @Test("load failure maps to PT-BR copy")
    func loadFailure() async {
        let repository = FakeGraduationRepository()
        repository.professorProfileResult = .failure(.network(.notConnectedToInternet))
        let model = ProfessorProfileModel(repository: repository)

        await model.load()

        #expect(model.phase == .failed(message: GraduationMessages.offline))
    }
}

// MARK: - AlunoProfileModel (profile belt chip)

@Suite("AlunoProfileModel")
@MainActor
struct AlunoProfileModelTests {
    @Test("load derives the profile belt chip from /aluno/graduation (story 7)")
    func loadBelt() async {
        let repository = FakeGraduationRepository()
        repository.alunoGraduationResult = .success(GraduationFixtures.alunoGraduation())
        let model = AlunoProfileModel(repository: repository)

        await model.load()

        #expect(model.belt?.name == "Azul")
        #expect(model.belt.map { GraduationFormatters.chipLabelPTBR(belt: $0) } == "Faixa azul · 2 graus")
    }

    @Test("a failed chip fetch stays beltless instead of blocking the profile")
    func loadFailureIsSoft() async {
        let repository = FakeGraduationRepository()
        repository.alunoGraduationResult = .failure(.network(.notConnectedToInternet))
        let model = AlunoProfileModel(repository: repository)

        await model.load()

        #expect(model.belt == nil)
    }
}
