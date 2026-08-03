// AuthMiddleware — ClientMiddleware injecting the bearer header and doing
// retry-once on 401 + `auth.token_expired` via the single-flight coordinator
// (ticket 02, decision 4). Any other 401 propagates to the session layer.

import Foundation
import HTTPTypes
import OpenAPIRuntime
import TatameCore

struct AuthMiddleware: ClientMiddleware {
    let coordinator: TokenRefreshCoordinator

    /// The refresh operation must never trigger a nested refresh.
    private static let refreshOperationID = "AuthController_refresh_v1"

    func intercept(
        _ request: HTTPRequest,
        body: HTTPBody?,
        baseURL: URL,
        operationID: String,
        next: @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)
    ) async throws -> (HTTPResponse, HTTPBody?) {
        var request = request
        if let token = await coordinator.currentAccessToken {
            request.headerFields[.authorization] = "Bearer \(token)"
        }
        let (response, responseBody) = try await next(request, body, baseURL)
        guard response.status.code == 401, operationID != Self.refreshOperationID else {
            return (response, responseBody)
        }
        // Buffer the (tiny) problem body so we can branch on the stable code.
        var bufferedBody: Data?
        if let responseBody {
            bufferedBody = try? await Data(collecting: responseBody, upTo: ApiErrorMapper.maxProblemBytes)
        }
        let problem = bufferedBody.flatMap { try? JSONDecoder().decode(ProblemDetails.self, from: $0) }
        guard problem?.code == ApiErrorCode.tokenExpired else {
            return (response, bufferedBody.map { HTTPBody($0) } ?? responseBody)
        }
        // Retry-once: await the (single-flight) refresh, re-inject, replay.
        let refreshedToken = try await coordinator.refreshAccessToken()
        request.headerFields[.authorization] = "Bearer \(refreshedToken)"
        return try await next(request, body, baseURL)
    }
}
