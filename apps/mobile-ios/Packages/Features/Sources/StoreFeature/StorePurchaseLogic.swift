// Pure decision logic for the store slice (spec 009 testing decisions:
// "pure-logic tests for the detail purchase state machine (sizeless/sized ×
// stock levels → pill/stepper/CTA state) and the status-chip label
// mapping"). No SwiftUI here — FeaturesTests pins every cell of the matrix.

import Foundation
import TatameCore

/// What the aluno-17 detail screen renders below the description: size-pill
/// requirement, stepper caps and CTA enablement. Quantity truth is clamped
/// to [1, stockQty]; stock truth itself is always the server's.
public struct StorePurchaseState: Equatable, Sendable {
    /// "Esgotado" — stock ≤ 0 (negative = the recorded oversell).
    public let soldOut: Bool
    /// Size pills render (and a selection is required) iff the product
    /// defines sizes (spec 009 story 23).
    public let needsSize: Bool
    /// CTA enabled: in stock, size satisfied, quantity within the cap.
    public let canBuy: Bool
    public let canDecrement: Bool
    public let canIncrement: Bool
    /// price × quantity from the live selection (integer cents).
    public let totalCents: Int

    /// "Comprar com Pix · R$ X" / the esgotado dead state.
    public var ctaLabelPTBR: String {
        soldOut ? "Esgotado" : StoreFormatters.buyButtonPTBR(totalCents: totalCents)
    }

    public static func state(
        detail: StoreProductDetail,
        selectedSize: String?,
        quantity: Int
    ) -> StorePurchaseState {
        let soldOut = detail.isSoldOut
        let needsSize = detail.hasSizes
        let quantityValid = quantity >= 1 && quantity <= detail.stockQty
        return StorePurchaseState(
            soldOut: soldOut,
            needsSize: needsSize,
            canBuy: !soldOut && quantityValid && (!needsSize || selectedSize != nil),
            canDecrement: quantity > 1,
            canIncrement: !soldOut && quantity < detail.stockQty,
            totalCents: detail.priceCents * quantity
        )
    }
}

/// Status-chip tone per the handoff board colors (label copy lives in
/// StoreFormatters.statusLabelPTBR — this is the color half of the pair).
public enum StoreStatusTone: Equatable, Sendable {
    case warning
    case success
    case brand
    case neutral
    case danger
}

public extension StoreOrderStatus {
    var chipTone: StoreStatusTone {
        switch self {
        case .pending: .warning
        case .paid: .success
        case .ready: .brand
        case .delivered: .neutral
        case .canceled: .danger
        }
    }
}

public extension Charge {
    /// Local projection of the order-origin charge the storefront returned.
    /// The payment flow only ever reads `id` (the store pay closure) and
    /// `amountCents` (display) — billing owns the real row, so the other
    /// fields are display-only stand-ins and never leave the device.
    /// `studentId` stays nil: professor buyers have no student row (the
    /// spec-009 relaxation).
    static func storeOrder(chargeId: UUID, amountCents: Int) -> Charge {
        Charge(
            id: chargeId,
            studentId: nil,
            status: .open,
            overdue: false,
            amountCents: amountCents,
            currency: "BRL",
            dueDate: ""
        )
    }
}
