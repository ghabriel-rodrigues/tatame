// LiveProfileRepository — GET rides the generated Client; the PUT is
// hand-rolled through the same middleware chain + transport because the
// generated `UpdateAlunoProfileDto` is unusable (NestJS swagger types the
// nullable string fields as bare `object`, which the Swift generator turns
// into `OpenAPIObjectContainer` — no way to carry a string, let alone an
// explicit null). Precedent: the SSE stream in LiveAttendanceRepository is
// the other hand-rolled route. Every error is normalized into ApiError.

import Foundation
import HTTPTypes
import OpenAPIRuntime
import TatameCore

struct LiveProfileRepository: ProfileRepository {
    let client: Client
    let serverURL: URL
    let transport: any ClientTransport
    let middlewares: [any ClientMiddleware]

    private static let updateOperationID = "AlunoProfileController_update_v1"
    private static let path = "/v1/aluno/profile"

    func alunoProfile() async throws -> AlunoProfile {
        try await ApiErrorMapper.run {
            let response = try await client.AlunoProfileController_get_v1(.init())
            switch response {
            case .ok(let ok):
                return AlunoProfile(dto: try ok.body.json)
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }

    func updateAlunoProfile(_ update: AlunoProfileUpdate) async throws -> AlunoProfile {
        try await ApiErrorMapper.run {
            var request = HTTPRequest(method: .put, scheme: nil, authority: nil, path: Self.path)
            request.headerFields[.contentType] = "application/json"
            request.headerFields[.accept] = "application/json"
            let body = try JSONEncoder().encode(UpdateAlunoProfileBody(update: update))
            let (response, responseBody) = try await send(request, body: HTTPBody(body))
            var data: Data?
            if let responseBody {
                data = try? await Data(collecting: responseBody, upTo: 1024 * 1024)
            }
            guard response.status.code == 200 else {
                throw ApiErrorMapper.map(status: response.status.code, data: data)
            }
            guard let data else {
                throw ApiError.decoding(description: "empty profile response body")
            }
            let dto = try JSONDecoder().decode(Components.Schemas.AlunoProfileResponseDto.self, from: data)
            return AlunoProfile(dto: dto)
        }
    }

    /// Replays OpenAPIRuntime's client pipeline for the one hand-rolled
    /// route: middlewares outermost-first, transport at the bottom — so the
    /// PUT gets the same bearer + retry-once behavior as generated calls.
    private func send(_ request: HTTPRequest, body: HTTPBody?) async throws -> (HTTPResponse, HTTPBody?) {
        var next: @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?) =
            { request, body, url in
                try await transport.send(
                    request,
                    body: body,
                    baseURL: url,
                    operationID: Self.updateOperationID
                )
            }
        for middleware in middlewares.reversed() {
            let tail = next
            next = { request, body, url in
                try await middleware.intercept(
                    request,
                    body: body,
                    baseURL: url,
                    operationID: Self.updateOperationID,
                    next: tail
                )
            }
        }
        return try await next(request, body, serverURL)
    }
}
