// TokenRefreshCoordinator — actor providing single-flight refresh (ticket 02,
// decision 4). Holds the access token in memory (nowhere else); rotates the
// refresh token in the Keychain through the `RefreshTokenStore` seam; signals
// session death exactly once via `onSessionInvalidated`.

import Foundation
import TatameCore

public actor TokenRefreshCoordinator: AccessTokenStore {
    /// Executes the actual POST /auth/refresh (body transport) given the
    /// stored refresh token. Injected: the factory wires the generated
    /// client; tests wire a counting fake.
    public typealias RefreshExecutor = @Sendable (_ refreshToken: String) async throws -> TokenPair

    private let refreshTokenStore: any RefreshTokenStore
    private let refreshExecutor: RefreshExecutor
    private let onSessionInvalidated: @Sendable () async -> Void

    private var accessToken: String?
    private var inFlightRefresh: Task<String, any Error>?

    public init(
        refreshTokenStore: any RefreshTokenStore,
        refreshExecutor: @escaping RefreshExecutor,
        onSessionInvalidated: @escaping @Sendable () async -> Void
    ) {
        self.refreshTokenStore = refreshTokenStore
        self.refreshExecutor = refreshExecutor
        self.onSessionInvalidated = onSessionInvalidated
    }

    /// The current in-memory access token (nil when signed out).
    public var currentAccessToken: String? {
        accessToken
    }

    // MARK: AccessTokenStore

    public func setAccessToken(_ token: String?) {
        accessToken = token
    }

    // MARK: Single-flight refresh

    /// Refreshes the access token. Concurrent callers await the same
    /// in-flight task instead of stampeding the endpoint; a failed refresh
    /// fails all waiters, and an auth failure additionally wipes tokens and
    /// fires `onSessionInvalidated` once.
    public func refreshAccessToken() async throws -> String {
        if let inFlightRefresh {
            return try await inFlightRefresh.value
        }
        let store = refreshTokenStore
        let executor = refreshExecutor
        let task = Task { () throws -> String in
            guard let storedToken = try store.loadRefreshToken() else {
                throw ApiError.unauthorized(code: ApiErrorCode.unauthenticated)
            }
            let pair = try await executor(storedToken)
            if let rotated = pair.refreshToken {
                try store.storeRefreshToken(rotated)
            }
            return pair.accessToken
        }
        inFlightRefresh = task
        defer { inFlightRefresh = nil }
        do {
            let token = try await task.value
            accessToken = token
            return token
        } catch {
            let apiError = ApiErrorMapper.map(anyError: error)
            if apiError.isSessionInvalid {
                accessToken = nil
                try? refreshTokenStore.clearRefreshToken()
                await onSessionInvalidated()
            }
            throw apiError
        }
    }
}
