// Repository seam for the store slice (spec 009, STO.14-15). Same
// convention as EventsRepository: protocol in TatameCore, implementation in
// TatameAPI, features depend only on this protocol and throw `ApiError`.
// The storefront is shared by aluno and professor — one seam, two shells.
// Money stays on the billing rails: `payOrderCharge` is the persona-neutral
// twin of the wallet payment route (professors have no Carteira), and
// settlement still flows through the shared simulate endpoint on
// BillingRepository.

import Foundation

public protocol StoreRepository: Sendable {
    /// GET /store/products — active products only; `search` matches name +
    /// tags, `categoryId` filters one chip. Both nil = the full vitrine.
    func vitrine(search: String?, categoryId: UUID?) async throws -> Vitrine

    /// GET /store/products/:id — detail; archived/foreign products are 404.
    func productDetail(productId: UUID) async throws -> StoreProductDetail

    /// POST /store/orders — size required iff the product has sizes,
    /// quantity capped by stock (stable store.* codes otherwise). Returns
    /// the pending order plus its order-origin chargeId.
    func createOrder(productId: UUID, size: String?, quantity: Int) async throws -> StoreOrderOutcome

    /// GET /store/orders — Meus pedidos, own orders only, newest first.
    func myOrders() async throws -> [StoreOrder]

    /// DELETE /store/orders/:id — cancel an own still-pending order (cancels
    /// the open charge); paid orders reject with store.order_not_cancelable.
    func cancelOrder(orderId: UUID) async throws

    /// POST /store/charges/:id/payments — Pix payment on an own order
    /// charge; the returned pending payment drives the existing Pix sheet.
    func payOrderCharge(chargeId: UUID) async throws -> PaymentCreated
}

/// Default used by environment entries / previews; every call traps.
public struct UnimplementedStoreRepository: StoreRepository {
    public init() {}

    public func vitrine(search _: String?, categoryId _: UUID?) async throws -> Vitrine {
        fatalError("StoreRepository not injected")
    }

    public func productDetail(productId _: UUID) async throws -> StoreProductDetail {
        fatalError("StoreRepository not injected")
    }

    public func createOrder(productId _: UUID, size _: String?, quantity _: Int) async throws -> StoreOrderOutcome {
        fatalError("StoreRepository not injected")
    }

    public func myOrders() async throws -> [StoreOrder] {
        fatalError("StoreRepository not injected")
    }

    public func cancelOrder(orderId _: UUID) async throws {
        fatalError("StoreRepository not injected")
    }

    public func payOrderCharge(chargeId _: UUID) async throws -> PaymentCreated {
        fatalError("StoreRepository not injected")
    }
}
