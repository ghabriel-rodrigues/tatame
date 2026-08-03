import Foundation
import Testing
@testable import TatameCore

// MARK: - Fakes (ticket 07 seam: repository protocol + token-store fakes)

final class FakeRefreshTokenStore: RefreshTokenStore, @unchecked Sendable {
    var token: String?
    private(set) var clearCount = 0

    init(token: String? = nil) {
        self.token = token
    }

    func loadRefreshToken() throws -> String? { token }
    func storeRefreshToken(_ token: String) throws { self.token = token }
    func clearRefreshToken() throws {
        token = nil
        clearCount += 1
    }
}

final class FakeAccessTokenStore: AccessTokenStore, @unchecked Sendable {
    private(set) var accessToken: String?
    private(set) var setCalls: [String?] = []

    func setAccessToken(_ token: String?) async {
        accessToken = token
        setCalls.append(token)
    }
}

final class FakeAuthRepository: AuthRepository, @unchecked Sendable {
    var loginResult: Result<AuthSession, ApiError> = .failure(.unknown(status: 0, code: nil))
    var restoreResult: Result<SessionContext, ApiError> = .failure(.unknown(status: 0, code: nil))
    var switchResult: Result<SwitchedMembership, ApiError> = .failure(.unknown(status: 0, code: nil))
    var logoutError: ApiError?
    private(set) var logoutCount = 0
    private(set) var switchedTo: [UUID] = []

    func login(email _: String, password _: String) async throws -> AuthSession {
        try loginResult.get()
    }

    func restoreSession() async throws -> SessionContext {
        try restoreResult.get()
    }

    func switchMembership(_ membershipId: UUID) async throws -> SwitchedMembership {
        switchedTo.append(membershipId)
        return try switchResult.get()
    }

    func logout() async throws {
        logoutCount += 1
        if let logoutError { throw logoutError }
    }
}

// MARK: - Fixtures

enum Fixtures {
    static let membershipId = UUID()
    static let otherMembershipId = UUID()

    static func membership(
        id: UUID = membershipId,
        role: MembershipRole = .student,
        academyStatus: AcademyStatus? = .active
    ) -> Membership {
        Membership(
            id: id,
            type: [.owner, .support, .finance].contains(role) ? .platform : .academy,
            role: role,
            tenantId: UUID(),
            academyName: "Alliance Leblon",
            academyStatus: academyStatus,
            status: "active"
        )
    }

    static func session(memberships: [Membership]? = nil, activeId: UUID = membershipId) -> AuthSession {
        AuthSession(
            user: UserSummary(id: UUID(), email: "aluno@tatame.dev", fullName: "Aluno Dev"),
            memberships: memberships ?? [membership()],
            activeMembershipId: activeId,
            accessToken: "access-1",
            accessExpiresIn: 900,
            refreshToken: "refresh-1"
        )
    }

    static func context(role: MembershipRole = .student, academyStatus: AcademyStatus? = .active) -> SessionContext {
        let active = membership(role: role, academyStatus: academyStatus)
        return SessionContext(
            user: UserSummary(id: UUID(), email: "aluno@tatame.dev", fullName: "Aluno Dev"),
            memberships: [active],
            activeMembership: active
        )
    }
}

// MARK: - Tests

@Suite("SessionStore")
@MainActor
struct SessionStoreTests {
    @Test("starts unknown")
    func initialState() {
        let store = SessionStore(
            repository: FakeAuthRepository(),
            refreshTokenStore: FakeRefreshTokenStore(),
            accessTokenStore: FakeAccessTokenStore()
        )
        #expect(store.state == .unknown)
    }

    @Test("bootstrap without a stored refresh token lands on login, no message")
    func bootstrapNoToken() async {
        let store = SessionStore(
            repository: FakeAuthRepository(),
            refreshTokenStore: FakeRefreshTokenStore(token: nil),
            accessTokenStore: FakeAccessTokenStore()
        )
        await store.bootstrap()
        #expect(store.state == .signedOut(message: nil))
    }

    @Test("bootstrap with a valid stored session restores silently")
    func bootstrapRestores() async {
        let repository = FakeAuthRepository()
        let context = Fixtures.context()
        repository.restoreResult = .success(context)
        let store = SessionStore(
            repository: repository,
            refreshTokenStore: FakeRefreshTokenStore(token: "stored"),
            accessTokenStore: FakeAccessTokenStore()
        )
        await store.bootstrap()
        #expect(store.state == .signedIn(context))
    }

    @Test("bootstrap with a revoked session wipes and routes to login with message")
    func bootstrapRevoked() async {
        let repository = FakeAuthRepository()
        repository.restoreResult = .failure(.unauthorized(code: ApiErrorCode.refreshReused))
        let keychain = FakeRefreshTokenStore(token: "stolen")
        let access = FakeAccessTokenStore()
        let store = SessionStore(repository: repository, refreshTokenStore: keychain, accessTokenStore: access)
        await store.bootstrap()
        #expect(store.state == .signedOut(message: SessionMessages.sessionExpired))
        #expect(keychain.token == nil)
        #expect(access.setCalls.last == .some(nil))
    }

    @Test("bootstrap offline keeps the stored token and routes to login with offline message")
    func bootstrapOffline() async {
        let repository = FakeAuthRepository()
        repository.restoreResult = .failure(.network(.notConnectedToInternet))
        let keychain = FakeRefreshTokenStore(token: "stored")
        let store = SessionStore(
            repository: repository,
            refreshTokenStore: keychain,
            accessTokenStore: FakeAccessTokenStore()
        )
        await store.bootstrap()
        #expect(store.state == .signedOut(message: SessionMessages.offline))
        #expect(keychain.token == "stored")
    }

    @Test("login with a single membership stores tokens and signs in")
    func loginSingleMembership() async throws {
        let repository = FakeAuthRepository()
        let session = Fixtures.session()
        repository.loginResult = .success(session)
        let keychain = FakeRefreshTokenStore()
        let access = FakeAccessTokenStore()
        let store = SessionStore(repository: repository, refreshTokenStore: keychain, accessTokenStore: access)

        let returned = try await store.login(email: "aluno@tatame.dev", password: "TatameDev!123")

        #expect(returned == session)
        #expect(keychain.token == "refresh-1")
        #expect(access.accessToken == "access-1")
        guard case .signedIn(let context) = store.state else {
            Issue.record("expected signedIn, got \(store.state)")
            return
        }
        #expect(context.activeMembership.id == Fixtures.membershipId)
    }

    @Test("login with multiple memberships stays signed out until a choice is made")
    func loginMultipleMemberships() async throws {
        let repository = FakeAuthRepository()
        let memberships = [
            Fixtures.membership(id: Fixtures.membershipId, role: .professor),
            Fixtures.membership(id: Fixtures.otherMembershipId, role: .student),
        ]
        repository.loginResult = .success(Fixtures.session(memberships: memberships))
        let store = SessionStore(
            repository: repository,
            refreshTokenStore: FakeRefreshTokenStore(),
            accessTokenStore: FakeAccessTokenStore()
        )

        let session = try await store.login(email: "x@tatame.dev", password: "pw")

        #expect(session.memberships.count == 2)
        #expect(store.state == .unknown)
    }

    @Test("selecting the login-resolved membership signs in without switching")
    func selectResolvedMembership() async throws {
        let repository = FakeAuthRepository()
        let memberships = [
            Fixtures.membership(id: Fixtures.membershipId, role: .professor),
            Fixtures.membership(id: Fixtures.otherMembershipId, role: .student),
        ]
        let session = Fixtures.session(memberships: memberships)
        let store = SessionStore(
            repository: repository,
            refreshTokenStore: FakeRefreshTokenStore(),
            accessTokenStore: FakeAccessTokenStore()
        )

        try await store.selectMembership(Fixtures.membershipId, from: session)

        #expect(repository.switchedTo.isEmpty)
        guard case .signedIn(let context) = store.state else {
            Issue.record("expected signedIn, got \(store.state)")
            return
        }
        #expect(context.activeMembership.role == .professor)
    }

    @Test("selecting another membership switches server-side and updates the access token")
    func selectOtherMembership() async throws {
        let repository = FakeAuthRepository()
        let memberships = [
            Fixtures.membership(id: Fixtures.membershipId, role: .professor),
            Fixtures.membership(id: Fixtures.otherMembershipId, role: .student),
        ]
        let session = Fixtures.session(memberships: memberships)
        repository.switchResult = .success(
            SwitchedMembership(
                accessToken: "access-2",
                accessExpiresIn: 900,
                activeMembershipId: Fixtures.otherMembershipId
            )
        )
        let access = FakeAccessTokenStore()
        let store = SessionStore(
            repository: repository,
            refreshTokenStore: FakeRefreshTokenStore(),
            accessTokenStore: access
        )

        try await store.selectMembership(Fixtures.otherMembershipId, from: session)

        #expect(repository.switchedTo == [Fixtures.otherMembershipId])
        #expect(access.accessToken == "access-2")
        guard case .signedIn(let context) = store.state else {
            Issue.record("expected signedIn, got \(store.state)")
            return
        }
        #expect(context.activeMembership.role == .student)
    }

    @Test("logout revokes server-side and wipes tokens")
    func logoutRevokesAndWipes() async {
        let repository = FakeAuthRepository()
        let keychain = FakeRefreshTokenStore(token: "refresh-1")
        let access = FakeAccessTokenStore()
        let store = SessionStore(repository: repository, refreshTokenStore: keychain, accessTokenStore: access)

        await store.logout()

        #expect(repository.logoutCount == 1)
        #expect(keychain.token == nil)
        #expect(access.setCalls.last == .some(nil))
        #expect(store.state == .signedOut(message: nil))
    }

    @Test("logout completes locally even when the revoke call fails (story 52)")
    func logoutSurvivesNetworkFailure() async {
        let repository = FakeAuthRepository()
        repository.logoutError = .network(.notConnectedToInternet)
        let keychain = FakeRefreshTokenStore(token: "refresh-1")
        let store = SessionStore(
            repository: repository,
            refreshTokenStore: keychain,
            accessTokenStore: FakeAccessTokenStore()
        )

        await store.logout()

        #expect(keychain.token == nil)
        #expect(store.state == .signedOut(message: nil))
    }

    @Test("sessionExpired wipes and routes to login with the expiry message")
    func sessionExpired() async {
        let keychain = FakeRefreshTokenStore(token: "refresh-1")
        let store = SessionStore(
            repository: FakeAuthRepository(),
            refreshTokenStore: keychain,
            accessTokenStore: FakeAccessTokenStore()
        )

        await store.sessionExpired()

        #expect(keychain.token == nil)
        #expect(store.state == .signedOut(message: SessionMessages.sessionExpired))
    }
}
