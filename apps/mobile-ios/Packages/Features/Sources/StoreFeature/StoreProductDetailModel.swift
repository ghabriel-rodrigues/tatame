// Product detail model (spec 009, STO.14-15 — stories 22-26): the aluno-17
// screen state — gallery index, size selection (required iff the product
// has sizes), quantity stepper capped at stock — and the purchase: "Comprar
// com Pix · R$ X" POSTs the order, then the EXISTING Pix sheet + simulate
// rails settle the order-origin charge addressed "Pedido #NNNN · <produto>".
// Settlement truth stays server-side: the settled sheet triggers a refetch
// (stock decremented through the normalized-event handler), never an
// optimistic flip.

import Foundation
import Observation
import TatameCore

@MainActor
@Observable
public final class StoreProductDetailModel {
    public enum Phase: Equatable, Sendable {
        case idle
        case loading
        case loaded(StoreProductDetail)
        case failed(message: String)
    }

    /// Pix-sheet target: the order-origin charge of the just-created order
    /// (identified so `.sheet(item:)` drives presentation).
    public struct PixTarget: Identifiable, Equatable, Sendable {
        public let chargeId: UUID
        public let orderNumber: Int
        public let productName: String
        public let amountCents: Int

        public var id: UUID { chargeId }
    }

    public private(set) var phase: Phase = .idle
    /// 0-based "Foto N de 3" index; the banner renders the selected variant.
    public var galleryIndex = 0
    public private(set) var selectedSize: String?
    public private(set) var quantity = 1
    /// Inline error for the buy action (stable store.* codes → PT-BR).
    public private(set) var actionError: String?
    public private(set) var working = false
    /// STO.15 purchase feedback: flips after the settled sheet, rendering
    /// the "Pedido pago — retire na recepção da academia." banner.
    public private(set) var orderPaid = false
    public var pixTarget: PixTarget?

    public let productId: UUID
    @ObservationIgnored private let repository: any StoreRepository

    public init(productId: UUID, repository: any StoreRepository) {
        self.productId = productId
        self.repository = repository
    }

    public var detail: StoreProductDetail? {
        if case .loaded(let detail) = phase { return detail }
        return nil
    }

    /// The purchase state machine (pure logic, tested standalone).
    public var purchase: StorePurchaseState? {
        detail.map { StorePurchaseState.state(detail: $0, selectedSize: selectedSize, quantity: quantity) }
    }

    public func load() async {
        if case .loaded = phase {} else {
            phase = .loading
        }
        do {
            let detail = try await repository.productDetail(productId: productId)
            phase = .loaded(detail)
            // A refetch can lower stock (someone settled first): clamp the
            // stepper back under the cap instead of leaving a dead CTA.
            if detail.stockQty > 0 {
                quantity = min(max(quantity, 1), detail.stockQty)
            }
            // A refetch can drop a size (admin edit) — deselect it.
            if let selectedSize, !detail.sizes.contains(selectedSize) {
                self.selectedSize = nil
            }
        } catch let error as ApiError {
            phase = .failed(message: StoreMessages.message(for: error))
        } catch {
            phase = .failed(message: StoreMessages.generic)
        }
    }

    /// Size pill tap: tapping the selected pill deselects (the RN twin).
    public func toggleSize(_ size: String) {
        selectedSize = selectedSize == size ? nil : size
    }

    public func increment() {
        guard purchase?.canIncrement == true else { return }
        quantity += 1
    }

    public func decrement() {
        guard purchase?.canDecrement == true else { return }
        quantity -= 1
    }

    /// "Comprar com Pix · R$ X" — creates the pending order + order-origin
    /// charge and opens the existing Pix sheet on it (story 25).
    public func buy() async {
        guard let detail, let purchase, purchase.canBuy, !working else { return }
        working = true
        actionError = nil
        defer { working = false }
        do {
            let outcome = try await repository.createOrder(
                productId: productId,
                size: purchase.needsSize ? selectedSize : nil,
                quantity: quantity
            )
            pixTarget = PixTarget(
                chargeId: outcome.chargeId,
                orderNumber: outcome.order.number,
                productName: detail.name,
                amountCents: outcome.order.totalCents
            )
        } catch let error as ApiError {
            actionError = StoreMessages.message(for: error)
        } catch {
            actionError = StoreMessages.generic
        }
    }

    /// Fired by the settled Pix sheet — refetch so the decremented stock
    /// lands through the normalized-event handler (server truth), and show
    /// the pedido-pago feedback banner.
    public func paymentSettled() async {
        orderPaid = true
        await load()
    }
}
