// Meus pedidos model (spec 009, STO.15 — stories 27-28): own orders newest
// first with the PT-BR status chips, "Pagar" resuming the SAME open charge
// on pending orders through the existing Pix sheet, and the pending-only
// cancel (a paid order is undone only by the admin refund path). For the
// professor (no Carteira) this list is the purchase record; the aluno's
// settled order payments also land in the Carteira histórico via billing.

import Foundation
import Observation
import TatameCore

@MainActor
@Observable
public final class StoreOrdersModel {
    public enum Phase: Equatable, Sendable {
        case idle
        case loading
        case loaded([StoreOrder])
        case failed(message: String)
    }

    /// Pix-sheet target: the pending order's open order-origin charge.
    public struct PixTarget: Identifiable, Equatable, Sendable {
        public let chargeId: UUID
        public let orderNumber: Int
        public let productName: String
        public let amountCents: Int

        public var id: UUID { chargeId }
    }

    public private(set) var phase: Phase = .idle
    /// Inline error for the cancel action.
    public private(set) var actionError: String?
    public private(set) var working = false
    public var pixTarget: PixTarget?

    @ObservationIgnored private let repository: any StoreRepository

    public init(repository: any StoreRepository) {
        self.repository = repository
    }

    public var orders: [StoreOrder] {
        if case .loaded(let orders) = phase { return orders }
        return []
    }

    public var isLoaded: Bool {
        if case .loaded = phase { return true }
        return false
    }

    public func load() async {
        if case .loaded = phase {} else {
            phase = .loading
        }
        do {
            phase = .loaded(try await repository.myOrders())
        } catch let error as ApiError {
            phase = .failed(message: StoreMessages.message(for: error, notFound: StoreMessages.loadFailed))
        } catch {
            phase = .failed(message: StoreMessages.generic)
        }
    }

    /// "Pagar" — resumes the SAME open charge of an awaiting-payment order
    /// on the existing Pix sheet (no new POST; spec 009 pending resume).
    public func pay(_ order: StoreOrder) {
        guard order.isAwaitingPayment, let chargeId = order.chargeId else { return }
        pixTarget = PixTarget(
            chargeId: chargeId,
            orderNumber: order.number,
            productName: order.item?.productName ?? "",
            amountCents: order.totalCents
        )
    }

    /// "Cancelar pedido" — pending-only (story 28); the server cancels the
    /// open charge alongside.
    public func cancel(_ order: StoreOrder) async {
        guard order.isCancelable, !working else { return }
        working = true
        actionError = nil
        defer { working = false }
        do {
            try await repository.cancelOrder(orderId: order.id)
            await load()
        } catch let error as ApiError {
            actionError = StoreMessages.message(for: error, notFound: StoreMessages.orderNotFound)
        } catch {
            actionError = StoreMessages.generic
        }
    }

    /// Fired by the settled Pix sheet — refetch so the order flips to
    /// Recebido through the normalized-event handler (server truth).
    public func paymentSettled() async {
        await load()
    }
}
