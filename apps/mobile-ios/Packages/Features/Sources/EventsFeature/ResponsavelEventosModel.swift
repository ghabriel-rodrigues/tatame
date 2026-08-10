// Responsável Eventos tab model (spec 008, EVT.15 — stories 18-21): GET
// /responsavel/events, per-dependent chip actions (free toggle, paid Pix per
// dependent with the charge billed to the guardian, long-press cancel on
// pending), every mutation refetching so sibling states stay server-true.

import Foundation
import Observation
import TatameCore

@MainActor
@Observable
public final class ResponsavelEventosModel {
    public enum Phase: Equatable, Sendable {
        case idle
        case loading
        case loaded([GuardianEvent])
        case failed(message: String)
    }

    /// Pix-sheet target: the dependent's open event charge ("Inscrição ·
    /// <evento> · <child>", billed to the guardian).
    public struct PixTarget: Identifiable, Equatable, Sendable {
        public let chargeId: UUID
        public let amountCents: Int
        public let eventName: String
        public let studentId: UUID
        public let dependentName: String

        public var id: UUID { chargeId }
    }

    public private(set) var phase: Phase = .idle
    public private(set) var actionError: String?
    /// The chip currently in flight (disables just that chip).
    public private(set) var workingStudentId: UUID?
    public var pixTarget: PixTarget?

    @ObservationIgnored private let repository: any EventsRepository

    public init(repository: any EventsRepository) {
        self.repository = repository
    }

    public var events: [GuardianEvent]? {
        if case .loaded(let events) = phase { return events }
        return nil
    }

    public func load() async {
        if case .loaded = phase {} else {
            phase = .loading
        }
        do {
            phase = .loaded(try await repository.guardianEvents())
        } catch let error as ApiError {
            phase = .failed(message: EventsMessages.message(for: error))
        } catch {
            phase = .failed(message: EventsMessages.generic)
        }
    }

    /// Chip tap — the documented mapping (EventActionLogic): free toggles
    /// confirm/cancel, paid registers and/or opens the Pix sheet, paid
    /// confirmed is inert.
    public func chipTapped(event: GuardianEvent, dependent: GuardianEventDependent) async {
        guard workingStudentId == nil else { return }
        switch DependentChipAction.forTap(
            priceCents: event.priceCents,
            registration: dependent.registration
        ) {
        case .confirm:
            await run(dependent.studentId) {
                _ = try await self.repository.guardianRegister(
                    eventId: event.id,
                    studentId: dependent.studentId
                )
            }
        case .cancel:
            await cancel(event: event, dependent: dependent)
        case .pay(let openChargeId):
            if let chargeId = openChargeId {
                // Pending retry — straight onto the open charge.
                pixTarget = target(chargeId: chargeId, event: event, dependent: dependent)
            } else {
                await run(dependent.studentId) {
                    let outcome = try await self.repository.guardianRegister(
                        eventId: event.id,
                        studentId: dependent.studentId
                    )
                    guard let chargeId = outcome.chargeId ?? outcome.registration.chargeId else {
                        self.actionError = EventsMessages.generic
                        return
                    }
                    self.pixTarget = self.target(chargeId: chargeId, event: event, dependent: dependent)
                }
            }
        case .none:
            // Paid confirmed — undone only by the audited admin refund.
            break
        }
    }

    /// Long-press cancel on a pending (not-yet-paid) chip; also the free
    /// toggle's cancel half.
    public func cancel(event: GuardianEvent, dependent: GuardianEventDependent) async {
        await run(dependent.studentId) {
            try await self.repository.guardianCancelRegistration(
                eventId: event.id,
                studentId: dependent.studentId
            )
        }
    }

    /// Fired by the settled Pix sheet — refetch so the chip gains the check
    /// through the normalized-event handler (server truth).
    public func paymentSettled() async {
        await load()
    }

    private func target(
        chargeId: UUID,
        event: GuardianEvent,
        dependent: GuardianEventDependent
    ) -> PixTarget {
        PixTarget(
            chargeId: chargeId,
            amountCents: event.priceCents ?? 0,
            eventName: event.name,
            studentId: dependent.studentId,
            dependentName: dependent.fullName
        )
    }

    private func run(_ studentId: UUID, _ operation: @escaping () async throws -> Void) async {
        workingStudentId = studentId
        actionError = nil
        defer { workingStudentId = nil }
        do {
            try await operation()
            await load()
        } catch let error as ApiError {
            actionError = EventsMessages.message(for: error)
        } catch {
            actionError = EventsMessages.generic
        }
    }
}
