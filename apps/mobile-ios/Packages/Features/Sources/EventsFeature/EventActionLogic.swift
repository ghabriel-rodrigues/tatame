// Pure decision logic for the events slice (spec 008 testing decisions:
// "pure-logic tests for the detail button state machine (free/paid ×
// none/pending/confirmed → label and action) and the dependent-chip toggle
// mapping"). No SwiftUI here — FeaturesTests pins every cell of the matrix.

import Foundation
import TatameCore

/// What the aluno-10 detail screen renders below the description.
public struct EventDetailCTA: Equatable, Sendable {
    /// The primary button.
    public enum Primary: Equatable, Sendable {
        /// "Confirmar presença" (free events).
        case confirm
        /// "Pagar inscrição · R$ X" — covers first registration and the
        /// pending retry (spec 008: re-opening the sheet on the open charge).
        case pay(priceCents: Int)
        /// No primary button (confirmed state shows the banner instead).
        case none
    }

    public let primary: Primary
    /// The green "Presença confirmada — até lá!" banner.
    public let showsConfirmedBanner: Bool
    /// The "Inscrição aguardando pagamento." pending banner.
    public let showsPendingBanner: Bool
    /// "Cancelar participação" — free or not-yet-paid only (story 15);
    /// a paid confirmed registration is undone only by the admin refund.
    public let showsCancel: Bool

    /// The state machine: free/paid × none/pending/confirmed/canceled
    /// (`priceCents == nil` means gratuito, matching the schema).
    public static func state(priceCents: Int?, registration: EventRegistrationState?) -> EventDetailCTA {
        switch registration?.status {
        case .confirmed:
            EventDetailCTA(
                primary: .none,
                showsConfirmedBanner: true,
                showsPendingBanner: false,
                showsCancel: priceCents == nil
            )
        case .pendingPayment:
            EventDetailCTA(
                primary: .pay(priceCents: priceCents ?? 0),
                showsConfirmedBanner: false,
                showsPendingBanner: true,
                showsCancel: true
            )
        case .canceled, nil:
            EventDetailCTA(
                primary: priceCents.map { .pay(priceCents: $0) } ?? .confirm,
                showsConfirmedBanner: false,
                showsPendingBanner: false,
                showsCancel: false
            )
        }
    }
}

/// What tapping a dependent chip does on the responsável Eventos tab
/// (responsavel-06; spec 008 stories 19-21).
///
/// Documented UX: free chips toggle (tap confirms, tap again cancels, per
/// the prototype); a paid chip without a registration starts the paid flow
/// (register → Pix sheet); a paid pending chip re-opens the Pix sheet on the
/// open charge (tap) and offers "Cancelar participação" via long-press; a
/// paid *confirmed* chip is inert — settled registrations are undone only by
/// the audited admin refund (spec 008 story 15 counterpart).
public enum DependentChipAction: Equatable, Sendable {
    /// Free event, not registered → confirm on the spot.
    case confirm
    /// Paid event → register (when `chargeId == nil`) and/or open the Pix
    /// sheet on the open charge.
    case pay(openChargeId: UUID?)
    /// Free event, confirmed → cancel (the prototype's toggle).
    case cancel
    /// Paid confirmed — inert.
    case none

    public static func forTap(priceCents: Int?, registration: EventRegistrationState?) -> DependentChipAction {
        switch registration?.status {
        case .confirmed:
            priceCents == nil ? .cancel : .none
        case .pendingPayment:
            .pay(openChargeId: registration?.chargeId)
        case .canceled, nil:
            priceCents == nil ? .confirm : .pay(openChargeId: nil)
        }
    }

    /// Long-press cancel affordance: pending registrations only (free ones
    /// already toggle on tap).
    public static func canCancelPending(registration: EventRegistrationState?) -> Bool {
        registration?.isPendingPayment == true
    }
}

public extension Charge {
    /// Local projection of the event-origin charge the registration POST
    /// returned. The payment flow only ever reads `id` (the pay call) and
    /// `amountCents`/`dueDate` (display) — billing owns the real row, so the
    /// other fields are display-only stand-ins and never leave the device.
    static func eventInscricao(
        chargeId: UUID,
        amountCents: Int,
        dueDate: String?,
        studentId: UUID
    ) -> Charge {
        Charge(
            id: chargeId,
            studentId: studentId,
            status: .open,
            overdue: false,
            amountCents: amountCents,
            currency: "BRL",
            dueDate: dueDate ?? ""
        )
    }
}
