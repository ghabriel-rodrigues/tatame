// Domain models for the store slice (spec 009-store, STO.14-15). Mapped
// from the generated OpenAPI types inside TatameAPI — features only ever see
// these (ticket 02 convention). Amounts are integer cents; the product tile
// is a 1–3 letter monogram on a design-system gradient preset (no image
// upload in v1, recorded debt).

import Foundation

/// Shared contract enum — the `order_status` lifecycle. PT-BR labels are
/// client copy (StoreFormatters): pending = "Aguardando pagamento"
/// (buyer-side only), paid = "Recebido", ready = "Em andamento",
/// delivered = "Entregue", canceled = "Cancelado".
public enum StoreOrderStatus: String, Sendable {
    case pending
    case paid
    case ready
    case delivered
    case canceled
}

/// One card of the vitrine grid / aluno home "Loja da academia" strip
/// (ProductCardDto — the shared card base every surface renders).
public struct StoreProductCard: Sendable, Equatable, Identifiable {
    public let id: UUID
    public let name: String
    /// Integer cents.
    public let priceCents: Int
    /// 1–3 letters on the gradient tile.
    public let monogram: String
    /// Design-system gradient catalog slug (StoreGradients).
    public let gradientPreset: String
    public let categoryId: UUID?
    /// The grid card's trailing category label.
    public let categoryName: String?

    public init(
        id: UUID,
        name: String,
        priceCents: Int,
        monogram: String,
        gradientPreset: String,
        categoryId: UUID? = nil,
        categoryName: String? = nil
    ) {
        self.id = id
        self.name = name
        self.priceCents = priceCents
        self.monogram = monogram
        self.gradientPreset = gradientPreset
        self.categoryId = categoryId
        self.categoryName = categoryName
    }
}

/// One chip of the vitrine's "Tudo + chips" category carousel.
public struct StoreCategory: Sendable, Equatable, Identifiable {
    public let id: UUID
    public let name: String

    public init(id: UUID, name: String) {
        self.id = id
        self.name = name
    }
}

/// GET /store/products payload — active products only, plus the chip
/// carousel data.
public struct Vitrine: Sendable, Equatable {
    public let products: [StoreProductCard]
    public let categories: [StoreCategory]

    public init(products: [StoreProductCard], categories: [StoreCategory]) {
        self.products = products
        self.categories = categories
    }
}

/// GET /store/products/:id payload — the aluno-17 detail screen.
public struct StoreProductDetail: Sendable, Equatable {
    public let id: UUID
    public let name: String
    /// Integer cents.
    public let priceCents: Int
    public let monogram: String
    public let gradientPreset: String
    public let categoryId: UUID?
    /// The banner's category chip.
    public let categoryName: String?
    public let description: String?
    /// Rendered as #chips.
    public let tags: [String]
    /// Size pills; empty = the product has no sizes.
    public let sizes: [String]
    /// Caps the quantity stepper; may be ≤ 0 (esgotado / recorded oversell).
    public let stockQty: Int

    public init(
        id: UUID,
        name: String,
        priceCents: Int,
        monogram: String,
        gradientPreset: String,
        categoryId: UUID? = nil,
        categoryName: String? = nil,
        description: String? = nil,
        tags: [String] = [],
        sizes: [String] = [],
        stockQty: Int = 0
    ) {
        self.id = id
        self.name = name
        self.priceCents = priceCents
        self.monogram = monogram
        self.gradientPreset = gradientPreset
        self.categoryId = categoryId
        self.categoryName = categoryName
        self.description = description
        self.tags = tags
        self.sizes = sizes
        self.stockQty = stockQty
    }

    /// Size pills render (and a size is required) only when non-empty.
    public var hasSizes: Bool { !sizes.isEmpty }

    /// "Esgotado" state — the CTA never orders what does not exist.
    public var isSoldOut: Bool { stockQty <= 0 }
}

/// The single item of a v1 order (snapshot at purchase — repricing never
/// rewrites history).
public struct StoreOrderItem: Sendable, Equatable {
    public let productId: UUID
    public let productName: String
    public let monogram: String
    public let gradientPreset: String
    /// Nil for sizeless products.
    public let size: String?
    public let quantity: Int
    /// Price snapshot at purchase — never the live price.
    public let unitPriceCents: Int

    public init(
        productId: UUID,
        productName: String,
        monogram: String,
        gradientPreset: String,
        size: String? = nil,
        quantity: Int,
        unitPriceCents: Int
    ) {
        self.productId = productId
        self.productName = productName
        self.monogram = monogram
        self.gradientPreset = gradientPreset
        self.size = size
        self.quantity = quantity
        self.unitPriceCents = unitPriceCents
    }
}

/// One buyer-side order (Meus pedidos card / order creation echo).
public struct StoreOrder: Sendable, Equatable, Identifiable {
    public let id: UUID
    /// Per-tenant sequential, rendered "#2431".
    public let number: Int
    public let status: StoreOrderStatus
    /// unit_price × quantity from the snapshot.
    public let totalCents: Int
    /// "Retirada na recepção" — fixed v1 copy, still a column server-side.
    public let pickupNote: String
    public let createdAt: Date
    public let item: StoreOrderItem?
    /// Open order-origin charge to pay — present on `pending` only; drives
    /// the existing Pix sheet ("Pagar" resume on Meus pedidos).
    public let chargeId: UUID?

    public init(
        id: UUID,
        number: Int,
        status: StoreOrderStatus,
        totalCents: Int,
        pickupNote: String,
        createdAt: Date,
        item: StoreOrderItem? = nil,
        chargeId: UUID? = nil
    ) {
        self.id = id
        self.number = number
        self.status = status
        self.totalCents = totalCents
        self.pickupNote = pickupNote
        self.createdAt = createdAt
        self.item = item
        self.chargeId = chargeId
    }

    /// "Aguardando pagamento" card state — "Pagar" resume + cancel live here.
    public var isAwaitingPayment: Bool { status == .pending }

    /// Buyer cancel is pending-only (a paid order is undone only by the
    /// admin refund path).
    public var isCancelable: Bool { status == .pending }

    /// The retirada note shows while there is something to pick up at the
    /// recepção (paid/ready — delivered and canceled have nothing waiting).
    public var showsPickupNote: Bool { status == .paid || status == .ready }
}

/// POST /store/orders result — the pending order plus the order-origin
/// charge the existing billing rails (Pix sheet + simulate) settle.
public struct StoreOrderOutcome: Sendable, Equatable {
    public let order: StoreOrder
    /// Pay this via POST /store/charges/:id/payments + the simulate button,
    /// addressed "Pedido #NNNN · <produto>".
    public let chargeId: UUID

    public init(order: StoreOrder, chargeId: UUID) {
        self.order = order
        self.chargeId = chargeId
    }
}
