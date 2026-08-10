// Generated `Components.Schemas.*` → TatameCore store models (spec 009;
// same convention as EventsMapping: features never see generated types).

import Foundation
import TatameCore

private func uuid(_ raw: String, _ what: String) throws -> UUID {
    guard let id = UUID(uuidString: raw) else {
        throw ApiError.decoding(description: "invalid \(what): \(raw)")
    }
    return id
}

extension StoreProductCard {
    /// The shared card base (vitrine grid + aluno home strip).
    init(dto: Components.Schemas.ProductCardDto) throws {
        self.init(
            id: try uuid(dto.id, "product id"),
            name: dto.name,
            priceCents: Int(dto.priceCents),
            monogram: dto.monogram,
            gradientPreset: dto.gradientPreset,
            categoryId: try dto.categoryId.map { try uuid($0, "category id") },
            categoryName: dto.categoryName
        )
    }
}

extension StoreCategory {
    init(dto: Components.Schemas.VitrineCategoryDto) throws {
        self.init(
            id: try uuid(dto.id, "category id"),
            name: dto.name
        )
    }
}

extension Vitrine {
    init(dto: Components.Schemas.VitrineResponseDto) throws {
        self.init(
            products: try dto.products.map(StoreProductCard.init(dto:)),
            categories: try dto.categories.map(StoreCategory.init(dto:))
        )
    }
}

extension StoreProductDetail {
    init(dto: Components.Schemas.ProductDetailDto) throws {
        self.init(
            id: try uuid(dto.id, "product id"),
            name: dto.name,
            priceCents: Int(dto.priceCents),
            monogram: dto.monogram,
            gradientPreset: dto.gradientPreset,
            categoryId: try dto.categoryId.map { try uuid($0, "category id") },
            categoryName: dto.categoryName,
            description: dto.description,
            tags: dto.tags,
            sizes: dto.sizes,
            stockQty: Int(dto.stockQty)
        )
    }
}

extension StoreOrderItem {
    init(dto: Components.Schemas.OrderItemDto) throws {
        self.init(
            productId: try uuid(dto.productId, "product id"),
            productName: dto.productName,
            monogram: dto.monogram,
            gradientPreset: dto.gradientPreset,
            size: dto.size,
            quantity: Int(dto.quantity),
            unitPriceCents: Int(dto.unitPriceCents)
        )
    }
}

extension StoreOrder {
    init(dto: Components.Schemas.OrderDto) throws {
        self.init(
            id: try uuid(dto.id, "order id"),
            number: Int(dto.number),
            status: StoreOrderStatus(rawValue: dto.status.rawValue) ?? .canceled,
            totalCents: Int(dto.totalCents),
            pickupNote: dto.pickupNote,
            createdAt: dto.createdAt,
            item: try dto.item.map { try StoreOrderItem(dto: $0.value1) },
            chargeId: try dto.chargeId.map { try uuid($0, "charge id") }
        )
    }
}

extension StoreOrderOutcome {
    init(dto: Components.Schemas.CreateOrderResponseDto) throws {
        self.init(
            order: try StoreOrder(dto: dto.order),
            chargeId: try uuid(dto.chargeId, "charge id")
        )
    }
}
