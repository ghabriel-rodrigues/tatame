// TatameClientFactory — the one place the generated Client is built (ticket
// 02): URLSessionTransport + AuthMiddleware stack, server URL injected by
// the app's composition root. Exports only TatameCore protocol conformances.

import Foundation
import OpenAPIRuntime
import OpenAPIURLSession
import TatameCore

/// The wired networking stack handed to the composition root.
public struct AuthStack: Sendable {
    /// Repository conforming to the TatameCore seam.
    public let repository: any AuthRepository
    /// The refresh coordinator in its `AccessTokenStore` role (SessionStore
    /// writes the access token through this after login/switch).
    public let accessTokenStore: any AccessTokenStore
    /// Enrollment slice repository (spec 003) — same authenticated client.
    public let enrollmentRepository: any EnrollmentRepository
    /// Attendance slice repository (spec 004) — same authenticated client
    /// plus the hand-rolled SSE stream (issue 09).
    public let attendanceRepository: any AttendanceRepository
}

public enum TatameClientFactory {
    /// Builds the auth slice's networking stack.
    ///
    /// - Parameters:
    ///   - serverURL: API origin (the spec's paths already carry `/v1`).
    ///   - refreshTokenStore: Keychain-backed store (production) or a fake.
    ///   - onSessionInvalidated: fired exactly once when a refresh fails
    ///     with an auth error — wire it to `SessionStore.sessionExpired()`.
    public static func makeAuthStack(
        serverURL: URL,
        refreshTokenStore: any RefreshTokenStore,
        onSessionInvalidated: @escaping @Sendable () async -> Void
    ) -> AuthStack {
        // Bare client (no auth middleware) used exclusively by the refresh
        // executor: refresh carries no bearer and must never recurse.
        let bareClient = Client(serverURL: serverURL, transport: URLSessionTransport())
        let coordinator = TokenRefreshCoordinator(
            refreshTokenStore: refreshTokenStore,
            refreshExecutor: { refreshToken in
                try await ApiErrorMapper.run {
                    let response = try await bareClient.AuthController_refresh_v1(
                        .init(body: .json(.init(refreshToken: refreshToken, transport: .body)))
                    )
                    switch response {
                    case .ok(let ok):
                        return TokenPair(dto: try ok.body.json)
                    case .undocumented(let statusCode, let payload):
                        throw await ApiErrorMapper.map(status: statusCode, payload: payload)
                    }
                }
            },
            onSessionInvalidated: onSessionInvalidated
        )
        let client = Client(
            serverURL: serverURL,
            configuration: TatameClientDefaults.configuration,
            transport: URLSessionTransport(),
            middlewares: [AuthMiddleware(coordinator: coordinator)]
        )
        return AuthStack(
            repository: LiveAuthRepository(client: client, coordinator: coordinator),
            accessTokenStore: coordinator,
            enrollmentRepository: LiveEnrollmentRepository(client: client),
            attendanceRepository: LiveAttendanceRepository(client: client, serverURL: serverURL)
        )
    }
}
