import Foundation
import Testing
@testable import EnrollmentFeature
import TatameCore

// MARK: - Fakes (repository-protocol seam, spec 003)

final class FakeEnrollmentRepository: EnrollmentRepository, @unchecked Sendable {
    var classesResult: Result<[ClassSummary], ApiError> = .success([])
    var detailResults: [UUID: Result<ClassDetail, ApiError>] = [:]
    var addResult: Result<EnrollmentResult, ApiError> = .failure(.unknown(status: 0, code: nil))
    var removeResult: Result<EnrollmentResult, ApiError> = .failure(.unknown(status: 0, code: nil))
    var dependentsResult: Result<[Dependent], ApiError> = .success([])
    var dependentResult: Result<Dependent, ApiError> = .failure(.notFound(code: ApiErrorCode.notFound))
    var suggestionResult: Result<ClassSuggestion?, ApiError> = .success(nil)
    var registerResult: Result<RegisteredDependent, ApiError> = .failure(.unknown(status: 0, code: nil))

    private(set) var addCalls: [(classId: UUID, studentId: UUID)] = []
    private(set) var removeCalls: [(classId: UUID, studentId: UUID)] = []
    private(set) var suggestionCalls: [String] = []
    private(set) var registerCalls: [(fullName: String, birthDate: String, classId: UUID?)] = []

    func professorClasses() async throws -> [ClassSummary] {
        try classesResult.get()
    }

    func professorClassDetail(classId: UUID) async throws -> ClassDetail {
        guard let result = detailResults[classId] else {
            throw ApiError.notFound(code: ApiErrorCode.notFound)
        }
        return try result.get()
    }

    func addStudent(classId: UUID, studentId: UUID) async throws -> EnrollmentResult {
        addCalls.append((classId, studentId))
        return try addResult.get()
    }

    func removeStudent(classId: UUID, studentId: UUID) async throws -> EnrollmentResult {
        removeCalls.append((classId, studentId))
        return try removeResult.get()
    }

    func dependents() async throws -> [Dependent] {
        try dependentsResult.get()
    }

    func dependent(id _: UUID) async throws -> Dependent {
        try dependentResult.get()
    }

    func classSuggestion(birthDate: String) async throws -> ClassSuggestion? {
        suggestionCalls.append(birthDate)
        return try suggestionResult.get()
    }

    func registerDependent(fullName: String, birthDate: String, classId: UUID?) async throws -> RegisteredDependent {
        registerCalls.append((fullName, birthDate, classId))
        return try registerResult.get()
    }
}

/// Auth fake with a controllable `/auth/me` context for the permission map.
final class PermissionsAuthRepository: AuthRepository, @unchecked Sendable {
    var loginResult: Result<AuthSession, ApiError> = .failure(.unknown(status: 0, code: nil))
    var meResult: Result<SessionContext, ApiError> = .failure(.unknown(status: 0, code: nil))

    func login(email _: String, password _: String) async throws -> AuthSession {
        try loginResult.get()
    }

    func restoreSession() async throws -> SessionContext {
        try meResult.get()
    }

    func me() async throws -> SessionContext {
        try meResult.get()
    }

    func switchMembership(_: UUID) async throws -> SwitchedMembership {
        throw ApiError.unknown(status: 0, code: nil)
    }

    func logout() async throws {}
}

// MARK: - Fixtures

private enum EnrollmentFixtures {
    static let professor = ClassProfessor(userId: UUID(), fullName: "Carlos Souza")
    static let fundamentosId = UUID()
    static let avancadaId = UUID()
    static let kidsId = UUID()

    static func slot(weekday: Int = 1, start: String = "19:00", minutes: Int = 60) -> ScheduleSlot {
        ScheduleSlot(weekday: weekday, startTime: start, durationMinutes: minutes)
    }

    static func summary(
        id: UUID = fundamentosId,
        name: String = "Fundamentos",
        capacity: Int = 24,
        occupancy: Int = 20,
        lotada: Bool = false,
        ageMin: Int? = nil,
        ageMax: Int? = nil,
        schedules: [ScheduleSlot] = [slot(weekday: 1), slot(weekday: 3), slot(weekday: 5)]
    ) -> ClassSummary {
        ClassSummary(
            id: id,
            name: name,
            status: .active,
            capacity: capacity,
            occupancy: occupancy,
            lotada: lotada,
            ageMin: ageMin,
            ageMax: ageMax,
            professor: professor,
            schedules: schedules
        )
    }

    static func student(name: String = "Lucas Almeida", badge: RosterBadge = .ativo) -> RosterStudent {
        RosterStudent(studentId: UUID(), fullName: name, birthDate: "2001-02-03", badge: badge)
    }

    static func detail(
        summary: ClassSummary = summary(),
        roster: [RosterStudent] = [student()]
    ) -> ClassDetail {
        ClassDetail(summary: summary, roster: roster)
    }

    static func dependent(
        name: String = "Pedro Silveira",
        enrolledClass: DependentClass? = DependentClass(
            id: kidsId,
            name: "Kids",
            schedules: [slot(weekday: 2, start: "18:00", minutes: 45)],
            nextSlot: slot(weekday: 2, start: "18:00", minutes: 45)
        )
    ) -> Dependent {
        Dependent(id: UUID(), fullName: name, birthDate: "2017-06-10", status: .active, enrolledClass: enrolledClass)
    }

    static func suggestion() -> ClassSuggestion {
        ClassSuggestion(
            id: kidsId,
            name: "Kids",
            ageMin: 4,
            ageMax: 12,
            capacity: 16,
            occupancy: 14,
            schedules: [slot(weekday: 2, start: "18:00", minutes: 45), slot(weekday: 4, start: "18:00", minutes: 45)]
        )
    }

    static func guardianMembership(id: UUID) -> Membership {
        Membership(
            id: id,
            type: .academy,
            role: .guardian,
            tenantId: UUID(),
            academyName: "Horizonte BJJ",
            academyStatus: .active,
            status: "active"
        )
    }

    @MainActor
    static func signedInGuardianStore(
        permissions: [String: Bool],
        meFails: Bool = false
    ) async throws -> SessionStore {
        let membershipId = UUID()
        let membership = guardianMembership(id: membershipId)
        let user = UserSummary(id: UUID(), email: "fernanda@tatame.dev", fullName: "Fernanda Silveira")
        let auth = PermissionsAuthRepository()
        auth.loginResult = .success(
            AuthSession(
                user: user,
                memberships: [membership],
                activeMembershipId: membershipId,
                accessToken: "access-1",
                accessExpiresIn: 900,
                refreshToken: "refresh-1"
            )
        )
        auth.meResult = meFails
            ? .failure(.network(.notConnectedToInternet))
            : .success(SessionContext(
                user: user,
                memberships: [membership],
                activeMembership: membership,
                permissions: permissions
            ))
        let store = SessionStore(
            repository: auth,
            refreshTokenStore: FakeRefreshTokenStore(),
            accessTokenStore: FakeAccessTokenStore()
        )
        _ = try await store.login(email: "fernanda@tatame.dev", password: "pw")
        return store
    }
}

// MARK: - ProfessorTurmasModel

@Suite("ProfessorTurmasModel")
@MainActor
struct ProfessorTurmasModelTests {
    @Test("load surfaces the classes with server-derived occupancy and lotada")
    func loadSuccess() async {
        let repository = FakeEnrollmentRepository()
        let lotada = EnrollmentFixtures.summary(
            id: EnrollmentFixtures.avancadaId,
            name: "Avançada",
            capacity: 20,
            occupancy: 20,
            lotada: true
        )
        repository.classesResult = .success([EnrollmentFixtures.summary(), lotada])
        let model = ProfessorTurmasModel(repository: repository)

        await model.load()

        guard case .loaded(let classes) = model.phase else {
            Issue.record("expected loaded, got \(model.phase)")
            return
        }
        #expect(classes.count == 2)
        #expect(classes[1].lotada)
        #expect(classes[1].occupancyLabelPTBR == "20 de 20 vagas")
    }

    @Test("load failure maps to PT-BR copy")
    func loadFailure() async {
        let repository = FakeEnrollmentRepository()
        repository.classesResult = .failure(.network(.notConnectedToInternet))
        let model = ProfessorTurmasModel(repository: repository)

        await model.load()

        #expect(model.phase == .failed(message: EnrollmentMessages.offline))
    }
}

// MARK: - TurmaDetailModel

@Suite("TurmaDetailModel")
@MainActor
struct TurmaDetailModelTests {
    @Test("load fetches the detail with roster badges")
    func loadDetail() async {
        let repository = FakeEnrollmentRepository()
        let pendente = EnrollmentFixtures.student(name: "Tiago Mota", badge: .pendente)
        repository.detailResults[EnrollmentFixtures.fundamentosId] = .success(
            EnrollmentFixtures.detail(roster: [EnrollmentFixtures.student(), pendente])
        )
        let model = TurmaDetailModel(classId: EnrollmentFixtures.fundamentosId, repository: repository)

        await model.load()

        #expect(model.detail?.roster.count == 2)
        #expect(model.detail?.roster[1].badge == .pendente)
    }

    @Test("a foreign class behaves as not found (story 28)")
    func foreignClass() async {
        let repository = FakeEnrollmentRepository()
        let model = TurmaDetailModel(classId: UUID(), repository: repository)

        await model.load()

        #expect(model.phase == .failed(message: EnrollmentMessages.classNotFound))
    }

    @Test("remove asks for confirmation and only mutates on confirm")
    func removeConfirmFlow() async {
        let repository = FakeEnrollmentRepository()
        let student = EnrollmentFixtures.student()
        repository.detailResults[EnrollmentFixtures.fundamentosId] = .success(
            EnrollmentFixtures.detail(roster: [student])
        )
        repository.removeResult = .success(
            EnrollmentResult(classId: EnrollmentFixtures.fundamentosId, studentId: student.studentId, status: .removed)
        )
        let model = TurmaDetailModel(classId: EnrollmentFixtures.fundamentosId, repository: repository)
        await model.load()

        model.askRemove(student)
        #expect(model.removalCandidate == student)
        #expect(repository.removeCalls.isEmpty)

        model.cancelRemove()
        #expect(model.removalCandidate == nil)
        #expect(repository.removeCalls.isEmpty)

        model.askRemove(student)
        // Post-removal reload returns an empty roster.
        repository.detailResults[EnrollmentFixtures.fundamentosId] = .success(
            EnrollmentFixtures.detail(
                summary: EnrollmentFixtures.summary(occupancy: 19),
                roster: []
            )
        )
        await model.confirmRemove()

        #expect(repository.removeCalls.count == 1)
        #expect(repository.removeCalls[0].studentId == student.studentId)
        #expect(model.removalCandidate == nil)
        #expect(model.detail?.roster.isEmpty == true)
        #expect(model.detail?.summary.occupancy == 19)
    }

    @Test("remove failure surfaces PT-BR copy and keeps the roster")
    func removeFailure() async {
        let repository = FakeEnrollmentRepository()
        let student = EnrollmentFixtures.student()
        repository.detailResults[EnrollmentFixtures.fundamentosId] = .success(
            EnrollmentFixtures.detail(roster: [student])
        )
        repository.removeResult = .failure(.network(.notConnectedToInternet))
        let model = TurmaDetailModel(classId: EnrollmentFixtures.fundamentosId, repository: repository)
        await model.load()

        model.askRemove(student)
        await model.confirmRemove()

        #expect(model.actionError == EnrollmentMessages.offline)
        #expect(model.detail?.roster.count == 1)
    }

    @Test("candidates = union of other rosters minus the current one (API-gap workaround)")
    func candidatePool() async {
        let repository = FakeEnrollmentRepository()
        let shared = EnrollmentFixtures.student(name: "Marina Costa")
        let onlyOther = EnrollmentFixtures.student(name: "Pedro Silveira")
        let enrolledHere = EnrollmentFixtures.student(name: "Lucas Almeida")
        repository.classesResult = .success([
            EnrollmentFixtures.summary(),
            EnrollmentFixtures.summary(id: EnrollmentFixtures.avancadaId, name: "Avançada"),
        ])
        repository.detailResults[EnrollmentFixtures.fundamentosId] = .success(
            EnrollmentFixtures.detail(roster: [enrolledHere, shared])
        )
        repository.detailResults[EnrollmentFixtures.avancadaId] = .success(
            EnrollmentFixtures.detail(
                summary: EnrollmentFixtures.summary(id: EnrollmentFixtures.avancadaId, name: "Avançada"),
                roster: [shared, onlyOther]
            )
        )
        let model = TurmaDetailModel(classId: EnrollmentFixtures.fundamentosId, repository: repository)
        await model.load()

        await model.loadCandidates()

        guard case .loaded(let candidates) = model.candidatesPhase else {
            Issue.record("expected loaded candidates, got \(model.candidatesPhase)")
            return
        }
        #expect(candidates.map(\.fullName) == ["Pedro Silveira"])
    }

    @Test("add success drops the candidate and reloads the detail")
    func addSuccess() async {
        let repository = FakeEnrollmentRepository()
        let candidate = EnrollmentFixtures.student(name: "Marina Costa")
        repository.classesResult = .success([EnrollmentFixtures.summary()])
        repository.detailResults[EnrollmentFixtures.fundamentosId] = .success(EnrollmentFixtures.detail(roster: []))
        repository.addResult = .success(
            EnrollmentResult(classId: EnrollmentFixtures.fundamentosId, studentId: candidate.studentId, status: .active)
        )
        let model = TurmaDetailModel(classId: EnrollmentFixtures.fundamentosId, repository: repository)
        await model.load()
        await model.loadCandidates()

        repository.detailResults[EnrollmentFixtures.fundamentosId] = .success(
            EnrollmentFixtures.detail(roster: [candidate])
        )
        await model.add(candidate)

        #expect(repository.addCalls.count == 1)
        #expect(repository.addCalls[0] == (EnrollmentFixtures.fundamentosId, candidate.studentId))
        #expect(model.actionError == nil)
        #expect(model.detail?.roster.map(\.studentId) == [candidate.studentId])
    }

    @Test("class.full and enrollment.already_enrolled map to their PT-BR copy (story 29)")
    func addConflicts() async {
        let repository = FakeEnrollmentRepository()
        let candidate = EnrollmentFixtures.student()
        repository.detailResults[EnrollmentFixtures.fundamentosId] = .success(EnrollmentFixtures.detail())
        let model = TurmaDetailModel(classId: EnrollmentFixtures.fundamentosId, repository: repository)
        await model.load()

        repository.addResult = .failure(.conflict(code: ApiErrorCode.classFull))
        await model.add(candidate)
        #expect(model.actionError == EnrollmentMessages.classFull)

        repository.addResult = .failure(.conflict(code: ApiErrorCode.alreadyEnrolled))
        await model.add(candidate)
        #expect(model.actionError == EnrollmentMessages.alreadyEnrolled)

        repository.addResult = .failure(.conflict(code: ApiErrorCode.classArchived))
        await model.add(candidate)
        #expect(model.actionError == EnrollmentMessages.classArchived)
    }
}

// MARK: - ResponsavelHomeModel

@Suite("ResponsavelHomeModel")
@MainActor
struct ResponsavelHomeModelTests {
    @Test("load lists the dependents with their class and next slot")
    func loadDependents() async throws {
        let repository = FakeEnrollmentRepository()
        repository.dependentsResult = .success([
            EnrollmentFixtures.dependent(),
            EnrollmentFixtures.dependent(name: "Júlia Silveira", enrolledClass: nil),
        ])
        let session = try await EnrollmentFixtures.signedInGuardianStore(permissions: [:])
        let model = ResponsavelHomeModel(repository: repository, session: session)

        await model.load()

        guard case .loaded(let dependents) = model.phase else {
            Issue.record("expected loaded, got \(model.phase)")
            return
        }
        #expect(dependents.count == 2)
        #expect(dependents[0].enrolledClass?.nextSlot?.nextSlotLabelPTBR == "Ter 18:00")
        #expect(dependents[1].enrolledClass == nil)
        #expect(model.canRegisterDependents)
    }

    @Test("dependents.register toggle off hides the register action (story 36)")
    func toggleOff() async throws {
        let repository = FakeEnrollmentRepository()
        repository.dependentsResult = .success([EnrollmentFixtures.dependent()])
        let session = try await EnrollmentFixtures.signedInGuardianStore(
            permissions: [PermissionKey.dependentsRegister: false]
        )
        let model = ResponsavelHomeModel(repository: repository, session: session)

        await model.load()

        #expect(!model.canRegisterDependents)
    }

    @Test("toggle stays default-on when the permission hydration fails")
    func toggleDefaultOn() async throws {
        let repository = FakeEnrollmentRepository()
        repository.dependentsResult = .success([])
        let session = try await EnrollmentFixtures.signedInGuardianStore(permissions: [:], meFails: true)
        let model = ResponsavelHomeModel(repository: repository, session: session)

        await model.load()

        #expect(model.canRegisterDependents)
    }

    @Test("a registered dependent closes the sheet and reloads")
    func registeredReloads() async throws {
        let repository = FakeEnrollmentRepository()
        repository.dependentsResult = .success([])
        let session = try await EnrollmentFixtures.signedInGuardianStore(permissions: [:])
        let model = ResponsavelHomeModel(repository: repository, session: session)
        await model.load()
        model.showRegisterSheet = true

        repository.dependentsResult = .success([EnrollmentFixtures.dependent()])
        await model.dependentRegistered()

        #expect(!model.showRegisterSheet)
        guard case .loaded(let dependents) = model.phase else {
            Issue.record("expected loaded, got \(model.phase)")
            return
        }
        #expect(dependents.count == 1)
    }
}

// MARK: - RegisterDependentModel

@Suite("RegisterDependentModel")
@MainActor
struct RegisterDependentModelTests {
    @Test("no suggestion is fetched while the birth date is incomplete or invalid")
    func suggestionGate() async {
        let repository = FakeEnrollmentRepository()
        let model = RegisterDependentModel(repository: repository)

        model.birthDateBR = "10"
        model.birthDateBR = "10/06"
        model.birthDateBR = "10/06/20"
        model.birthDateBR = "31/02/2017"
        await Task.yield()

        #expect(repository.suggestionCalls.isEmpty)
        #expect(model.suggestionPhase == .idle)
    }

    @Test("a complete valid birth date fetches the suggestion once (ISO form)")
    func suggestionFetch() async {
        let repository = FakeEnrollmentRepository()
        repository.suggestionResult = .success(EnrollmentFixtures.suggestion())
        let model = RegisterDependentModel(repository: repository)

        model.birthDateBR = "10/06/2017"
        await waitForSuggestion(model)

        #expect(repository.suggestionCalls == ["2017-06-10"])
        #expect(model.suggestion?.name == "Kids")
        #expect(model.suggestion?.schedules.suggestionLinePTBR == "Ter e Qui 18:00")
        #expect(model.suggestionAccepted)
    }

    @Test("no age match keeps the cadastro possible without a class")
    func suggestionNoMatch() async {
        let repository = FakeEnrollmentRepository()
        repository.suggestionResult = .success(nil)
        let model = RegisterDependentModel(repository: repository)

        model.birthDateBR = "01/01/1990"
        await waitForSuggestion(model)

        #expect(model.suggestionPhase == .loaded(nil))
        #expect(model.suggestion == nil)
    }

    @Test("register sends the accepted suggestion class (stories 32-33)")
    func registerWithSuggestion() async {
        let repository = FakeEnrollmentRepository()
        repository.suggestionResult = .success(EnrollmentFixtures.suggestion())
        repository.registerResult = .success(
            RegisteredDependent(dependent: EnrollmentFixtures.dependent(), enrolled: true)
        )
        let model = RegisterDependentModel(repository: repository)
        model.fullName = "Pedro Silveira"
        model.birthDateBR = "10/06/2017"
        await waitForSuggestion(model)

        let result = await model.register()

        #expect(result?.enrolled == true)
        #expect(repository.registerCalls.count == 1)
        #expect(repository.registerCalls[0].fullName == "Pedro Silveira")
        #expect(repository.registerCalls[0].birthDate == "2017-06-10")
        #expect(repository.registerCalls[0].classId == EnrollmentFixtures.kidsId)
        #expect(model.phase == .registered(message: EnrollmentMessages.registeredEnrolled))
    }

    @Test("declining the suggestion registers without a class")
    func registerDeclinedSuggestion() async {
        let repository = FakeEnrollmentRepository()
        repository.suggestionResult = .success(EnrollmentFixtures.suggestion())
        repository.registerResult = .success(
            RegisteredDependent(dependent: EnrollmentFixtures.dependent(enrolledClass: nil), enrolled: false)
        )
        let model = RegisterDependentModel(repository: repository)
        model.fullName = "Pedro Silveira"
        model.birthDateBR = "10/06/2017"
        await waitForSuggestion(model)

        model.suggestionAccepted = false
        _ = await model.register()

        #expect(repository.registerCalls[0].classId == nil)
        #expect(model.phase == .registered(message: EnrollmentMessages.registeredNotEnrolled))
    }

    @Test("full suggested class still registers, surfacing the not-enrolled copy (story 34)")
    func registerFullClass() async {
        let repository = FakeEnrollmentRepository()
        repository.suggestionResult = .success(EnrollmentFixtures.suggestion())
        repository.registerResult = .success(
            RegisteredDependent(dependent: EnrollmentFixtures.dependent(enrolledClass: nil), enrolled: false)
        )
        let model = RegisterDependentModel(repository: repository)
        model.fullName = "Pedro Silveira"
        model.birthDateBR = "10/06/2017"
        await waitForSuggestion(model)

        let result = await model.register()

        #expect(result?.enrolled == false)
        #expect(model.phase == .registered(message: EnrollmentMessages.registeredNotEnrolled))
    }

    @Test("empty fields and invalid dates fail locally with PT-BR copy")
    func localValidation() async {
        let repository = FakeEnrollmentRepository()
        let model = RegisterDependentModel(repository: repository)

        _ = await model.register()
        #expect(model.phase == .failed(message: EnrollmentMessages.fillDependentFields))

        model.fullName = "Pedro"
        model.birthDateBR = "99/99/9999"
        _ = await model.register()
        #expect(model.phase == .failed(message: EnrollmentMessages.invalidBirthDate))
        #expect(repository.registerCalls.isEmpty)
    }

    @Test("server-side toggle denial maps to the PT-BR permission copy (story 36)")
    func serverToggleDenial() async {
        let repository = FakeEnrollmentRepository()
        repository.suggestionResult = .success(nil)
        repository.registerResult = .failure(.forbidden(code: ApiErrorCode.permissionDisabled))
        let model = RegisterDependentModel(repository: repository)
        model.fullName = "Pedro Silveira"
        model.birthDateBR = "10/06/2017"
        await waitForSuggestion(model)

        let result = await model.register()

        #expect(result == nil)
        #expect(model.phase == .failed(message: EnrollmentMessages.registerDisabled))
    }

    /// The suggestion fetch runs in a fire-and-forget task; spin until it
    /// settles (bounded, no clock dependency).
    private func waitForSuggestion(_ model: RegisterDependentModel) async {
        for _ in 0..<1000 {
            if case .loading = model.suggestionPhase {
                await Task.yield()
            } else if case .idle = model.suggestionPhase {
                await Task.yield()
            } else {
                return
            }
        }
    }
}
