import Foundation
import Testing
@testable import AuthFeature
import TatameCore

// MARK: - Fakes (repository-protocol seam, ticket 06/07)

final class FakeRefreshTokenStore: RefreshTokenStore, @unchecked Sendable {
    var token: String?

    func loadRefreshToken() throws -> String? { token }
    func storeRefreshToken(_ token: String) throws { self.token = token }
    func clearRefreshToken() throws { token = nil }
}

final class FakeAccessTokenStore: AccessTokenStore, @unchecked Sendable {
    private(set) var accessToken: String?

    func setAccessToken(_ token: String?) async { accessToken = token }
}

final class FakeAuthRepository: AuthRepository, @unchecked Sendable {
    var loginResult: Result<AuthSession, ApiError> = .failure(.unknown(status: 0, code: nil))
    var switchResult: Result<SwitchedMembership, ApiError> = .failure(.unknown(status: 0, code: nil))

    func login(email _: String, password _: String) async throws -> AuthSession {
        try loginResult.get()
    }

    func restoreSession() async throws -> SessionContext {
        throw ApiError.unknown(status: 0, code: nil)
    }

    func switchMembership(_ membershipId: UUID) async throws -> SwitchedMembership {
        try switchResult.get()
    }

    func logout() async throws {}
}

// MARK: - Fixtures

private let studentMembershipId = UUID()
private let professorMembershipId = UUID()

private func membership(id: UUID, role: MembershipRole) -> Membership {
    Membership(
        id: id,
        type: .academy,
        role: role,
        tenantId: UUID(),
        academyName: "Alliance Leblon",
        academyStatus: .active,
        status: "active"
    )
}

private func session(memberships: [Membership], activeId: UUID) -> AuthSession {
    AuthSession(
        user: UserSummary(id: UUID(), email: "aluno@tatame.dev", fullName: "Aluno Dev"),
        memberships: memberships,
        activeMembershipId: activeId,
        accessToken: "access-1",
        accessExpiresIn: 900,
        refreshToken: "refresh-1"
    )
}

@MainActor
private func makeModel(repository: FakeAuthRepository) -> (LoginModel, SessionStore) {
    let store = SessionStore(
        repository: repository,
        refreshTokenStore: FakeRefreshTokenStore(),
        accessTokenStore: FakeAccessTokenStore()
    )
    return (LoginModel(session: store), store)
}

// MARK: - Tests

@Suite("LoginModel")
@MainActor
struct LoginModelTests {
    @Test("empty fields fail locally with PT-BR copy")
    func emptyFields() async {
        let (model, _) = makeModel(repository: FakeAuthRepository())
        await model.submit()
        #expect(model.phase == .failed(message: LoginModel.Messages.fillFields))
    }

    @Test("invalid credentials map to the PT-BR error")
    func invalidCredentials() async {
        let repository = FakeAuthRepository()
        repository.loginResult = .failure(.unauthorized(code: ApiErrorCode.invalidCredentials))
        let (model, store) = makeModel(repository: repository)
        model.email = "aluno@tatame.dev"
        model.password = "wrong"

        await model.submit()

        #expect(model.phase == .failed(message: LoginModel.Messages.invalidCredentials))
        #expect(store.state == .unknown)
    }

    @Test("network failure maps to the offline message")
    func offline() async {
        let repository = FakeAuthRepository()
        repository.loginResult = .failure(.network(.notConnectedToInternet))
        let (model, _) = makeModel(repository: repository)
        model.email = "aluno@tatame.dev"
        model.password = "TatameDev!123"

        await model.submit()

        #expect(model.phase == .failed(message: LoginModel.Messages.offline))
    }

    @Test("platform MFA challenge points to the web console")
    func mfaChallenge() async {
        let repository = FakeAuthRepository()
        repository.loginResult = .failure(.unauthorized(code: ApiErrorCode.mfaRequired))
        let (model, _) = makeModel(repository: repository)
        model.email = "owner@tatame.dev"
        model.password = "pw"

        await model.submit()

        #expect(model.phase == .failed(message: LoginModel.Messages.mfaWebOnly))
    }

    @Test("single membership logs straight in (no chooser)")
    func singleMembership() async {
        let repository = FakeAuthRepository()
        let single = membership(id: studentMembershipId, role: .student)
        repository.loginResult = .success(session(memberships: [single], activeId: studentMembershipId))
        let (model, store) = makeModel(repository: repository)
        model.email = "aluno@tatame.dev"
        model.password = "TatameDev!123"

        await model.submit()

        #expect(model.phase == .idle)
        guard case .signedIn(let context) = store.state else {
            Issue.record("expected signedIn, got \(store.state)")
            return
        }
        #expect(context.route == .aluno(readOnly: false))
    }

    @Test("multiple memberships move to the chooser phase")
    func multipleMemberships() async {
        let repository = FakeAuthRepository()
        let memberships = [
            membership(id: professorMembershipId, role: .professor),
            membership(id: studentMembershipId, role: .student),
        ]
        repository.loginResult = .success(session(memberships: memberships, activeId: professorMembershipId))
        let (model, store) = makeModel(repository: repository)
        model.email = "multi@tatame.dev"
        model.password = "pw"

        await model.submit()

        guard case .choosingMembership(let pending) = model.phase else {
            Issue.record("expected chooser, got \(model.phase)")
            return
        }
        #expect(pending.memberships.count == 2)
        #expect(store.state == .unknown)
    }

    @Test("choosing the resolved membership completes the login")
    func chooseResolved() async {
        let repository = FakeAuthRepository()
        let memberships = [
            membership(id: professorMembershipId, role: .professor),
            membership(id: studentMembershipId, role: .student),
        ]
        repository.loginResult = .success(session(memberships: memberships, activeId: professorMembershipId))
        let (model, store) = makeModel(repository: repository)
        model.email = "multi@tatame.dev"
        model.password = "pw"
        await model.submit()

        await model.choose(memberships[0])

        #expect(model.phase == .idle)
        guard case .signedIn(let context) = store.state else {
            Issue.record("expected signedIn, got \(store.state)")
            return
        }
        #expect(context.route == .professor(readOnly: false))
    }

    @Test("choosing another membership switches server-side then completes")
    func chooseOther() async {
        let repository = FakeAuthRepository()
        let memberships = [
            membership(id: professorMembershipId, role: .professor),
            membership(id: studentMembershipId, role: .student),
        ]
        repository.loginResult = .success(session(memberships: memberships, activeId: professorMembershipId))
        repository.switchResult = .success(
            SwitchedMembership(accessToken: "access-2", accessExpiresIn: 900, activeMembershipId: studentMembershipId)
        )
        let (model, store) = makeModel(repository: repository)
        model.email = "multi@tatame.dev"
        model.password = "pw"
        await model.submit()

        await model.choose(memberships[1])

        guard case .signedIn(let context) = store.state else {
            Issue.record("expected signedIn, got \(store.state)")
            return
        }
        #expect(context.route == .aluno(readOnly: false))
    }

    @Test("cancelling the chooser returns to the form")
    func cancelChooser() async {
        let repository = FakeAuthRepository()
        let memberships = [
            membership(id: professorMembershipId, role: .professor),
            membership(id: studentMembershipId, role: .student),
        ]
        repository.loginResult = .success(session(memberships: memberships, activeId: professorMembershipId))
        let (model, _) = makeModel(repository: repository)
        model.email = "multi@tatame.dev"
        model.password = "pw"
        await model.submit()

        model.cancelChooser()

        #expect(model.phase == .idle)
    }
}
