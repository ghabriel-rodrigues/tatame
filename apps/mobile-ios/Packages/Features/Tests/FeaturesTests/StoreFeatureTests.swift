import Foundation
import Testing
@testable import BillingFeature
@testable import StoreFeature
import TatameCore

// MARK: - Fake (repository-protocol seam, spec 009)

final class FakeStoreRepository: StoreRepository, @unchecked Sendable {
    var vitrineResult: Result<Vitrine, ApiError> = .failure(.unknown(status: 0, code: nil))
    private(set) var vitrineCalls: [(search: String?, categoryId: UUID?)] = []

    var detailResult: Result<StoreProductDetail, ApiError> = .failure(.unknown(status: 0, code: nil))
    private(set) var detailCalls: [UUID] = []

    var createOrderResult: Result<StoreOrderOutcome, ApiError> = .failure(.unknown(status: 0, code: nil))
    private(set) var createOrderCalls: [(productId: UUID, size: String?, quantity: Int)] = []

    var myOrdersResult: Result<[StoreOrder], ApiError> = .failure(.unknown(status: 0, code: nil))
    private(set) var myOrdersCalls = 0

    var cancelOrderResult: Result<Void, ApiError> = .success(())
    private(set) var cancelOrderCalls: [UUID] = []

    var payOrderChargeResult: Result<PaymentCreated, ApiError> = .failure(.unknown(status: 0, code: nil))
    private(set) var payOrderChargeCalls: [UUID] = []

    func vitrine(search: String?, categoryId: UUID?) async throws -> Vitrine {
        vitrineCalls.append((search, categoryId))
        return try vitrineResult.get()
    }

    func productDetail(productId: UUID) async throws -> StoreProductDetail {
        detailCalls.append(productId)
        return try detailResult.get()
    }

    func createOrder(productId: UUID, size: String?, quantity: Int) async throws -> StoreOrderOutcome {
        createOrderCalls.append((productId, size, quantity))
        return try createOrderResult.get()
    }

    func myOrders() async throws -> [StoreOrder] {
        myOrdersCalls += 1
        return try myOrdersResult.get()
    }

    func cancelOrder(orderId: UUID) async throws {
        cancelOrderCalls.append(orderId)
        try cancelOrderResult.get()
    }

    func payOrderCharge(chargeId: UUID) async throws -> PaymentCreated {
        payOrderChargeCalls.append(chargeId)
        return try payOrderChargeResult.get()
    }
}

// MARK: - Fixtures

enum StoreFixtures {
    static let productId = UUID(uuidString: "0198a7b0-0000-7000-8000-0000000000e1")!
    static let categoryId = UUID(uuidString: "0198a7b0-0000-7000-8000-0000000000e2")!
    static let orderId = UUID(uuidString: "0198a7b0-0000-7000-8000-0000000000e3")!
    static let chargeId = UUID(uuidString: "0198a7b0-0000-7000-8000-0000000000e4")!

    static func card(
        id: UUID = productId,
        name: String = "Kimono oficial Horizonte",
        priceCents: Int = 38900
    ) -> StoreProductCard {
        StoreProductCard(
            id: id,
            name: name,
            priceCents: priceCents,
            monogram: "GI",
            gradientPreset: "store-blue-purple",
            categoryId: categoryId,
            categoryName: "Kimonos"
        )
    }

    static func vitrine(
        products: [StoreProductCard] = [card()],
        categories: [StoreCategory] = [StoreCategory(id: categoryId, name: "Kimonos")]
    ) -> Vitrine {
        Vitrine(products: products, categories: categories)
    }

    static func detail(
        sizes: [String] = ["P", "M", "G", "GG"],
        stockQty: Int = 12,
        priceCents: Int = 38900
    ) -> StoreProductDetail {
        StoreProductDetail(
            id: productId,
            name: "Kimono oficial Horizonte",
            priceCents: priceCents,
            monogram: "GI",
            gradientPreset: "store-blue-purple",
            categoryId: categoryId,
            categoryName: "Kimonos",
            description: "Trançado leve com bordados oficiais da equipe.",
            tags: ["kimono", "gi"],
            sizes: sizes,
            stockQty: stockQty
        )
    }

    static func order(
        status: StoreOrderStatus = .pending,
        chargeId: UUID? = chargeId,
        size: String? = "M",
        quantity: Int = 1,
        totalCents: Int = 38900
    ) -> StoreOrder {
        StoreOrder(
            id: orderId,
            number: 2431,
            status: status,
            totalCents: totalCents,
            pickupNote: "Retirada na recepção",
            createdAt: Date(timeIntervalSince1970: 1_755_000_000),
            item: StoreOrderItem(
                productId: productId,
                productName: "Kimono oficial Horizonte",
                monogram: "GI",
                gradientPreset: "store-blue-purple",
                size: size,
                quantity: quantity,
                unitPriceCents: totalCents / quantity
            ),
            chargeId: chargeId
        )
    }

    static func outcome(totalCents: Int = 38900) -> StoreOrderOutcome {
        StoreOrderOutcome(order: order(totalCents: totalCents), chargeId: chargeId)
    }
}

// MARK: - Purchase state machine (spec 009 testing decisions: sizeless/sized
// × stock levels → pill/stepper/CTA state)

@Suite("StorePurchaseState (detail purchase state machine)")
struct StorePurchaseStateTests {
    @Test("sizeless in-stock product buys at quantity 1 with no pills")
    func sizelessInStock() {
        let state = StorePurchaseState.state(
            detail: StoreFixtures.detail(sizes: [], stockQty: 5),
            selectedSize: nil,
            quantity: 1
        )
        #expect(!state.needsSize)
        #expect(!state.soldOut)
        #expect(state.canBuy)
        #expect(!state.canDecrement)
        #expect(state.canIncrement)
        #expect(state.ctaLabelPTBR == "Comprar com Pix · R$ 389,00")
    }

    @Test("sized product requires a pill selection before the CTA enables")
    func sizedRequiresSelection() {
        let detail = StoreFixtures.detail()
        let unselected = StorePurchaseState.state(detail: detail, selectedSize: nil, quantity: 1)
        #expect(unselected.needsSize)
        #expect(!unselected.canBuy)

        let selected = StorePurchaseState.state(detail: detail, selectedSize: "M", quantity: 1)
        #expect(selected.canBuy)
    }

    @Test("esgotado (zero and negative stock) kills the CTA and the stepper")
    func soldOut() {
        for stock in [0, -1] {
            let state = StorePurchaseState.state(
                detail: StoreFixtures.detail(sizes: [], stockQty: stock),
                selectedSize: nil,
                quantity: 1
            )
            #expect(state.soldOut)
            #expect(!state.canBuy)
            #expect(!state.canIncrement)
            #expect(state.ctaLabelPTBR == "Esgotado")
        }
    }

    @Test("stepper caps: no increment at stock, no decrement at 1")
    func stepperCaps() {
        let detail = StoreFixtures.detail(sizes: [], stockQty: 3)
        let atFloor = StorePurchaseState.state(detail: detail, selectedSize: nil, quantity: 1)
        #expect(!atFloor.canDecrement)
        #expect(atFloor.canIncrement)

        let atCap = StorePurchaseState.state(detail: detail, selectedSize: nil, quantity: 3)
        #expect(atCap.canDecrement)
        #expect(!atCap.canIncrement)
        #expect(atCap.canBuy)
    }

    @Test("CTA total is price × quantity (the snapshot rule's client half)")
    func totalPriceTimesQuantity() {
        let state = StorePurchaseState.state(
            detail: StoreFixtures.detail(sizes: [], stockQty: 5, priceCents: 38900),
            selectedSize: nil,
            quantity: 2
        )
        #expect(state.totalCents == 77800)
        #expect(state.ctaLabelPTBR == "Comprar com Pix · R$ 778,00")
    }

    @Test("quantity above stock (stale state) disables the CTA")
    func quantityAboveStock() {
        let state = StorePurchaseState.state(
            detail: StoreFixtures.detail(sizes: [], stockQty: 2),
            selectedSize: nil,
            quantity: 3
        )
        #expect(!state.canBuy)
    }
}

// MARK: - Status chip tones + display projections

@Suite("Store status chips & charge projection")
struct StoreStatusChipTests {
    @Test("chip tone mapping follows the handoff board colors")
    func chipTones() {
        #expect(StoreOrderStatus.pending.chipTone == .warning)
        #expect(StoreOrderStatus.paid.chipTone == .success)
        #expect(StoreOrderStatus.ready.chipTone == .brand)
        #expect(StoreOrderStatus.delivered.chipTone == .neutral)
        #expect(StoreOrderStatus.canceled.chipTone == .danger)
    }

    @Test("Charge.storeOrder projection carries only id + amount, no student")
    func chargeProjection() {
        let charge = Charge.storeOrder(chargeId: StoreFixtures.chargeId, amountCents: 38900)
        #expect(charge.id == StoreFixtures.chargeId)
        #expect(charge.amountCents == 38900)
        // Professor buyers have no student row (the spec-009 relaxation).
        #expect(charge.studentId == nil)
        #expect(charge.status == .open)
    }
}

// MARK: - StoreVitrineModel (STO.14, stories 18-21)

@MainActor
@Suite("StoreVitrineModel")
struct StoreVitrineModelTests {
    @Test("load maps products + categories with no filters")
    func loadSuccess() async {
        let repository = FakeStoreRepository()
        repository.vitrineResult = .success(StoreFixtures.vitrine())
        let model = StoreVitrineModel(repository: repository)

        await model.load()

        #expect(model.products.count == 1)
        #expect(model.products[0].name == "Kimono oficial Horizonte")
        #expect(model.categories.map(\.name) == ["Kimonos"])
        #expect(repository.vitrineCalls.count == 1)
        #expect(repository.vitrineCalls[0].search == nil)
        #expect(repository.vitrineCalls[0].categoryId == nil)
    }

    @Test("search text is trimmed and empty text means no filter")
    func searchQuery() async {
        let repository = FakeStoreRepository()
        repository.vitrineResult = .success(StoreFixtures.vitrine(products: []))
        let model = StoreVitrineModel(repository: repository)

        model.searchText = "  kimono  "
        await model.load()
        #expect(repository.vitrineCalls.last?.search == "kimono")

        model.searchText = "   "
        await model.load()
        #expect(repository.vitrineCalls.last?.search == nil)

        // Honest empty state — no fabricated products (story 21).
        #expect(model.products.isEmpty)
    }

    @Test("category chip selects, refetches and toggles back to Tudo")
    func categoryToggle() async {
        let repository = FakeStoreRepository()
        repository.vitrineResult = .success(StoreFixtures.vitrine())
        let model = StoreVitrineModel(repository: repository)
        await model.load()

        await model.selectCategory(StoreFixtures.categoryId)
        #expect(model.selectedCategoryId == StoreFixtures.categoryId)
        #expect(repository.vitrineCalls.last?.categoryId == StoreFixtures.categoryId)

        // Tapping the active chip toggles back to "Tudo".
        await model.selectCategory(StoreFixtures.categoryId)
        #expect(model.selectedCategoryId == nil)
        #expect(repository.vitrineCalls.last?.categoryId == nil)
    }

    @Test("failure lands the PT-BR message; retry reloads")
    func loadFailure() async {
        let repository = FakeStoreRepository()
        repository.vitrineResult = .failure(.network(.notConnectedToInternet))
        let model = StoreVitrineModel(repository: repository)

        await model.load()

        #expect(model.phase == .failed(message: StoreMessages.offline))

        repository.vitrineResult = .success(StoreFixtures.vitrine())
        await model.load()
        #expect(model.products.count == 1)
    }
}

// MARK: - StoreProductDetailModel (STO.14, stories 22-26)

@MainActor
@Suite("StoreProductDetailModel")
struct StoreProductDetailModelTests {
    @Test("load maps the detail; purchase state starts at quantity 1")
    func loadSuccess() async {
        let repository = FakeStoreRepository()
        repository.detailResult = .success(StoreFixtures.detail())
        let model = StoreProductDetailModel(productId: StoreFixtures.productId, repository: repository)

        await model.load()

        #expect(model.detail?.name == "Kimono oficial Horizonte")
        #expect(model.quantity == 1)
        #expect(model.purchase?.needsSize == true)
        #expect(model.purchase?.canBuy == false)
        #expect(repository.detailCalls == [StoreFixtures.productId])
    }

    @Test("size pills toggle; stepper respects the stock cap")
    func sizeAndStepper() async {
        let repository = FakeStoreRepository()
        repository.detailResult = .success(StoreFixtures.detail(stockQty: 2))
        let model = StoreProductDetailModel(productId: StoreFixtures.productId, repository: repository)
        await model.load()

        model.toggleSize("M")
        #expect(model.selectedSize == "M")
        model.toggleSize("M")
        #expect(model.selectedSize == nil)
        model.toggleSize("G")
        #expect(model.selectedSize == "G")

        model.increment()
        #expect(model.quantity == 2)
        model.increment() // capped at stock
        #expect(model.quantity == 2)
        model.decrement()
        #expect(model.quantity == 1)
        model.decrement() // floored at 1
        #expect(model.quantity == 1)
    }

    @Test("buy posts productId + size + quantity and opens the Pix target")
    func buySuccess() async {
        let repository = FakeStoreRepository()
        repository.detailResult = .success(StoreFixtures.detail())
        repository.createOrderResult = .success(StoreFixtures.outcome(totalCents: 77800))
        let model = StoreProductDetailModel(productId: StoreFixtures.productId, repository: repository)
        await model.load()
        model.toggleSize("M")
        model.increment()

        await model.buy()

        #expect(repository.createOrderCalls.count == 1)
        #expect(repository.createOrderCalls[0].productId == StoreFixtures.productId)
        #expect(repository.createOrderCalls[0].size == "M")
        #expect(repository.createOrderCalls[0].quantity == 2)
        let target = try? #require(model.pixTarget)
        #expect(target?.chargeId == StoreFixtures.chargeId)
        #expect(target?.orderNumber == 2431)
        #expect(target?.productName == "Kimono oficial Horizonte")
        #expect(target?.amountCents == 77800)
        #expect(model.actionError == nil)
    }

    @Test("sizeless products post size = nil")
    func buySizeless() async {
        let repository = FakeStoreRepository()
        repository.detailResult = .success(StoreFixtures.detail(sizes: []))
        repository.createOrderResult = .success(StoreFixtures.outcome())
        let model = StoreProductDetailModel(productId: StoreFixtures.productId, repository: repository)
        await model.load()

        await model.buy()

        #expect(repository.createOrderCalls.first?.size == nil)
        #expect(model.pixTarget != nil)
    }

    @Test("buy without a required size never reaches the repository")
    func buyBlockedWithoutSize() async {
        let repository = FakeStoreRepository()
        repository.detailResult = .success(StoreFixtures.detail())
        let model = StoreProductDetailModel(productId: StoreFixtures.productId, repository: repository)
        await model.load()

        await model.buy()

        #expect(repository.createOrderCalls.isEmpty)
        #expect(model.pixTarget == nil)
    }

    @Test("stable store codes land as PT-BR action errors")
    func buyErrors() async {
        let repository = FakeStoreRepository()
        repository.detailResult = .success(StoreFixtures.detail(sizes: []))
        repository.createOrderResult = .failure(.conflict(code: ApiErrorCode.storeInsufficientStock))
        let model = StoreProductDetailModel(productId: StoreFixtures.productId, repository: repository)
        await model.load()

        await model.buy()
        #expect(model.actionError == StoreMessages.insufficientStock)

        repository.createOrderResult = .failure(.notFound(code: ApiErrorCode.storeProductNotPurchasable))
        await model.buy()
        #expect(model.actionError == StoreMessages.notPurchasable)

        repository.createOrderResult = .failure(.forbidden(code: ApiErrorCode.tenantReadOnly))
        await model.buy()
        #expect(model.actionError == StoreMessages.readOnly)
    }

    @Test("settled payment flips the feedback banner and refetches (stock truth)")
    func paymentSettled() async {
        let repository = FakeStoreRepository()
        repository.detailResult = .success(StoreFixtures.detail(sizes: [], stockQty: 5))
        let model = StoreProductDetailModel(productId: StoreFixtures.productId, repository: repository)
        await model.load()
        model.increment() // quantity 2

        // Server decremented stock to 1 through the handler.
        repository.detailResult = .success(StoreFixtures.detail(sizes: [], stockQty: 1))
        await model.paymentSettled()

        #expect(model.orderPaid)
        #expect(model.detail?.stockQty == 1)
        // The stepper clamps back under the new cap.
        #expect(model.quantity == 1)
        #expect(repository.detailCalls.count == 2)
    }
}

// MARK: - StoreOrdersModel (STO.15, stories 27-28)

@MainActor
@Suite("StoreOrdersModel")
struct StoreOrdersModelTests {
    @Test("load maps Meus pedidos; retirada note shows on paid/ready only")
    func loadSuccess() async {
        let repository = FakeStoreRepository()
        repository.myOrdersResult = .success([
            StoreFixtures.order(status: .paid, chargeId: nil),
            StoreFixtures.order(status: .delivered, chargeId: nil),
        ])
        let model = StoreOrdersModel(repository: repository)

        await model.load()

        #expect(model.orders.count == 2)
        #expect(model.orders[0].showsPickupNote)
        #expect(!model.orders[1].showsPickupNote)
    }

    @Test("Pagar resumes the SAME open charge of a pending order")
    func payResume() async {
        let repository = FakeStoreRepository()
        repository.myOrdersResult = .success([StoreFixtures.order()])
        let model = StoreOrdersModel(repository: repository)
        await model.load()

        model.pay(model.orders[0])

        let target = try? #require(model.pixTarget)
        #expect(target?.chargeId == StoreFixtures.chargeId)
        #expect(target?.orderNumber == 2431)
        #expect(target?.amountCents == 38900)
    }

    @Test("Pagar is inert on settled orders and charge-less rows")
    func payGuards() async {
        let repository = FakeStoreRepository()
        repository.myOrdersResult = .success([StoreFixtures.order(status: .paid, chargeId: nil)])
        let model = StoreOrdersModel(repository: repository)
        await model.load()

        model.pay(model.orders[0])

        #expect(model.pixTarget == nil)
    }

    @Test("pending cancel hits the repository and reloads")
    func cancelPending() async {
        let repository = FakeStoreRepository()
        repository.myOrdersResult = .success([StoreFixtures.order()])
        let model = StoreOrdersModel(repository: repository)
        await model.load()

        repository.myOrdersResult = .success([StoreFixtures.order(status: .canceled, chargeId: nil)])
        await model.cancel(model.orders[0])

        #expect(repository.cancelOrderCalls == [StoreFixtures.orderId])
        #expect(model.orders[0].status == .canceled)
        #expect(model.actionError == nil)
    }

    @Test("cancel of a paid order never reaches the repository (client half)")
    func cancelPaidBlocked() async {
        let repository = FakeStoreRepository()
        repository.myOrdersResult = .success([StoreFixtures.order(status: .paid, chargeId: nil)])
        let model = StoreOrdersModel(repository: repository)
        await model.load()

        await model.cancel(model.orders[0])

        #expect(repository.cancelOrderCalls.isEmpty)
    }

    @Test("server-side not-cancelable rejection lands the PT-BR message")
    func cancelRejected() async {
        let repository = FakeStoreRepository()
        repository.myOrdersResult = .success([StoreFixtures.order()])
        let model = StoreOrdersModel(repository: repository)
        await model.load()

        repository.cancelOrderResult = .failure(.conflict(code: ApiErrorCode.storeOrderNotCancelable))
        await model.cancel(model.orders[0])

        #expect(model.actionError == StoreMessages.orderNotCancelable)
    }
}

// MARK: - PaymentFlowModel store payer (the persona-neutral route)

@MainActor
@Suite("PaymentFlowModel store payer (spec 009)")
struct StorePaymentFlowTests {
    @Test("start creates the payment through the store route, not the wallet")
    func startUsesStoreRoute() async {
        let billing = FakeBillingRepository()
        let store = FakeStoreRepository()
        store.payOrderChargeResult = .success(
            PaymentCreated(
                payment: BillingFixtures.payment(),
                charge: BillingFixtures.charge(),
                mandateCreated: false
            )
        )
        let model = PaymentFlowModel(
            orderCharge: .storeOrder(chargeId: StoreFixtures.chargeId, amountCents: 38900),
            repository: billing,
            createOrderPayment: { try await store.payOrderCharge(chargeId: StoreFixtures.chargeId) }
        )

        await model.start()

        #expect(store.payOrderChargeCalls == [StoreFixtures.chargeId])
        // The wallet endpoints stay untouched.
        #expect(billing.payCalls.isEmpty)
        #expect(billing.payDependentCalls.isEmpty)
        // Simulate gating rides the created payment's provider (story 44).
        #expect(model.canSimulate)
    }

    @Test("simulate settles through the shared endpoint and fires onSettled")
    func simulateSettles() async {
        let billing = FakeBillingRepository()
        billing.simulateResult = .success(BillingFixtures.settlement())
        let store = FakeStoreRepository()
        store.payOrderChargeResult = .success(
            PaymentCreated(
                payment: BillingFixtures.payment(),
                charge: BillingFixtures.charge(),
                mandateCreated: false
            )
        )
        var settled = false
        let model = PaymentFlowModel(
            orderCharge: .storeOrder(chargeId: StoreFixtures.chargeId, amountCents: 38900),
            repository: billing,
            createOrderPayment: { try await store.payOrderCharge(chargeId: StoreFixtures.chargeId) },
            onSettled: { settled = true }
        )
        await model.start()

        await model.simulate()

        #expect(settled)
        if case .success = model.phase {} else {
            Issue.record("expected success phase, got \(model.phase)")
        }
    }
}

// MARK: - Integration round trip (spec 009 testing decisions: vitrine →
// detail → Comprar com Pix → simulate → Meus pedidos "Recebido")

@MainActor
@Suite("Store purchase round trip")
struct StorePurchaseRoundTripTests {
    @Test("vitrine → detail → buy → Pix simulate → Meus pedidos shows Recebido")
    func roundTrip() async throws {
        let store = FakeStoreRepository()
        let billing = FakeBillingRepository()
        store.vitrineResult = .success(StoreFixtures.vitrine())
        store.detailResult = .success(StoreFixtures.detail())
        store.createOrderResult = .success(StoreFixtures.outcome())
        store.payOrderChargeResult = .success(
            PaymentCreated(
                payment: BillingFixtures.payment(),
                charge: BillingFixtures.charge(),
                mandateCreated: false
            )
        )
        billing.simulateResult = .success(BillingFixtures.settlement())

        // Vitrine → the product card.
        let vitrine = StoreVitrineModel(repository: store)
        await vitrine.load()
        let card = try #require(vitrine.products.first)

        // Detail → size + buy → the Pix target on the order-origin charge.
        let detail = StoreProductDetailModel(productId: card.id, repository: store)
        await detail.load()
        detail.toggleSize("M")
        await detail.buy()
        let target = try #require(detail.pixTarget)
        #expect(target.chargeId == StoreFixtures.chargeId)

        // The existing Pix sheet rails: create on the store route, settle
        // through the shared simulate endpoint.
        let flow = PaymentFlowModel(
            orderCharge: .storeOrder(chargeId: target.chargeId, amountCents: target.amountCents),
            repository: billing,
            createOrderPayment: { try await store.payOrderCharge(chargeId: target.chargeId) },
            onSettled: { Task { await detail.paymentSettled() } }
        )
        await flow.start()
        #expect(flow.canSimulate)
        await flow.simulate()

        // Settlement flipped the order server-side (the fake's next fetch).
        store.myOrdersResult = .success([StoreFixtures.order(status: .paid, chargeId: nil)])
        let orders = StoreOrdersModel(repository: store)
        await orders.load()

        let first = try #require(orders.orders.first)
        #expect(first.status == .paid)
        #expect(StoreFormatters.statusLabelPTBR(first.status) == "Recebido")
        #expect(first.pickupNote == "Retirada na recepção")
        #expect(first.showsPickupNote)
    }
}
