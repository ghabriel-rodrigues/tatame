// LiveEventsRepository — the generated Client wrapped behind the TatameCore
// protocol (spec 008, EVT.14-15; same pattern as LiveBillingRepository).
// Every error is normalized into ApiError; the stable event codes
// (event.not_published, event.registration_settled) flow through the
// problem+json mapper untouched. Money stays on the billing rails — paid
// registrations only surface the chargeId.

import Foundation
import TatameCore

struct LiveEventsRepository: EventsRepository {
    let client: Client

    // MARK: Aluno

    func alunoEventDetail(eventId: UUID) async throws -> EventDetail {
        try await ApiErrorMapper.run {
            let response = try await client.AlunoEventsController_detail_v1(
                .init(path: .init(id: eventId.uuidString.lowercased()))
            )
            switch response {
            case .ok(let ok):
                return try EventDetail(dto: try ok.body.json)
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }

    func alunoRegister(eventId: UUID) async throws -> EventRegistrationOutcome {
        try await ApiErrorMapper.run {
            let response = try await client.AlunoEventsController_register_v1(
                .init(path: .init(id: eventId.uuidString.lowercased()))
            )
            switch response {
            case .created(let created):
                return try EventRegistrationOutcome(dto: try created.body.json)
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }

    func alunoCancelRegistration(eventId: UUID) async throws {
        try await ApiErrorMapper.run {
            let response = try await client.AlunoEventsController_cancel_v1(
                .init(path: .init(id: eventId.uuidString.lowercased()))
            )
            switch response {
            case .noContent:
                return
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }

    // MARK: Responsável

    func guardianEvents() async throws -> [GuardianEvent] {
        try await ApiErrorMapper.run {
            let response = try await client.ResponsavelEventsController_list_v1(.init())
            switch response {
            case .ok(let ok):
                return try (try ok.body.json).events.map(GuardianEvent.init(dto:))
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }

    func guardianRegister(eventId: UUID, studentId: UUID) async throws -> EventRegistrationOutcome {
        try await ApiErrorMapper.run {
            let response = try await client.ResponsavelEventsController_register_v1(
                .init(path: .init(
                    id: eventId.uuidString.lowercased(),
                    studentId: studentId.uuidString.lowercased()
                ))
            )
            switch response {
            case .created(let created):
                return try EventRegistrationOutcome(dto: try created.body.json)
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }

    func guardianCancelRegistration(eventId: UUID, studentId: UUID) async throws {
        try await ApiErrorMapper.run {
            let response = try await client.ResponsavelEventsController_cancel_v1(
                .init(path: .init(
                    id: eventId.uuidString.lowercased(),
                    studentId: studentId.uuidString.lowercased()
                ))
            )
            switch response {
            case .noContent:
                return
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }
}
