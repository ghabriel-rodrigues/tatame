// Repository seam for the events slice (spec 008, EVT.14-15). Same
// convention as BillingRepository: protocol in TatameCore, implementation in
// TatameAPI, features depend only on this protocol and throw `ApiError`.
// Money never flows through here — paid registrations return a chargeId that
// the existing billing rails (Pix sheet + simulate) settle.

import Foundation

public protocol EventsRepository: Sendable {
    // MARK: Aluno

    /// GET /aluno/events/:id — published events only; drafts and canceled
    /// behave as 404.
    func alunoEventDetail(eventId: UUID) async throws -> EventDetail

    /// POST /aluno/events/:id/registration — free ⇒ confirmed on the spot;
    /// paid ⇒ pending_payment + the event-origin chargeId.
    func alunoRegister(eventId: UUID) async throws -> EventRegistrationOutcome

    /// DELETE /aluno/events/:id/registration — cancel a free or still-
    /// pending registration (cancels the open charge). Paid settled rows are
    /// rejected with `event.registration_settled`.
    func alunoCancelRegistration(eventId: UUID) async throws

    // MARK: Responsável

    /// GET /responsavel/events — published upcoming events with one state
    /// per dependent.
    func guardianEvents() async throws -> [GuardianEvent]

    /// POST /responsavel/events/:id/registrations/:studentId — same free/
    /// paid semantics per dependent; the charge bills the guardian.
    func guardianRegister(eventId: UUID, studentId: UUID) async throws -> EventRegistrationOutcome

    /// DELETE /responsavel/events/:id/registrations/:studentId.
    func guardianCancelRegistration(eventId: UUID, studentId: UUID) async throws
}

/// Default used by environment entries / previews; every call traps.
public struct UnimplementedEventsRepository: EventsRepository {
    public init() {}

    public func alunoEventDetail(eventId _: UUID) async throws -> EventDetail {
        fatalError("EventsRepository not injected")
    }

    public func alunoRegister(eventId _: UUID) async throws -> EventRegistrationOutcome {
        fatalError("EventsRepository not injected")
    }

    public func alunoCancelRegistration(eventId _: UUID) async throws {
        fatalError("EventsRepository not injected")
    }

    public func guardianEvents() async throws -> [GuardianEvent] {
        fatalError("EventsRepository not injected")
    }

    public func guardianRegister(eventId _: UUID, studentId _: UUID) async throws -> EventRegistrationOutcome {
        fatalError("EventsRepository not injected")
    }

    public func guardianCancelRegistration(eventId _: UUID, studentId _: UUID) async throws {
        fatalError("EventsRepository not injected")
    }
}
