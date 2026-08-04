// SessionStore — the auth/session state machine (spec 001-auth, AUTH.25).
//
// Ticket 06: @MainActor @Observable in TatameCore, injected via the
// environment at the root; the auth gate and suspension/read-only routing
// switch on it. Ticket 02 primitives: access token in memory (behind
// `AccessTokenStore`, the TatameAPI refresh coordinator), refresh token in
// the Keychain (`RefreshTokenStore`, when-unlocked/this-device-only).

import Foundation
import Observation

/// Authentication/session state the root auth gate switches on.
public enum SessionState: Sendable, Equatable {
    /// App launch, session restoration not yet attempted.
    case unknown
    /// No valid session — show the auth flow. `message` carries the PT-BR
    /// reason when the user was signed out involuntarily (session expired).
    case signedOut(message: String?)
    /// Authenticated with a resolved active membership.
    case signedIn(SessionContext)
}

/// PT-BR copy for involuntary sign-outs (UI copy only; code stays English).
public enum SessionMessages {
    public static let sessionExpired = "Sua sessão expirou. Entre novamente."
    public static let offline = "Sem conexão com a internet. Tente novamente."
}

@MainActor
@Observable
public final class SessionStore {
    public private(set) var state: SessionState = .unknown

    @ObservationIgnored private let repository: any AuthRepository
    @ObservationIgnored private let refreshTokenStore: any RefreshTokenStore
    @ObservationIgnored private let accessTokenStore: any AccessTokenStore

    public init(
        repository: any AuthRepository,
        refreshTokenStore: any RefreshTokenStore,
        accessTokenStore: any AccessTokenStore
    ) {
        self.repository = repository
        self.refreshTokenStore = refreshTokenStore
        self.accessTokenStore = accessTokenStore
    }

    // MARK: Cold start

    /// Cold start: stored refresh token → silent refresh + /auth/me → route.
    /// No stored token → login. Dead session → login with a message.
    public func bootstrap() async {
        guard ((try? refreshTokenStore.loadRefreshToken()) ?? nil) != nil else {
            state = .signedOut(message: nil)
            return
        }
        do {
            let context = try await repository.restoreSession()
            state = .signedIn(context)
        } catch let error as ApiError {
            switch error {
            case .unauthorized:
                await wipeLocalSession()
                state = .signedOut(message: SessionMessages.sessionExpired)
            case .network:
                // Offline cold start: no local profile cache yet (parity debt
                // vs spec story 7's degraded shell) — land on login instead.
                state = .signedOut(message: SessionMessages.offline)
            default:
                state = .signedOut(message: SessionMessages.sessionExpired)
            }
        } catch {
            state = .signedOut(message: SessionMessages.sessionExpired)
        }
    }

    // MARK: Login

    /// Logs in and persists the token pair. When the account has exactly one
    /// membership the store flips straight to `.signedIn`; with several, the
    /// caller (login UI) presents the chooser and finishes via
    /// `selectMembership(_:from:)`. Throws `ApiError` for the UI to map.
    public func login(email: String, password: String) async throws -> AuthSession {
        let session = try await repository.login(email: email, password: password)
        if let refresh = session.refreshToken {
            try? refreshTokenStore.storeRefreshToken(refresh)
        }
        await accessTokenStore.setAccessToken(session.accessToken)
        if session.memberships.count <= 1,
           let context = SessionContext(session: session, activeMembershipId: session.activeMembershipId) {
            state = .signedIn(context)
        }
        return session
    }

    /// Completes a multi-membership login: switches server-side when the
    /// chosen membership differs from the one login resolved.
    public func selectMembership(_ membershipId: UUID, from session: AuthSession) async throws {
        var activeId = session.activeMembershipId
        if membershipId != session.activeMembershipId {
            let switched = try await repository.switchMembership(membershipId)
            await accessTokenStore.setAccessToken(switched.accessToken)
            activeId = switched.activeMembershipId
        }
        guard let context = SessionContext(session: session, activeMembershipId: activeId) else {
            throw ApiError.decoding(description: "active membership missing from session")
        }
        state = .signedIn(context)
    }

    // MARK: Context re-hydration

    /// Re-fetches /auth/me to hydrate the toggleable `permissions` map (empty
    /// right after a fresh login). Best effort: failures keep the current
    /// context — the server enforces every permission regardless (spec 003).
    public func refreshPermissions() async {
        guard case .signedIn = state else { return }
        guard let context = try? await repository.me() else { return }
        if case .signedIn = state {
            state = .signedIn(context)
        }
    }

    // MARK: Logout & expiry

    /// Revokes server-side (best effort — local logout always completes,
    /// spec story 52) and wipes tokens.
    public func logout() async {
        try? await repository.logout()
        await wipeLocalSession()
        state = .signedOut(message: nil)
    }

    /// Entry point for the refresh coordinator's session-invalidated signal
    /// (refresh failed with an auth error mid-use).
    public func sessionExpired() async {
        await wipeLocalSession()
        state = .signedOut(message: SessionMessages.sessionExpired)
    }

    private func wipeLocalSession() async {
        try? refreshTokenStore.clearRefreshToken()
        await accessTokenStore.setAccessToken(nil)
    }
}
