// Aluno event detail model (spec 008, EVT.14 — stories 11-15): GET the
// aluno-10 payload, free confirm on the spot, paid registration issuing the
// event-origin charge paid through the existing Pix sheet + simulate rails,
// pending retry re-opening the sheet on the open charge, and cancel for
// free/not-yet-paid registrations. Settlement truth stays server-side: every
// mutation refetches the detail.

import Foundation
import Observation
import TatameCore

@MainActor
@Observable
public final class AlunoEventDetailModel {
    public enum Phase: Equatable, Sendable {
        case idle
        case loading
        case loaded(EventDetail)
        case failed(message: String)
    }

    /// Pix-sheet target: the open event-origin charge (identified so
    /// `.sheet(item:)` drives presentation).
    public struct PixTarget: Identifiable, Equatable, Sendable {
        public let chargeId: UUID
        public let amountCents: Int

        public var id: UUID { chargeId }
    }

    public private(set) var phase: Phase = .idle
    /// Inline error for confirm/pay/cancel actions.
    public private(set) var actionError: String?
    public private(set) var working = false
    public var pixTarget: PixTarget?

    public let eventId: UUID
    @ObservationIgnored private let repository: any EventsRepository

    public init(eventId: UUID, repository: any EventsRepository) {
        self.eventId = eventId
        self.repository = repository
    }

    public var detail: EventDetail? {
        if case .loaded(let detail) = phase { return detail }
        return nil
    }

    /// The aluno-10 button state machine (pure logic, tested standalone).
    public var cta: EventDetailCTA? {
        detail.map { EventDetailCTA.state(priceCents: $0.priceCents, registration: $0.registration) }
    }

    public func load() async {
        if case .loaded = phase {} else {
            phase = .loading
        }
        do {
            phase = .loaded(try await repository.alunoEventDetail(eventId: eventId))
        } catch let error as ApiError {
            phase = .failed(message: EventsMessages.message(for: error))
        } catch {
            phase = .failed(message: EventsMessages.generic)
        }
    }

    /// "Confirmar presença" — gratuito is one tap (story 12).
    public func confirmPresence() async {
        guard let detail, detail.isFree, !working else { return }
        working = true
        actionError = nil
        defer { working = false }
        do {
            _ = try await repository.alunoRegister(eventId: eventId)
            await load()
        } catch let error as ApiError {
            actionError = EventsMessages.message(for: error)
        } catch {
            actionError = EventsMessages.generic
        }
    }

    /// "Pagar inscrição · R$ X" — creates (or reuses) the pending
    /// registration and opens the existing Pix sheet on the returned charge;
    /// a pending registration retries straight onto its open charge.
    public func payInscricao() async {
        guard let detail, let priceCents = detail.priceCents, !working else { return }
        // Pending retry: the open charge is already known (story 13 + spec
        // "pending retry" — no duplicate POST needed).
        if let registration = detail.registration,
           registration.isPendingPayment,
           let chargeId = registration.chargeId {
            pixTarget = PixTarget(chargeId: chargeId, amountCents: priceCents)
            return
        }
        working = true
        actionError = nil
        defer { working = false }
        do {
            let outcome = try await repository.alunoRegister(eventId: eventId)
            guard let chargeId = outcome.chargeId ?? outcome.registration.chargeId else {
                // Paid registration without a charge is a contract breach.
                actionError = EventsMessages.generic
                return
            }
            pixTarget = PixTarget(chargeId: chargeId, amountCents: priceCents)
            await load()
        } catch let error as ApiError {
            actionError = EventsMessages.message(for: error)
        } catch {
            actionError = EventsMessages.generic
        }
    }

    /// "Cancelar participação" — free or still-pending only (story 15); the
    /// server cancels the open charge alongside.
    public func cancelParticipation() async {
        guard !working else { return }
        working = true
        actionError = nil
        defer { working = false }
        do {
            try await repository.alunoCancelRegistration(eventId: eventId)
            await load()
        } catch let error as ApiError {
            actionError = EventsMessages.message(for: error)
        } catch {
            actionError = EventsMessages.generic
        }
    }

    /// Fired by the settled Pix sheet — refetch so the registration flips to
    /// confirmed through the normalized-event handler (server truth).
    public func paymentSettled() async {
        await load()
    }
}
