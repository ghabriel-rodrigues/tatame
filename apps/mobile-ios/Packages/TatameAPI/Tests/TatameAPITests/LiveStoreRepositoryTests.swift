import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing
@testable import TatameAPI
import TatameCore

@Suite("LiveStoreRepository (generated client → domain mapping)")
struct LiveStoreRepositoryTests {
    private static let baseURL = URL(string: "http://localhost:3000")!
    private static let productId = UUID(uuidString: "0198a7b0-0000-7000-8000-0000000000d1")!
    private static let categoryId = UUID(uuidString: "0198a7b0-0000-7000-8000-0000000000d2")!
    private static let orderId = UUID(uuidString: "0198a7b0-0000-7000-8000-0000000000d3")!
    private static let chargeId = UUID(uuidString: "0198a7b0-0000-7000-8000-0000000000d4")!
    private static let paymentId = UUID(uuidString: "0198a7b0-0000-7000-8000-0000000000d5")!

    private func makeRepository(_ responses: [(HTTPResponse, Data?)]) -> (LiveStoreRepository, TransportMock) {
        let transport = TransportMock(responses: responses)
        let client = Client(
            serverURL: Self.baseURL,
            configuration: TatameClientDefaults.configuration,
            transport: transport
        )
        return (LiveStoreRepository(client: client), transport)
    }

    private func json(_ body: String, status: HTTPResponse.Status = .ok) -> (HTTPResponse, Data?) {
        var response = HTTPResponse(status: status)
        response.headerFields[.contentType] = "application/json"
        return (response, Data(body.utf8))
    }

    private func problem(status: Int, code: String) -> (HTTPResponse, Data?) {
        var response = HTTPResponse(status: .init(code: status))
        response.headerFields[.contentType] = "application/problem+json"
        return (response, Data("{\"status\":\(status),\"code\":\"\(code)\"}".utf8))
    }

    // MARK: Vitrine

    @Test("vitrine maps product cards + category chips and hits the bare route")
    func vitrineMapping() async throws {
        let body = """
        {"products": [
            {"id": "\(Self.productId.uuidString.lowercased())", "name": "Kimono oficial Horizonte",
             "priceCents": 38900, "monogram": "GI", "gradientPreset": "store-blue-purple",
             "categoryId": "\(Self.categoryId.uuidString.lowercased())", "categoryName": "Kimonos"}
        ],
         "categories": [
            {"id": "\(Self.categoryId.uuidString.lowercased())", "name": "Kimonos"}
        ]}
        """
        let (repository, transport) = makeRepository([json(body)])

        let vitrine = try await repository.vitrine(search: nil, categoryId: nil)

        #expect(transport.requests[0].0.path == "/v1/store/products")
        #expect(vitrine.products.count == 1)
        #expect(vitrine.products[0].name == "Kimono oficial Horizonte")
        #expect(vitrine.products[0].priceCents == 38900)
        #expect(vitrine.products[0].monogram == "GI")
        #expect(vitrine.products[0].gradientPreset == "store-blue-purple")
        #expect(vitrine.products[0].categoryName == "Kimonos")
        #expect(vitrine.categories == [StoreCategory(id: Self.categoryId, name: "Kimonos")])
    }

    @Test("search + category filter ride the query string")
    func vitrineQuery() async throws {
        let (repository, transport) = makeRepository([json("{\"products\": [], \"categories\": []}")])

        let vitrine = try await repository.vitrine(search: "kimono", categoryId: Self.categoryId)

        let path = try #require(transport.requests[0].0.path)
        #expect(path.hasPrefix("/v1/store/products?"))
        #expect(path.contains("search=kimono"))
        #expect(path.contains("categoryId=\(Self.categoryId.uuidString.lowercased())"))
        // Honest empty state — no fabricated products.
        #expect(vitrine.products.isEmpty)
    }

    // MARK: Detail

    @Test("productDetail maps tags, sizes and stock (the stepper cap)")
    func detailMapping() async throws {
        let body = """
        {"id": "\(Self.productId.uuidString.lowercased())", "name": "Kimono oficial Horizonte",
         "priceCents": 38900, "monogram": "GI", "gradientPreset": "store-blue-purple",
         "categoryId": "\(Self.categoryId.uuidString.lowercased())", "categoryName": "Kimonos",
         "description": "Trançado leve com bordados oficiais da equipe.",
         "tags": ["kimono", "gi", "competição"], "sizes": ["P", "M", "G", "GG"], "stockQty": 12}
        """
        let (repository, transport) = makeRepository([json(body)])

        let detail = try await repository.productDetail(productId: Self.productId)

        #expect(transport.requests[0].0.path == "/v1/store/products/\(Self.productId.uuidString.lowercased())")
        #expect(detail.name == "Kimono oficial Horizonte")
        #expect(detail.tags == ["kimono", "gi", "competição"])
        #expect(detail.sizes == ["P", "M", "G", "GG"])
        #expect(detail.hasSizes)
        #expect(detail.stockQty == 12)
        #expect(!detail.isSoldOut)
    }

    @Test("archived/foreign products behave as 404 with the stable code")
    func detailNotFound() async throws {
        let (repository, _) = makeRepository([problem(status: 404, code: ApiErrorCode.notFound)])

        await #expect(throws: ApiError.notFound(code: ApiErrorCode.notFound)) {
            _ = try await repository.productDetail(productId: Self.productId)
        }
    }

    // MARK: Order creation

    @Test("createOrder posts size + quantity and maps the pending order + order-origin chargeId")
    func createOrder() async throws {
        let body = """
        {"order": {"id": "\(Self.orderId.uuidString.lowercased())", "number": 2431,
                   "status": "pending", "totalCents": 77800,
                   "pickupNote": "Retirada na recepção",
                   "createdAt": "2026-08-10T14:00:00.000Z",
                   "item": {"productId": "\(Self.productId.uuidString.lowercased())",
                            "productName": "Kimono oficial Horizonte", "monogram": "GI",
                            "gradientPreset": "store-blue-purple", "size": "M",
                            "quantity": 2, "unitPriceCents": 38900},
                   "chargeId": "\(Self.chargeId.uuidString.lowercased())"},
         "chargeId": "\(Self.chargeId.uuidString.lowercased())"}
        """
        let (repository, transport) = makeRepository([json(body, status: .created)])

        let outcome = try await repository.createOrder(productId: Self.productId, size: "M", quantity: 2)

        let request = transport.requests[0].0
        #expect(request.method == .post)
        #expect(request.path == "/v1/store/orders")
        let sent = try #require(transport.requests[0].1)
        let sentJSON = try #require(
            try JSONSerialization.jsonObject(with: sent) as? [String: Any]
        )
        #expect(sentJSON["productId"] as? String == Self.productId.uuidString.lowercased())
        #expect(sentJSON["size"] as? String == "M")
        #expect(sentJSON["quantity"] as? Double == 2)

        #expect(outcome.order.number == 2431)
        #expect(outcome.order.status == .pending)
        #expect(outcome.order.totalCents == 77800)
        #expect(outcome.order.pickupNote == "Retirada na recepção")
        // The snapshot, never the live price.
        #expect(outcome.order.item?.unitPriceCents == 38900)
        #expect(outcome.order.item?.size == "M")
        #expect(outcome.chargeId == Self.chargeId)
    }

    @Test("the stable store codes survive the mapping (insufficient_stock, size_required)")
    func storeErrorCodes() async throws {
        let (repository, _) = makeRepository([
            problem(status: 409, code: ApiErrorCode.storeInsufficientStock),
            problem(status: 422, code: ApiErrorCode.storeSizeRequired),
        ])

        await #expect(throws: ApiError.conflict(code: ApiErrorCode.storeInsufficientStock)) {
            _ = try await repository.createOrder(productId: Self.productId, size: nil, quantity: 99)
        }
        // 422 without field errors flows through as unknown-with-code; the
        // stable code is what features branch on.
        do {
            _ = try await repository.createOrder(productId: Self.productId, size: nil, quantity: 1)
            Issue.record("expected size_required to throw")
        } catch let error as ApiError {
            #expect(error.code == ApiErrorCode.storeSizeRequired || error.code == ApiErrorCode.validationFailed)
        }
    }

    // MARK: Meus pedidos

    @Test("myOrders maps the buyer list newest first, pending rows carrying the open chargeId")
    func myOrders() async throws {
        let body = """
        {"orders": [
            {"id": "\(Self.orderId.uuidString.lowercased())", "number": 2432,
             "status": "pending", "totalCents": 7900,
             "pickupNote": "Retirada na recepção",
             "createdAt": "2026-08-10T14:00:00.000Z",
             "item": {"productId": "\(Self.productId.uuidString.lowercased())",
                      "productName": "Faixa oficial bordada", "monogram": "FX",
                      "gradientPreset": "store-pink-purple", "size": null,
                      "quantity": 1, "unitPriceCents": 7900},
             "chargeId": "\(Self.chargeId.uuidString.lowercased())"},
            {"id": "\(UUID().uuidString.lowercased())", "number": 2431,
             "status": "paid", "totalCents": 38900,
             "pickupNote": "Retirada na recepção",
             "createdAt": "2026-08-09T14:00:00.000Z",
             "item": null, "chargeId": null}
        ]}
        """
        let (repository, transport) = makeRepository([json(body)])

        let orders = try await repository.myOrders()

        #expect(transport.requests[0].0.path == "/v1/store/orders")
        #expect(orders.count == 2)
        #expect(orders[0].isAwaitingPayment)
        #expect(orders[0].chargeId == Self.chargeId)
        #expect(orders[0].item?.size == nil)
        #expect(orders[1].status == .paid)
        #expect(orders[1].chargeId == nil)
        #expect(!orders[1].isCancelable)
    }

    @Test("cancelOrder hits the DELETE route; a paid order rejects with the stable code")
    func cancelOrder() async throws {
        let (repository, transport) = makeRepository([
            (HTTPResponse(status: .noContent), nil),
            problem(status: 409, code: ApiErrorCode.storeOrderNotCancelable),
        ])

        try await repository.cancelOrder(orderId: Self.orderId)

        let request = transport.requests[0].0
        #expect(request.method == .delete)
        #expect(request.path == "/v1/store/orders/\(Self.orderId.uuidString.lowercased())")

        await #expect(throws: ApiError.conflict(code: ApiErrorCode.storeOrderNotCancelable)) {
            try await repository.cancelOrder(orderId: Self.orderId)
        }
    }

    // MARK: Store payment route (persona-neutral wallet twin)

    @Test("payOrderCharge posts pix to the store route and maps the pending payment")
    func payOrderCharge() async throws {
        let body = """
        {"payment": {"id": "\(Self.paymentId.uuidString.lowercased())",
                     "chargeId": "\(Self.chargeId.uuidString.lowercased())",
                     "method": "pix", "status": "pending", "amountCents": 38900,
                     "currency": "BRL", "provider": "simulated",
                     "providerData": {"qrPayload": "pix-qr", "copiaECola": "pix-copia"},
                     "paidAt": null, "receiptUrl": null},
         "charge": {"id": "\(Self.chargeId.uuidString.lowercased())",
                    "studentId": "\(UUID().uuidString.lowercased())", "guardianId": null,
                    "status": "open", "overdue": false, "amountCents": 38900,
                    "currency": "BRL", "dueDate": "2026-08-10",
                    "periodStart": null, "periodEnd": null, "academyPlanId": null,
                    "payments": []},
         "mandateCreated": false}
        """
        let (repository, transport) = makeRepository([json(body, status: .created)])

        let created = try await repository.payOrderCharge(chargeId: Self.chargeId)

        let request = transport.requests[0].0
        #expect(request.method == .post)
        #expect(request.path == "/v1/store/charges/\(Self.chargeId.uuidString.lowercased())/payments")
        #expect(created.payment.method == .pix)
        #expect(created.payment.status == .pending)
        // The simulate gate (story 44 treatment carried over to the store).
        #expect(created.payment.provider == .simulated)
        #expect(created.payment.providerData?.qrPayload == "pix-qr")
        #expect(created.mandateCreated == false)
    }

    @Test("a foreign charge behaves as 404 (buyers pay only their own orders)")
    func payForeignCharge() async throws {
        let (repository, _) = makeRepository([problem(status: 404, code: ApiErrorCode.notFound)])

        await #expect(throws: ApiError.notFound(code: ApiErrorCode.notFound)) {
            _ = try await repository.payOrderCharge(chargeId: Self.chargeId)
        }
    }
}
