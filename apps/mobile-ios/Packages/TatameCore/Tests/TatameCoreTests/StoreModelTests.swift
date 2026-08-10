import Foundation
import Testing
@testable import TatameCore

@Suite("Store PT-BR formatters & model helpers (spec 009)")
struct StoreModelTests {
    private static let productId = UUID(uuidString: "0198a7b0-0000-7000-8000-0000000000a1")!
    private static let orderId = UUID(uuidString: "0198a7b0-0000-7000-8000-0000000000a2")!
    private static let chargeId = UUID(uuidString: "0198a7b0-0000-7000-8000-0000000000a3")!

    private static func item(size: String? = "M", quantity: Int = 1) -> StoreOrderItem {
        StoreOrderItem(
            productId: productId,
            productName: "Kimono oficial Horizonte",
            monogram: "GI",
            gradientPreset: "store-blue-purple",
            size: size,
            quantity: quantity,
            unitPriceCents: 38900
        )
    }

    private static func order(
        status: StoreOrderStatus = .pending,
        item: StoreOrderItem? = item(),
        totalCents: Int = 38900,
        chargeId: UUID? = nil
    ) -> StoreOrder {
        StoreOrder(
            id: orderId,
            number: 2431,
            status: status,
            totalCents: totalCents,
            pickupNote: "Retirada na recepção",
            createdAt: Date(timeIntervalSince1970: 1_755_000_000),
            item: item,
            chargeId: chargeId
        )
    }

    @Test("order number renders #2431; Pix subtitle addresses Pedido #NNNN · produto")
    func orderNumber() {
        #expect(StoreFormatters.orderNumber(2431) == "#2431")
        #expect(
            StoreFormatters.pedidoPTBR(number: 2431, productName: "Kimono oficial Horizonte")
                == "Pedido #2431 · Kimono oficial Horizonte"
        )
    }

    @Test("buy CTA: 'Comprar com Pix · R$ X' formats price × quantity cents")
    func buyButton() {
        #expect(StoreFormatters.buyButtonPTBR(totalCents: 38900) == "Comprar com Pix · R$ 389,00")
        #expect(StoreFormatters.buyButtonPTBR(totalCents: 77800) == "Comprar com Pix · R$ 778,00")
    }

    @Test("gallery indicator is 1-based: 'Foto 1 de 3'")
    func fotoIndicator() {
        #expect(StoreFormatters.fotoIndicatorPTBR(index: 0, count: 3) == "Foto 1 de 3")
        #expect(StoreFormatters.fotoIndicatorPTBR(index: 2, count: 3) == "Foto 3 de 3")
    }

    @Test("stock line: 'N em estoque · retirada…', Esgotado at zero or below")
    func stockLine() {
        #expect(StoreFormatters.stockLinePTBR(stockQty: 12) == "12 em estoque · retirada na recepção da academia")
        #expect(StoreFormatters.stockLinePTBR(stockQty: 0) == "Esgotado · retirada na recepção da academia")
        // The recorded oversell (negative stock) still reads as esgotado.
        #expect(StoreFormatters.stockLinePTBR(stockQty: -1) == "Esgotado · retirada na recepção da academia")
    }

    @Test("status chips carry the spec's fixed PT-BR labels")
    func statusLabels() {
        #expect(StoreFormatters.statusLabelPTBR(.pending) == "Aguardando pagamento")
        #expect(StoreFormatters.statusLabelPTBR(.paid) == "Recebido")
        #expect(StoreFormatters.statusLabelPTBR(.ready) == "Em andamento")
        #expect(StoreFormatters.statusLabelPTBR(.delivered) == "Entregue")
        #expect(StoreFormatters.statusLabelPTBR(.canceled) == "Cancelado")
    }

    @Test("order card title and item line: '#2431 · produto', 'Tam M · 1 un · R$ 389,00'")
    func orderCardLines() {
        let order = Self.order()
        #expect(StoreFormatters.orderTitlePTBR(order: order) == "#2431 · Kimono oficial Horizonte")
        #expect(StoreFormatters.orderItemLinePTBR(order: order) == "Tam M · 1 un · R$ 389,00")
    }

    @Test("sizeless item line drops the Tam part; itemless orders fall back to the total")
    func orderCardLineFallbacks() {
        let sizeless = Self.order(item: Self.item(size: nil, quantity: 2), totalCents: 77800)
        #expect(StoreFormatters.orderItemLinePTBR(order: sizeless) == "2 un · R$ 778,00")
        let itemless = Self.order(item: nil)
        #expect(StoreFormatters.orderTitlePTBR(order: itemless) == "#2431")
        #expect(StoreFormatters.orderItemLinePTBR(order: itemless) == "R$ 389,00")
    }

    @Test("tag chips gain the # prefix exactly once")
    func tagChips() {
        #expect(StoreFormatters.tagChipPTBR("kimono") == "#kimono")
        #expect(StoreFormatters.tagChipPTBR("#gi") == "#gi")
    }

    @Test("detail helpers: hasSizes and isSoldOut (zero and negative stock)")
    func detailHelpers() {
        let sized = StoreProductDetail(
            id: Self.productId, name: "Kimono", priceCents: 38900,
            monogram: "GI", gradientPreset: "store-blue-purple",
            sizes: ["P", "M", "G", "GG"], stockQty: 12
        )
        #expect(sized.hasSizes)
        #expect(!sized.isSoldOut)
        let soldOut = StoreProductDetail(
            id: Self.productId, name: "Faixa", priceCents: 7900,
            monogram: "FX", gradientPreset: "store-pink-purple",
            sizes: [], stockQty: 0
        )
        #expect(!soldOut.hasSizes)
        #expect(soldOut.isSoldOut)
    }

    @Test("buyer order states: pending is awaiting payment and cancelable; paid is neither")
    func orderStates() {
        let pending = Self.order(status: .pending, chargeId: Self.chargeId)
        #expect(pending.isAwaitingPayment)
        #expect(pending.isCancelable)
        for status in [StoreOrderStatus.paid, .ready, .delivered, .canceled] {
            let order = Self.order(status: status)
            #expect(!order.isAwaitingPayment)
            #expect(!order.isCancelable)
        }
    }

    @Test("retirada note shows only while there is something to pick up (paid/ready)")
    func pickupNoteVisibility() {
        #expect(Self.order(status: .paid).showsPickupNote)
        #expect(Self.order(status: .ready).showsPickupNote)
        for status in [StoreOrderStatus.pending, .delivered, .canceled] {
            #expect(!Self.order(status: status).showsPickupNote)
        }
    }

    @Test("order date line: 'Feito em 12/08' (UTC, dd/MM)")
    func orderDateLine() {
        // 2025-08-12T10:40:00Z.
        let created = Date(timeIntervalSince1970: 1_755_000_000)
        #expect(StoreFormatters.orderDateLinePTBR(createdAt: created) == "Feito em 12/08")
    }

    @Test("AlunoHome.applying preserves the store strip across a check-in")
    func homeStripSurvivesCheckin() {
        let card = StoreProductCard(
            id: Self.productId,
            name: "Kimono oficial",
            priceCents: 38900,
            monogram: "GI",
            gradientPreset: "store-blue-purple"
        )
        let stats = AlunoStats(
            monthPresencePct: 80,
            monthAttendedSessions: 8,
            monthTotalSessions: 10,
            streak: nil,
            totalLessons: 42
        )
        let home = AlunoHome(
            studentId: UUID(),
            studentName: "Ana Aluna",
            todayClass: nil,
            stats: stats,
            storeStrip: [card]
        )
        let applied = home.applying(
            CheckinResult(
                status: .checkedIn,
                attendance: AttendanceRef(
                    id: UUID(),
                    classSessionId: UUID(),
                    method: .manual,
                    checkedInAt: Date()
                ),
                session: CheckinSessionRef(
                    id: UUID(),
                    classId: UUID(),
                    className: "Adulto Gi",
                    sessionDate: "2026-08-10"
                ),
                stats: stats
            )
        )
        #expect(applied.storeStrip == [card])
    }
}
