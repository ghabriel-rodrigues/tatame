import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing
@testable import TatameAPI
import TatameCore

/// Records the requests `next` receives and serves canned responses in order.
final class NextSpy: @unchecked Sendable {
    private let lock = NSLock()
    private var responses: [(HTTPResponse, Data?)]
    private var _requests: [HTTPRequest] = []

    init(responses: [(HTTPResponse, Data?)]) {
        self.responses = responses
    }

    var requests: [HTTPRequest] {
        lock.withLock { _requests }
    }

    func callAsFunction(_ request: HTTPRequest, _: HTTPBody?, _: URL) async throws -> (HTTPResponse, HTTPBody?) {
        let response: (HTTPResponse, Data?) = lock.withLock {
            _requests.append(request)
            return responses.removeFirst()
        }
        return (response.0, response.1.map { HTTPBody($0) })
    }
}

@Suite("AuthMiddleware")
struct AuthMiddlewareTests {
    private static let baseURL = URL(string: "http://localhost:3000")!

    private func problem(status: Int, code: String) -> Data {
        Data("{\"status\":\(status),\"code\":\"\(code)\"}".utf8)
    }

    private func makeCoordinator(
        accessToken: String?,
        refreshedToken: String = "access-refreshed"
    ) async -> TokenRefreshCoordinator {
        let coordinator = TokenRefreshCoordinator(
            refreshTokenStore: MemoryRefreshTokenStore(token: "refresh-stored"),
            refreshExecutor: { _ in
                TokenPair(accessToken: refreshedToken, accessExpiresIn: 900, refreshToken: "refresh-rotated")
            },
            onSessionInvalidated: {}
        )
        await coordinator.setAccessToken(accessToken)
        return coordinator
    }

    @Test("injects the bearer header from the in-memory access token")
    func injectsBearer() async throws {
        let coordinator = await makeCoordinator(accessToken: "access-1")
        let middleware = AuthMiddleware(coordinator: coordinator)
        let next = NextSpy(responses: [(HTTPResponse(status: .ok), nil)])

        _ = try await middleware.intercept(
            HTTPRequest(method: .get, scheme: nil, authority: nil, path: "/v1/auth/me"),
            body: nil,
            baseURL: Self.baseURL,
            operationID: "AuthController_me_v1",
            next: { try await next($0, $1, $2) }
        )

        #expect(next.requests.count == 1)
        #expect(next.requests[0].headerFields[.authorization] == "Bearer access-1")
    }

    @Test("401 auth.token_expired triggers refresh and replays once with the new token")
    func retryOnceOnExpiredToken() async throws {
        let coordinator = await makeCoordinator(accessToken: "access-stale")
        let middleware = AuthMiddleware(coordinator: coordinator)
        let next = NextSpy(responses: [
            (HTTPResponse(status: .unauthorized), problem(status: 401, code: ApiErrorCode.tokenExpired)),
            (HTTPResponse(status: .ok), nil),
        ])

        let (response, _) = try await middleware.intercept(
            HTTPRequest(method: .get, scheme: nil, authority: nil, path: "/v1/auth/me"),
            body: nil,
            baseURL: Self.baseURL,
            operationID: "AuthController_me_v1",
            next: { try await next($0, $1, $2) }
        )

        #expect(response.status == .ok)
        #expect(next.requests.count == 2)
        #expect(next.requests[0].headerFields[.authorization] == "Bearer access-stale")
        #expect(next.requests[1].headerFields[.authorization] == "Bearer access-refreshed")
    }

    @Test("any other 401 propagates without retry (session-invalid path)")
    func otherUnauthorizedPropagates() async throws {
        let coordinator = await makeCoordinator(accessToken: "access-1")
        let middleware = AuthMiddleware(coordinator: coordinator)
        let next = NextSpy(responses: [
            (HTTPResponse(status: .unauthorized), problem(status: 401, code: ApiErrorCode.invalidCredentials))
        ])

        let (response, body) = try await middleware.intercept(
            HTTPRequest(method: .post, scheme: nil, authority: nil, path: "/v1/auth/login"),
            body: nil,
            baseURL: Self.baseURL,
            operationID: "AuthController_login_v1",
            next: { try await next($0, $1, $2) }
        )

        #expect(response.status == .unauthorized)
        #expect(next.requests.count == 1)
        // The buffered problem body is preserved for downstream mapping.
        let data = try #require(body)
        let buffered = try await Data(collecting: data, upTo: 1024)
        #expect(buffered == problem(status: 401, code: ApiErrorCode.invalidCredentials))
    }

    @Test("the refresh operation itself is never retried")
    func refreshOperationNotRetried() async throws {
        let coordinator = await makeCoordinator(accessToken: nil)
        let middleware = AuthMiddleware(coordinator: coordinator)
        let next = NextSpy(responses: [
            (HTTPResponse(status: .unauthorized), problem(status: 401, code: ApiErrorCode.tokenExpired))
        ])

        let (response, _) = try await middleware.intercept(
            HTTPRequest(method: .post, scheme: nil, authority: nil, path: "/v1/auth/refresh"),
            body: nil,
            baseURL: Self.baseURL,
            operationID: "AuthController_refresh_v1",
            next: { try await next($0, $1, $2) }
        )

        #expect(response.status == .unauthorized)
        #expect(next.requests.count == 1)
    }
}
