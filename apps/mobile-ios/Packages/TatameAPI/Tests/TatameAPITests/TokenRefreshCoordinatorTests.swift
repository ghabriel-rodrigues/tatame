import Foundation
import Testing
@testable import TatameAPI
import TatameCore

// MARK: - Fakes

final class MemoryRefreshTokenStore: RefreshTokenStore, @unchecked Sendable {
    private let lock = NSLock()
    private var _token: String?

    init(token: String? = nil) {
        _token = token
    }

    var token: String? {
        lock.withLock { _token }
    }

    func loadRefreshToken() throws -> String? {
        lock.withLock { _token }
    }

    func storeRefreshToken(_ token: String) throws {
        lock.withLock { _token = token }
    }

    func clearRefreshToken() throws {
        lock.withLock { _token = nil }
    }
}

/// Counts refresh-executor invocations and lets tests hold the refresh open
/// so several callers can pile up on the same in-flight task.
actor RefreshExecutorSpy {
    private(set) var calls: [String] = []
    private var result: Result<TokenPair, ApiError>
    private var gate: CheckedContinuation<Void, Never>?
    private var gated = false

    init(result: Result<TokenPair, ApiError>) {
        self.result = result
    }

    func holdOpen() {
        gated = true
    }

    func release() {
        gate?.resume()
        gate = nil
        gated = false
    }

    func execute(_ refreshToken: String) async throws -> TokenPair {
        calls.append(refreshToken)
        if gated {
            await withCheckedContinuation { gate = $0 }
        }
        return try result.get()
    }
}

final class InvalidationCounter: @unchecked Sendable {
    private let lock = NSLock()
    private var _count = 0

    var count: Int {
        lock.withLock { _count }
    }

    func increment() {
        lock.withLock { _count += 1 }
    }
}

// MARK: - Tests

@Suite("TokenRefreshCoordinator")
struct TokenRefreshCoordinatorTests {
    private func makeCoordinator(
        store: MemoryRefreshTokenStore,
        executor: RefreshExecutorSpy,
        invalidations: InvalidationCounter = InvalidationCounter()
    ) -> TokenRefreshCoordinator {
        TokenRefreshCoordinator(
            refreshTokenStore: store,
            refreshExecutor: { try await executor.execute($0) },
            onSessionInvalidated: { invalidations.increment() }
        )
    }

    @Test("successful refresh rotates the stored token and updates the access token")
    func successfulRefresh() async throws {
        let store = MemoryRefreshTokenStore(token: "refresh-old")
        let executor = RefreshExecutorSpy(
            result: .success(TokenPair(accessToken: "access-new", accessExpiresIn: 900, refreshToken: "refresh-new"))
        )
        let coordinator = makeCoordinator(store: store, executor: executor)

        let token = try await coordinator.refreshAccessToken()

        #expect(token == "access-new")
        #expect(store.token == "refresh-new")
        #expect(await coordinator.currentAccessToken == "access-new")
        #expect(await executor.calls == ["refresh-old"])
    }

    @Test("concurrent callers share one in-flight refresh (single-flight)")
    func singleFlight() async throws {
        let store = MemoryRefreshTokenStore(token: "refresh-old")
        let executor = RefreshExecutorSpy(
            result: .success(TokenPair(accessToken: "access-new", accessExpiresIn: 900, refreshToken: "refresh-new"))
        )
        let coordinator = makeCoordinator(store: store, executor: executor)
        await executor.holdOpen()

        async let first = coordinator.refreshAccessToken()
        async let second = coordinator.refreshAccessToken()
        async let third = coordinator.refreshAccessToken()
        // Let all three land on the coordinator before releasing the gate.
        while await executor.calls.isEmpty {
            await Task.yield()
        }
        await executor.release()

        let tokens = try await [first, second, third]
        #expect(tokens == ["access-new", "access-new", "access-new"])
        #expect(await executor.calls.count == 1)
    }

    @Test("auth failure wipes tokens and signals session death once for all waiters")
    func authFailureInvalidatesOnce() async {
        let store = MemoryRefreshTokenStore(token: "refresh-reused")
        let executor = RefreshExecutorSpy(
            result: .failure(.unauthorized(code: ApiErrorCode.refreshReused))
        )
        let invalidations = InvalidationCounter()
        let coordinator = makeCoordinator(store: store, executor: executor, invalidations: invalidations)
        await executor.holdOpen()

        async let first: String? = try? coordinator.refreshAccessToken()
        async let second: String? = try? coordinator.refreshAccessToken()
        while await executor.calls.isEmpty {
            await Task.yield()
        }
        await executor.release()

        let results = await [first, second]
        #expect(results == [nil, nil])
        #expect(store.token == nil)
        #expect(invalidations.count == 1)
        #expect(await coordinator.currentAccessToken == nil)
    }

    @Test("network failure does not wipe the stored refresh token")
    func networkFailureKeepsTokens() async {
        let store = MemoryRefreshTokenStore(token: "refresh-old")
        let executor = RefreshExecutorSpy(result: .failure(.network(.notConnectedToInternet)))
        let invalidations = InvalidationCounter()
        let coordinator = makeCoordinator(store: store, executor: executor, invalidations: invalidations)

        let result = try? await coordinator.refreshAccessToken()

        #expect(result == nil)
        #expect(store.token == "refresh-old")
        #expect(invalidations.count == 0)
    }

    @Test("refresh without a stored token fails as unauthenticated and invalidates")
    func missingTokenFails() async {
        let store = MemoryRefreshTokenStore(token: nil)
        let executor = RefreshExecutorSpy(
            result: .success(TokenPair(accessToken: "x", accessExpiresIn: 900, refreshToken: nil))
        )
        let invalidations = InvalidationCounter()
        let coordinator = makeCoordinator(store: store, executor: executor, invalidations: invalidations)

        do {
            _ = try await coordinator.refreshAccessToken()
            Issue.record("expected a throw")
        } catch let error as ApiError {
            #expect(error == .unauthorized(code: ApiErrorCode.unauthenticated))
        } catch {
            Issue.record("unexpected error: \(error)")
        }
        #expect(await executor.calls.isEmpty)
        #expect(invalidations.count == 1)
    }
}
