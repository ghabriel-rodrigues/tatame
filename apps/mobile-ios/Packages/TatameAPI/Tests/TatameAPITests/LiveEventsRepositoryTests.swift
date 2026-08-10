import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing
@testable import TatameAPI
import TatameCore

@Suite("LiveEventsRepository (generated client → domain mapping)")
struct LiveEventsRepositoryTests {
    private static let baseURL = URL(string: "http://localhost:3000")!
    private static let eventId = UUID(uuidString: "0198a7b0-0000-7000-8000-0000000000e1")!
    private static let registrationId = UUID(uuidString: "0198a7b0-0000-7000-8000-0000000000e2")!
    private static let chargeId = UUID(uuidString: "0198a7b0-0000-7000-8000-0000000000e3")!
    private static let pedroId = UUID(uuidString: "0198a7b0-0000-7000-8000-0000000000e4")!
    private static let juliaId = UUID(uuidString: "0198a7b0-0000-7000-8000-0000000000e5")!

    private func makeRepository(_ responses: [(HTTPResponse, Data?)]) -> (LiveEventsRepository, TransportMock) {
        let transport = TransportMock(responses: responses)
        let client = Client(
            serverURL: Self.baseURL,
            configuration: TatameClientDefaults.configuration,
            transport: transport
        )
        return (LiveEventsRepository(client: client), transport)
    }

    private func json(_ body: String, status: HTTPResponse.Status = .ok) -> (HTTPResponse, Data?) {
        var response = HTTPResponse(status: status)
        response.headerFields[.contentType] = "application/json"
        return (response, Data(body.utf8))
    }

    private func problem(status: Int, code: String) -> (HTTPResponse, Data?) {
        var response = HTTPResponse(status: .init(code: status))
        response.headerFields[.contentType] = "application/problem+json"
        return (response, Data("{\"status\":\(status),\"code\":\"\(code)\"}".utf8))
    }

    // MARK: Aluno detail

    @Test("alunoEventDetail maps the aluno-10 payload — free event with own confirmed state")
    func detailMapping() async throws {
        let body = """
        {"id": "\(Self.eventId.uuidString.lowercased())", "name": "Open mat de verão",
         "bannerPreset": "event-purple-pink", "location": "Tatame principal",
         "startsAt": "2026-08-15T13:00:00.000Z", "date": "2026-08-15", "time": "10:00",
         "priceCents": null,
         "description": "Treino aberto para todas as faixas.",
         "responsible": {"userId": "\(UUID().uuidString.lowercased())", "fullName": "Prof. Rafael Nunes"},
         "registration": {"id": "\(Self.registrationId.uuidString.lowercased())",
                          "status": "confirmed", "chargeId": null}}
        """
        let (repository, transport) = makeRepository([json(body)])

        let detail = try await repository.alunoEventDetail(eventId: Self.eventId)

        #expect(transport.requests[0].0.path == "/v1/aluno/events/\(Self.eventId.uuidString.lowercased())")
        #expect(detail.id == Self.eventId)
        #expect(detail.name == "Open mat de verão")
        #expect(detail.bannerPreset == "event-purple-pink")
        #expect(detail.location == "Tatame principal")
        #expect(detail.date == "2026-08-15")
        #expect(detail.time == "10:00")
        #expect(detail.isFree)
        #expect(detail.responsibleName == "Prof. Rafael Nunes")
        #expect(detail.registration?.isConfirmed == true)
    }

    @Test("draft/canceled events behave as 404 with the stable code")
    func detailNotFound() async throws {
        let (repository, _) = makeRepository([problem(status: 404, code: ApiErrorCode.notFound)])

        await #expect(throws: ApiError.notFound(code: ApiErrorCode.notFound)) {
            _ = try await repository.alunoEventDetail(eventId: Self.eventId)
        }
    }

    // MARK: Aluno registration

    @Test("alunoRegister on a free event comes back confirmed with no charge")
    func registerFree() async throws {
        let body = """
        {"registration": {"id": "\(Self.registrationId.uuidString.lowercased())",
                          "status": "confirmed", "chargeId": null},
         "chargeId": null}
        """
        let (repository, transport) = makeRepository([json(body, status: .created)])

        let outcome = try await repository.alunoRegister(eventId: Self.eventId)

        let request = transport.requests[0].0
        #expect(request.method == .post)
        #expect(request.path == "/v1/aluno/events/\(Self.eventId.uuidString.lowercased())/registration")
        #expect(outcome.registration.isConfirmed)
        #expect(outcome.chargeId == nil)
    }

    @Test("alunoRegister on a paid event surfaces pending_payment plus the event-origin chargeId")
    func registerPaid() async throws {
        let body = """
        {"registration": {"id": "\(Self.registrationId.uuidString.lowercased())",
                          "status": "pending_payment",
                          "chargeId": "\(Self.chargeId.uuidString.lowercased())"},
         "chargeId": "\(Self.chargeId.uuidString.lowercased())"}
        """
        let (repository, _) = makeRepository([json(body, status: .created)])

        let outcome = try await repository.alunoRegister(eventId: Self.eventId)

        #expect(outcome.registration.isPendingPayment)
        #expect(outcome.registration.chargeId == Self.chargeId)
        #expect(outcome.chargeId == Self.chargeId)
    }

    @Test("the stable event codes survive the mapping (not_published, registration_settled)")
    func eventErrorCodes() async throws {
        let (repository, _) = makeRepository([
            problem(status: 409, code: ApiErrorCode.eventNotPublished),
            problem(status: 409, code: ApiErrorCode.eventRegistrationSettled),
        ])

        await #expect(throws: ApiError.conflict(code: ApiErrorCode.eventNotPublished)) {
            _ = try await repository.alunoRegister(eventId: Self.eventId)
        }
        await #expect(throws: ApiError.conflict(code: ApiErrorCode.eventRegistrationSettled)) {
            try await repository.alunoCancelRegistration(eventId: Self.eventId)
        }
    }

    @Test("alunoCancelRegistration hits the DELETE route and succeeds on 204")
    func cancelRegistration() async throws {
        let (repository, transport) = makeRepository([(HTTPResponse(status: .noContent), nil)])

        try await repository.alunoCancelRegistration(eventId: Self.eventId)

        let request = transport.requests[0].0
        #expect(request.method == .delete)
        #expect(request.path == "/v1/aluno/events/\(Self.eventId.uuidString.lowercased())/registration")
    }

    // MARK: Responsável

    @Test("guardianEvents maps gradient cards with independent per-dependent states")
    func guardianEventsMapping() async throws {
        let body = """
        {"events": [
            {"id": "\(Self.eventId.uuidString.lowercased())", "name": "Festival Kids",
             "bannerPreset": "event-purple-pink", "location": "Ginásio Municipal",
             "startsAt": "2026-09-15T12:30:00.000Z", "date": "2026-09-15", "time": "09:30",
             "priceCents": 6000, "description": null,
             "dependents": [
                {"studentId": "\(Self.pedroId.uuidString.lowercased())", "fullName": "Pedro Silveira",
                 "registration": {"id": "\(Self.registrationId.uuidString.lowercased())",
                                  "status": "confirmed", "chargeId": null}},
                {"studentId": "\(Self.juliaId.uuidString.lowercased())", "fullName": "Júlia Silveira",
                 "registration": null}
             ]}
        ]}
        """
        let (repository, transport) = makeRepository([json(body)])

        let events = try await repository.guardianEvents()

        #expect(transport.requests[0].0.path == "/v1/responsavel/events")
        #expect(events.count == 1)
        #expect(events[0].name == "Festival Kids")
        #expect(events[0].priceCents == 6000)
        #expect(events[0].dependents.count == 2)
        // Pedro confirmed never implies Júlia confirmed (spec story 21).
        #expect(events[0].dependent(studentId: Self.pedroId)?.isConfirmed == true)
        #expect(events[0].dependent(studentId: Self.juliaId)?.isConfirmed == false)
    }

    @Test("guardianRegister posts to the per-dependent route and maps the paid outcome")
    func guardianRegister() async throws {
        let body = """
        {"registration": {"id": "\(Self.registrationId.uuidString.lowercased())",
                          "status": "pending_payment",
                          "chargeId": "\(Self.chargeId.uuidString.lowercased())"},
         "chargeId": "\(Self.chargeId.uuidString.lowercased())"}
        """
        let (repository, transport) = makeRepository([
            json(body, status: .created),
            problem(status: 404, code: ApiErrorCode.notFound),
        ])

        let outcome = try await repository.guardianRegister(eventId: Self.eventId, studentId: Self.pedroId)

        let request = transport.requests[0].0
        #expect(request.method == .post)
        #expect(
            request.path
                == "/v1/responsavel/events/\(Self.eventId.uuidString.lowercased())/registrations/\(Self.pedroId.uuidString.lowercased())"
        )
        #expect(outcome.chargeId == Self.chargeId)

        // A student not linked to the calling guardian is a 404 (scoping).
        await #expect(throws: ApiError.notFound(code: ApiErrorCode.notFound)) {
            _ = try await repository.guardianRegister(eventId: Self.eventId, studentId: UUID())
        }
    }

    @Test("guardianCancelRegistration hits the per-dependent DELETE route")
    func guardianCancel() async throws {
        let (repository, transport) = makeRepository([(HTTPResponse(status: .noContent), nil)])

        try await repository.guardianCancelRegistration(eventId: Self.eventId, studentId: Self.juliaId)

        let request = transport.requests[0].0
        #expect(request.method == .delete)
        #expect(
            request.path
                == "/v1/responsavel/events/\(Self.eventId.uuidString.lowercased())/registrations/\(Self.juliaId.uuidString.lowercased())"
        )
    }
}
