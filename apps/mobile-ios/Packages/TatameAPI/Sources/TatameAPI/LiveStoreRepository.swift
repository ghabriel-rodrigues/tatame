// LiveStoreRepository — the generated Client wrapped behind the TatameCore
// protocol (spec 009, STO.14-15; same pattern as LiveEventsRepository).
// Every error is normalized into ApiError; the stable store.* codes
// (insufficient_stock, size_required/invalid, product_not_purchasable,
// order_not_cancelable) flow through the problem+json mapper untouched.
// Money stays on the billing rails: `payOrderCharge` is the persona-neutral
// store payment route and settlement still rides the shared simulate
// endpoint (BillingRepository).

import Foundation
import TatameCore

struct LiveStoreRepository: StoreRepository {
    let client: Client

    func vitrine(search: String?, categoryId: UUID?) async throws -> Vitrine {
        try await ApiErrorMapper.run {
            let response = try await client.StorefrontController_list_v1(
                .init(query: .init(
                    search: search,
                    categoryId: categoryId?.uuidString.lowercased()
                ))
            )
            switch response {
            case .ok(let ok):
                return try Vitrine(dto: try ok.body.json)
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }

    func productDetail(productId: UUID) async throws -> StoreProductDetail {
        try await ApiErrorMapper.run {
            let response = try await client.StorefrontController_detail_v1(
                .init(path: .init(id: productId.uuidString.lowercased()))
            )
            switch response {
            case .ok(let ok):
                return try StoreProductDetail(dto: try ok.body.json)
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }

    func createOrder(productId: UUID, size: String?, quantity: Int) async throws -> StoreOrderOutcome {
        try await ApiErrorMapper.run {
            let response = try await client.StorefrontController_createOrder_v1(
                .init(body: .json(.init(
                    productId: productId.uuidString.lowercased(),
                    size: size,
                    quantity: Double(quantity)
                )))
            )
            switch response {
            case .created(let created):
                return try StoreOrderOutcome(dto: try created.body.json)
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }

    func myOrders() async throws -> [StoreOrder] {
        try await ApiErrorMapper.run {
            let response = try await client.StorefrontController_myOrders_v1(.init())
            switch response {
            case .ok(let ok):
                return try (try ok.body.json).orders.map(StoreOrder.init(dto:))
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }

    func cancelOrder(orderId: UUID) async throws {
        try await ApiErrorMapper.run {
            let response = try await client.StorefrontController_cancelOrder_v1(
                .init(path: .init(id: orderId.uuidString.lowercased()))
            )
            switch response {
            case .noContent:
                return
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }

    func payOrderCharge(chargeId: UUID) async throws -> PaymentCreated {
        try await ApiErrorMapper.run {
            let response = try await client.StorefrontController_pay_v1(
                .init(
                    path: .init(id: chargeId.uuidString.lowercased()),
                    body: .json(.init(method: .pix))
                )
            )
            switch response {
            case .created(let created):
                return try PaymentCreated(dto: try created.body.json)
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }
}
