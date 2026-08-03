import Foundation
import Testing
@testable import TatameAPI
import TatameCore

@Suite("ApiError mapping (problem+json stable codes)")
struct ApiErrorMappingTests {
    private func problemData(status: Int, code: String, errors: String = "") -> Data {
        Data("""
        {"type":"about:blank","title":"x","status":\(status),"code":"\(code)"\(errors)}
        """.utf8)
    }

    @Test("401 invalid credentials")
    func invalidCredentials() {
        let error = ApiErrorMapper.map(
            status: 401,
            data: problemData(status: 401, code: ApiErrorCode.invalidCredentials)
        )
        #expect(error == .unauthorized(code: ApiErrorCode.invalidCredentials))
    }

    @Test("401 token expired")
    func tokenExpired() {
        let error = ApiErrorMapper.map(
            status: 401,
            data: problemData(status: 401, code: ApiErrorCode.tokenExpired)
        )
        #expect(error == .unauthorized(code: ApiErrorCode.tokenExpired))
    }

    @Test("401 without a body still maps to unauthorized")
    func bareUnauthorized() {
        let error = ApiErrorMapper.map(status: 401, data: nil)
        #expect(error == .unauthorized(code: ApiErrorCode.unauthenticated))
    }

    @Test("403 tenant codes surface through forbidden (suspension / read-only routing)")
    func tenantCodes() {
        #expect(
            ApiErrorMapper.map(status: 403, data: problemData(status: 403, code: ApiErrorCode.tenantSuspended))
                == .forbidden(code: ApiErrorCode.tenantSuspended)
        )
        #expect(
            ApiErrorMapper.map(status: 403, data: problemData(status: 403, code: ApiErrorCode.tenantReadOnly))
                == .forbidden(code: ApiErrorCode.tenantReadOnly)
        )
    }

    @Test("404 and 409 carry their stable codes")
    func notFoundAndConflict() {
        #expect(
            ApiErrorMapper.map(status: 404, data: problemData(status: 404, code: ApiErrorCode.notFound))
                == .notFound(code: ApiErrorCode.notFound)
        )
        #expect(
            ApiErrorMapper.map(status: 409, data: problemData(status: 409, code: ApiErrorCode.conflict))
                == .conflict(code: ApiErrorCode.conflict)
        )
    }

    @Test("422 maps field errors")
    func validation() {
        let data = problemData(
            status: 422,
            code: ApiErrorCode.validationFailed,
            errors: ",\"errors\":[{\"field\":\"email\",\"messages\":[\"must be an email\"]}]"
        )
        let error = ApiErrorMapper.map(status: 422, data: data)
        #expect(error == .validation(fields: [FieldError(field: "email", messages: ["must be an email"])]))
    }

    @Test("5xx maps to server with the optional code")
    func serverError() {
        let error = ApiErrorMapper.map(status: 500, data: problemData(status: 500, code: ApiErrorCode.internalError))
        #expect(error == .server(status: 500, code: ApiErrorCode.internalError))
    }

    @Test("URLError maps to network; ApiError passes through")
    func transportNormalization() {
        #expect(
            ApiErrorMapper.map(anyError: URLError(.notConnectedToInternet))
                == .network(.notConnectedToInternet)
        )
        let passthrough = ApiError.forbidden(code: ApiErrorCode.tenantSuspended)
        #expect(ApiErrorMapper.map(anyError: passthrough) == passthrough)
    }
}
