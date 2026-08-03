// Repository seam for the auth slice (ticket 02: protocols in TatameCore,
// implementations in TatameAPI; features depend only on this protocol).

import Foundation

public protocol AuthRepository: Sendable {
    /// POST /auth/login with `transport: body`. Throws `ApiError`
    /// (`.unauthorized(auth.invalid_credentials)` on bad credentials;
    /// `.unauthorized(auth.mfa_required)` for the platform TOTP challenge —
    /// mobile routes those users to the web console).
    func login(email: String, password: String) async throws -> AuthSession

    /// Cold-start restore: single-flight refresh (rotating the stored
    /// refresh token) followed by GET /auth/me. Throws `ApiError`.
    func restoreSession() async throws -> SessionContext

    /// POST /auth/switch — re-issue the access token for another membership.
    func switchMembership(_ membershipId: UUID) async throws -> SwitchedMembership

    /// POST /auth/logout — revoke the current session server-side.
    func logout() async throws
}

/// Default used by environment entries / previews; every call traps.
public struct UnimplementedAuthRepository: AuthRepository {
    public init() {}

    public func login(email _: String, password _: String) async throws -> AuthSession {
        fatalError("AuthRepository not injected")
    }

    public func restoreSession() async throws -> SessionContext {
        fatalError("AuthRepository not injected")
    }

    public func switchMembership(_: UUID) async throws -> SwitchedMembership {
        fatalError("AuthRepository not injected")
    }

    public func logout() async throws {
        fatalError("AuthRepository not injected")
    }
}
