import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing
@testable import TatameAPI
import TatameCore

@Suite("LiveProfileRepository (GET via generated client, hand-rolled PUT)")
struct LiveProfileRepositoryTests {
    private static let baseURL = URL(string: "http://localhost:3000")!

    private func makeRepository(_ responses: [(HTTPResponse, Data?)]) -> (LiveProfileRepository, TransportMock) {
        let transport = TransportMock(responses: responses)
        let client = Client(
            serverURL: Self.baseURL,
            configuration: TatameClientDefaults.configuration,
            transport: transport
        )
        let repository = LiveProfileRepository(
            client: client,
            serverURL: Self.baseURL,
            transport: transport,
            middlewares: []
        )
        return (repository, transport)
    }

    private func ok(_ json: String) -> (HTTPResponse, Data?) {
        var response = HTTPResponse(status: .ok)
        response.headerFields[.contentType] = "application/json"
        return (response, Data(json.utf8))
    }

    private func problem(status: Int, code: String, errors: String = "[]") -> (HTTPResponse, Data?) {
        var response = HTTPResponse(status: .init(code: status))
        response.headerFields[.contentType] = "application/problem+json"
        return (response, Data("{\"status\":\(status),\"code\":\"\(code)\",\"errors\":\(errors)}".utf8))
    }

    private var fullProfileJSON: String {
        """
        {"fullName": "Lucas Almeida", "email": "lucas@tatame.app",
         "birthDate": "1998-03-14", "phone": "(11) 98765-4321",
         "gender": "male", "cpf": "12345678900", "cpfLocked": true,
         "rg": "12.345.678-9", "rgLocked": true,
         "addressLine": "Rua das Palmeiras, 120, ap 42",
         "addressCity": "São Paulo", "addressState": "SP", "addressZip": "01310100",
         "emergencyContactName": "Carla Almeida",
         "emergencyContactPhone": "(11) 91234-5678", "avatarUrl": null}
        """
    }

    @Test("alunoProfile maps the full payload with lock flags")
    func getMapping() async throws {
        let (repository, transport) = makeRepository([ok(fullProfileJSON)])

        let profile = try await repository.alunoProfile()

        #expect(transport.requests[0].0.path == "/v1/aluno/profile")
        #expect(profile.fullName == "Lucas Almeida")
        #expect(profile.email == "lucas@tatame.app")
        #expect(profile.birthDate == "1998-03-14")
        #expect(profile.gender == .male)
        #expect(profile.cpf == "12345678900")
        #expect(profile.cpfLocked)
        #expect(profile.rg == "12.345.678-9")
        #expect(profile.rgLocked)
        #expect(profile.addressCity == "São Paulo")
        #expect(profile.addressState == "SP")
        #expect(profile.addressZip == "01310100")
        #expect(profile.emergencyContactName == "Carla Almeida")
        #expect(profile.avatarUrl == nil)
    }

    @Test("update PUTs a partial body: set values, explicit nulls, omitted unchanged")
    func updateBodyShape() async throws {
        let (repository, transport) = makeRepository([ok(fullProfileJSON)])

        var update = AlunoProfileUpdate()
        update.fullName = "Lucas A. Silva"
        update.gender = .set(.male)
        update.phone = .set("(11) 98765-4321")
        update.cpf = "123.456.789-00"
        update.addressLine = .clear
        update.addressCity = .set("São Paulo")
        update.addressState = .set("SP")
        // rg, addressZip, emergency fields stay .unchanged / nil.
        _ = try await repository.updateAlunoProfile(update)

        let request = transport.requests[0].0
        #expect(request.method == .put)
        #expect(request.path == "/v1/aluno/profile")
        #expect(request.headerFields[.contentType] == "application/json")

        let body = try JSONSerialization.jsonObject(with: transport.requests[0].1 ?? Data()) as? [String: Any]
        let payload = try #require(body)
        #expect(payload["fullName"] as? String == "Lucas A. Silva")
        #expect(payload["gender"] as? String == "male")
        #expect(payload["phone"] as? String == "(11) 98765-4321")
        // CPF passes masked — the server normalizes and checksum-validates.
        #expect(payload["cpf"] as? String == "123.456.789-00")
        // Explicit null = clear.
        #expect(payload.keys.contains("addressLine"))
        #expect(payload["addressLine"] is NSNull)
        // Omitted = unchanged (write-once RG and untouched fields).
        #expect(!payload.keys.contains("rg"))
        #expect(!payload.keys.contains("addressZip"))
        #expect(!payload.keys.contains("emergencyContactName"))
        // Read-only identity facts are unrepresentable by construction.
        #expect(!payload.keys.contains("email"))
        #expect(!payload.keys.contains("birthDate"))
    }

    @Test("422 validation.failed maps to per-field errors with server PT-BR messages")
    func updateValidation() async throws {
        let (repository, _) = makeRepository([
            problem(
                status: 422,
                code: "validation.failed",
                errors: """
                [{"field": "addressZip", "messages": ["CEP inválido — use 8 dígitos"]},
                 {"field": "phone", "messages": ["Telefone inválido"]}]
                """
            )
        ])

        await #expect(
            throws: ApiError.validation(fields: [
                FieldError(field: "addressZip", messages: ["CEP inválido — use 8 dígitos"]),
                FieldError(field: "phone", messages: ["Telefone inválido"]),
            ])
        ) {
            try await repository.updateAlunoProfile(AlunoProfileUpdate(fullName: "Lucas"))
        }
    }

    @Test("422 profile.field_locked keeps its stable code (conflict mapping)")
    func updateFieldLocked() async throws {
        let (repository, _) = makeRepository([
            problem(
                status: 422,
                code: "profile.field_locked",
                errors: "[{\"field\": \"cpf\", \"messages\": [\"locked\"]}]"
            )
        ])

        await #expect(throws: ApiError.conflict(code: ApiErrorCode.profileFieldLocked)) {
            try await repository.updateAlunoProfile(AlunoProfileUpdate(cpf: "98765432100"))
        }
    }

    @Test("read-only academy blocks the PUT with the stable tenant code")
    func updateReadOnly() async throws {
        let (repository, _) = makeRepository([
            problem(status: 403, code: "tenant.read_only")
        ])

        await #expect(throws: ApiError.forbidden(code: "tenant.read_only")) {
            try await repository.updateAlunoProfile(AlunoProfileUpdate(fullName: "Lucas"))
        }
    }
}
