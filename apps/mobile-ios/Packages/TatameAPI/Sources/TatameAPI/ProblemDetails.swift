// RFC 9457 problem+json envelope + mapping into the one typed ApiError
// (ticket 02, decision 5): branch on HTTP status + stable `code`, never on
// human text.

import Foundation
import HTTPTypes
import OpenAPIRuntime
import TatameCore

/// Mirror of the backend's problem+json envelope.
struct ProblemDetails: Decodable, Sendable {
    struct FieldMessages: Decodable, Sendable {
        let field: String
        let messages: [String]
    }

    let type: String?
    let title: String?
    let status: Int?
    let detail: String?
    let instance: String?
    let code: String?
    let errors: [FieldMessages]?
}

enum ApiErrorMapper {
    /// Upper bound when buffering an error body (problems are tiny).
    static let maxProblemBytes = 64 * 1024

    /// Maps an undocumented (non-2xx) generated response into `ApiError`.
    static func map(status: Int, payload: UndocumentedPayload) async -> ApiError {
        var data: Data?
        if let body = payload.body {
            data = try? await Data(collecting: body, upTo: maxProblemBytes)
        }
        return map(status: status, data: data)
    }

    static func map(status: Int, data: Data?) -> ApiError {
        let problem = data.flatMap { try? JSONDecoder().decode(ProblemDetails.self, from: $0) }
        return map(status: status, problem: problem)
    }

    static func map(status: Int, problem: ProblemDetails?) -> ApiError {
        let code = problem?.code
        switch status {
        case 401:
            return .unauthorized(code: code ?? ApiErrorCode.unauthenticated)
        case 403:
            return .forbidden(code: code ?? ApiErrorCode.forbiddenRole)
        case 404:
            return .notFound(code: code ?? ApiErrorCode.notFound)
        case 409:
            return .conflict(code: code ?? ApiErrorCode.conflict)
        case 422:
            // Business-rule 422s carry a stable non-validation code (e.g.
            // checkin.no_session_today, checkin.outside_window — spec 004);
            // clients branch on the code, so it must survive the mapping.
            if let code, code != ApiErrorCode.validationFailed {
                return .conflict(code: code)
            }
            let fields = (problem?.errors ?? []).map { FieldError(field: $0.field, messages: $0.messages) }
            return .validation(fields: fields)
        case 400 where code == ApiErrorCode.validationFailed:
            let fields = (problem?.errors ?? []).map { FieldError(field: $0.field, messages: $0.messages) }
            return .validation(fields: fields)
        case 500...:
            return .server(status: status, code: code)
        default:
            return .unknown(status: status, code: code)
        }
    }

    /// Normalizes anything thrown below the repository into `ApiError`:
    /// unwraps the runtime's `ClientError`, keeps `ApiError` as-is, and maps
    /// transport failures to `.network`.
    static func map(anyError error: any Error) -> ApiError {
        if let apiError = error as? ApiError {
            return apiError
        }
        if let clientError = error as? ClientError {
            return map(anyError: clientError.underlyingError)
        }
        if let urlError = error as? URLError {
            return .network(urlError.code)
        }
        if error is DecodingError {
            return .decoding(description: String(describing: error))
        }
        return .unknown(status: 0, code: nil)
    }

    /// Runs a client call normalizing every thrown error into `ApiError`.
    static func run<T: Sendable>(_ operation: @Sendable () async throws -> T) async throws -> T {
        do {
            return try await operation()
        } catch {
            throw map(anyError: error)
        }
    }
}
