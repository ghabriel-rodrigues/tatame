import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing
@testable import TatameAPI
import TatameCore

@Suite("LiveBillingRepository (generated client → domain mapping)")
struct LiveBillingRepositoryTests {
    private static let baseURL = URL(string: "http://localhost:3000")!
    private static let studentId = UUID(uuidString: "0198a7b0-0000-7000-8000-000000000031")!
    private static let planId = UUID(uuidString: "0198a7b0-0000-7000-8000-000000000032")!
    private static let chargeId = UUID(uuidString: "0198a7b0-0000-7000-8000-000000000033")!
    private static let paymentId = UUID(uuidString: "0198a7b0-0000-7000-8000-000000000034")!
    private static let historyPaymentId = UUID(uuidString: "0198a7b0-0000-7000-8000-000000000035")!
    private static let dependentId = UUID(uuidString: "0198a7b0-0000-7000-8000-000000000036")!

    private func makeRepository(_ responses: [(HTTPResponse, Data?)]) -> (LiveBillingRepository, TransportMock) {
        let transport = TransportMock(responses: responses)
        let client = Client(
            serverURL: Self.baseURL,
            configuration: TatameClientDefaults.configuration,
            transport: transport
        )
        return (LiveBillingRepository(client: client), transport)
    }

    private func ok(_ json: String, status: HTTPResponse.Status = .ok) -> (HTTPResponse, Data?) {
        var response = HTTPResponse(status: status)
        response.headerFields[.contentType] = "application/json"
        return (response, Data(json.utf8))
    }

    private func problem(status: Int, code: String) -> (HTTPResponse, Data?) {
        var response = HTTPResponse(status: .init(code: status))
        response.headerFields[.contentType] = "application/problem+json"
        return (response, Data("{\"status\":\(status),\"code\":\"\(code)\"}".utf8))
    }

    // MARK: Fixture JSON

    private var planJSON: String {
        """
        {"id": "\(Self.planId.uuidString.lowercased())", "name": "Mensal", "amountCents": 18000,
         "currency": "BRL", "recurrence": "monthly", "dueDay": 10, "isActive": true}
        """
    }

    private func paymentJSON(
        id: UUID = paymentId,
        method: String = "pix",
        status: String = "pending",
        provider: String = "simulated",
        providerData: String = """
        {"qrPayload": "TATAME-SIM-PIX-QR", "copiaECola": "TATAME-SIM-PIX-COPIA"}
        """,
        paidAt: String = "null"
    ) -> String {
        """
        {"id": "\(id.uuidString.lowercased())", "chargeId": "\(Self.chargeId.uuidString.lowercased())",
         "method": "\(method)", "status": "\(status)", "amountCents": 18000, "currency": "BRL",
         "provider": "\(provider)", "providerData": \(providerData), "paidAt": \(paidAt),
         "receiptUrl": "/v1/billing/payments/\(id.uuidString.lowercased())/receipt"}
        """
    }

    private func chargeJSON(status: String = "open", overdue: Bool = false, payments: String = "[]") -> String {
        """
        {"id": "\(Self.chargeId.uuidString.lowercased())",
         "studentId": "\(Self.studentId.uuidString.lowercased())", "guardianId": null,
         "status": "\(status)", "overdue": \(overdue), "amountCents": 18000, "currency": "BRL",
         "dueDate": "2026-08-10", "periodStart": "2026-08-01", "periodEnd": "2026-08-31",
         "academyPlanId": "\(Self.planId.uuidString.lowercased())", "payments": \(payments)}
        """
    }

    private var historyEntryJSON: String {
        """
        {"studentId": "\(Self.studentId.uuidString.lowercased())",
         "chargeId": "\(UUID().uuidString.lowercased())", "periodStart": "2026-07-01",
         "amountCents": 18000, "currency": "BRL", "chargeStatus": "paid",
         "paymentId": "\(Self.historyPaymentId.uuidString.lowercased())", "method": "pix",
         "paidAt": "2026-07-08T12:00:00.000Z", "receiptUrl": null}
        """
    }

    // MARK: Wallet

    @Test("alunoWallet maps plan header, open charge with Pix payload, recurrence, histórico")
    func walletMapping() async throws {
        let json = """
        {"student": {"id": "\(Self.studentId.uuidString.lowercased())", "fullName": "Lucas Almeida"},
         "plan": \(planJSON),
         "currentCharge": \(chargeJSON(payments: "[\(paymentJSON())]")),
         "recurrence": {"active": true, "nextChargeDueDate": "2026-09-01"},
         "history": [\(historyEntryJSON)]}
        """
        let (repository, transport) = makeRepository([ok(json)])

        let wallet = try await repository.alunoWallet()

        #expect(transport.requests[0].0.path == "/v1/aluno/wallet")
        #expect(wallet.studentName == "Lucas Almeida")
        let plan = try #require(wallet.plan)
        #expect(plan.name == "Mensal")
        #expect(plan.amountCents == 18000)
        #expect(plan.recurrence == .monthly)
        #expect(plan.dueDay == 10)
        let charge = try #require(wallet.currentCharge)
        #expect(charge.id == Self.chargeId)
        #expect(charge.status == .open)
        #expect(charge.isOpen)
        #expect(charge.dueDate == "2026-08-10")
        #expect(charge.periodStart == "2026-08-01")
        #expect(charge.payments.count == 1)
        // The provider snapshot the Pix sheet renders.
        #expect(charge.payments[0].providerData?.qrPayload == "TATAME-SIM-PIX-QR")
        #expect(charge.payments[0].providerData?.copiaECola == "TATAME-SIM-PIX-COPIA")
        #expect(charge.payments[0].provider == .simulated)
        #expect(wallet.recurrence.active)
        #expect(wallet.recurrence.nextChargeDueDate == "2026-09-01")
        #expect(wallet.history.count == 1)
        #expect(wallet.history[0].method == .pix)
        #expect(wallet.history[0].chargeStatus == .paid)
        #expect(wallet.history[0].studentName == nil)
    }

    @Test("alunoWallet maps the no-plan empty state (story 8 — never invents money)")
    func walletEmptyState() async throws {
        let json = """
        {"student": {"id": "\(Self.studentId.uuidString.lowercased())", "fullName": "Lucas Almeida"},
         "plan": null, "currentCharge": null,
         "recurrence": {"active": false, "nextChargeDueDate": null}, "history": []}
        """
        let (repository, _) = makeRepository([ok(json)])

        let wallet = try await repository.alunoWallet()

        #expect(wallet.plan == nil)
        #expect(wallet.currentCharge == nil)
        #expect(!wallet.recurrence.active)
        #expect(wallet.history.isEmpty)
    }

    // MARK: Pay

    @Test("payCharge posts the method and maps the created pending payment")
    func payPix() async throws {
        let json = """
        {"payment": \(paymentJSON()), "charge": \(chargeJSON()), "mandateCreated": false}
        """
        let (repository, transport) = makeRepository([ok(json, status: .created)])

        let created = try await repository.payCharge(
            chargeId: Self.chargeId,
            method: .pix,
            recurrence: false,
            card: nil
        )

        let (request, body) = transport.requests[0]
        #expect(request.method == .post)
        #expect(
            request.path
                == "/v1/aluno/wallet/charges/\(Self.chargeId.uuidString.lowercased())/payments"
        )
        let sent = String(decoding: try #require(body), as: UTF8.self)
        #expect(sent.contains("\"pix\""))
        // The recurrence flag is card-only — never sent on Pix.
        #expect(!sent.contains("recurrence"))
        #expect(created.payment.status == .pending)
        #expect(created.payment.providerData?.copiaECola == "TATAME-SIM-PIX-COPIA")
        #expect(!created.mandateCreated)
    }

    @Test("payCharge card + recurrence toggle sends display metadata and maps mandateCreated")
    func payCardWithMandate() async throws {
        let cardPayment = paymentJSON(
            method: "card",
            status: "succeeded",
            providerData: "{\"brand\": \"visa\", \"last4\": \"4242\"}",
            paidAt: "\"2026-08-09T12:00:00.000Z\""
        )
        let json = """
        {"payment": \(cardPayment), "charge": \(chargeJSON(status: "paid")), "mandateCreated": true}
        """
        let (repository, transport) = makeRepository([ok(json, status: .created)])

        let created = try await repository.payCharge(
            chargeId: Self.chargeId,
            method: .card,
            recurrence: true,
            card: CardDetails(holderName: "LUCAS ALMEIDA", last4: "4242")
        )

        let sent = String(decoding: try #require(transport.requests[0].1), as: UTF8.self)
        #expect(sent.contains("\"card\""))
        #expect(sent.filter { !$0.isWhitespace }.contains("\"recurrence\":true"))
        #expect(sent.contains("LUCAS ALMEIDA"))
        #expect(sent.contains("4242"))
        // Display metadata only — no PAN, no CVV keys exist on the contract.
        #expect(!sent.contains("cvv"))
        #expect(created.mandateCreated)
        #expect(created.payment.status == .succeeded)
        #expect(created.charge.isPaid)
    }

    @Test("payCharge maps the stable billing 422 codes")
    func payValidationCodes() async throws {
        let (repository, _) = makeRepository([
            problem(status: 422, code: ApiErrorCode.billingChargeNotPayable),
            problem(status: 422, code: ApiErrorCode.billingMethodMandateMismatch),
            problem(status: 422, code: ApiErrorCode.billingMandateAlreadyActive),
        ])

        await #expect(throws: ApiError.conflict(code: ApiErrorCode.billingChargeNotPayable)) {
            _ = try await repository.payCharge(chargeId: Self.chargeId, method: .pix, recurrence: false, card: nil)
        }
        await #expect(throws: ApiError.conflict(code: ApiErrorCode.billingMethodMandateMismatch)) {
            _ = try await repository.payCharge(chargeId: Self.chargeId, method: .pix, recurrence: true, card: nil)
        }
        await #expect(throws: ApiError.conflict(code: ApiErrorCode.billingMandateAlreadyActive)) {
            _ = try await repository.payCharge(chargeId: Self.chargeId, method: .card, recurrence: true, card: nil)
        }
    }

    @Test("payCharge surfaces the cross-tenant/foreign 404")
    func payForeignCharge() async throws {
        let (repository, _) = makeRepository([problem(status: 404, code: ApiErrorCode.notFound)])

        await #expect(throws: ApiError.notFound(code: ApiErrorCode.notFound)) {
            _ = try await repository.payCharge(chargeId: UUID(), method: .pix, recurrence: false, card: nil)
        }
    }

    // MARK: Mandate cancel

    @Test("cancelMandate deletes and accepts the 204; 404 when none active")
    func cancelMandate() async throws {
        let (repository, transport) = makeRepository([
            (HTTPResponse(status: .noContent), nil),
            problem(status: 404, code: ApiErrorCode.notFound),
        ])

        try await repository.cancelMandate()
        let (request, _) = transport.requests[0]
        #expect(request.method == .delete)
        #expect(request.path == "/v1/aluno/wallet/mandate")

        await #expect(throws: ApiError.notFound(code: ApiErrorCode.notFound)) {
            try await repository.cancelMandate()
        }
    }

    // MARK: Simulate + receipt (shared billing routes)

    @Test("simulatePayment settles through the endpoint and maps the paid charge")
    func simulate() async throws {
        let settled = paymentJSON(status: "succeeded", paidAt: "\"2026-08-09T12:00:00.000Z\"")
        let json = """
        {"payment": \(settled), "charge": \(chargeJSON(status: "paid"))}
        """
        let (repository, transport) = makeRepository([ok(json)])

        let settlement = try await repository.simulatePayment(paymentId: Self.paymentId)

        let (request, _) = transport.requests[0]
        #expect(request.method == .post)
        #expect(
            request.path
                == "/v1/billing/payments/\(Self.paymentId.uuidString.lowercased())/simulate"
        )
        #expect(settlement.payment.status == .succeeded)
        #expect(settlement.payment.paidAt != nil)
        #expect(settlement.charge.isPaid)
    }

    @Test("simulatePayment surfaces the 404 provider gating (story 44)")
    func simulateGated() async throws {
        let (repository, _) = makeRepository([problem(status: 404, code: ApiErrorCode.notFound)])

        await #expect(throws: ApiError.notFound(code: ApiErrorCode.notFound)) {
            _ = try await repository.simulatePayment(paymentId: Self.paymentId)
        }
    }

    @Test("receipt maps the comprovante payload")
    func receipt() async throws {
        let settled = paymentJSON(status: "succeeded", paidAt: "\"2026-08-09T12:00:00.000Z\"")
        let json = """
        {"payment": \(settled), "charge": \(chargeJSON(status: "paid")),
         "studentName": "Lucas Almeida", "planName": "Mensal", "academyName": "Horizonte BJJ"}
        """
        let (repository, transport) = makeRepository([ok(json)])

        let receipt = try await repository.receipt(paymentId: Self.paymentId)

        #expect(
            transport.requests[0].0.path
                == "/v1/billing/payments/\(Self.paymentId.uuidString.lowercased())/receipt"
        )
        #expect(receipt.studentName == "Lucas Almeida")
        #expect(receipt.planName == "Mensal")
        #expect(receipt.academyName == "Horizonte BJJ")
        #expect(receipt.payment.status == .succeeded)
    }

    // MARK: Responsável

    @Test("guardianPayments maps per-dependent charges and the consolidated histórico")
    func guardianPayments() async throws {
        let kidsPlan = """
        {"id": "\(Self.planId.uuidString.lowercased())", "name": "Kids", "amountCents": 15000,
         "currency": "BRL", "recurrence": "monthly", "dueDay": 10, "isActive": true}
        """
        let guardianHistory = """
        {"studentId": "\(Self.dependentId.uuidString.lowercased())",
         "chargeId": "\(UUID().uuidString.lowercased())", "periodStart": "2026-07-01",
         "amountCents": 15000, "currency": "BRL", "chargeStatus": "paid",
         "paymentId": "\(Self.historyPaymentId.uuidString.lowercased())", "method": "card",
         "paidAt": "2026-07-02T12:00:00.000Z", "receiptUrl": null,
         "studentName": "Júlia Silveira"}
        """
        let json = """
        {"dependents": [
           {"studentId": "\(Self.dependentId.uuidString.lowercased())", "fullName": "Pedro Silveira",
            "plan": \(kidsPlan), "currentCharge": \(chargeJSON()), "recurrenceActive": false},
           {"studentId": "\(UUID().uuidString.lowercased())", "fullName": "Júlia Silveira",
            "plan": null, "currentCharge": null, "recurrenceActive": true}
         ],
         "history": [\(guardianHistory)]}
        """
        let (repository, transport) = makeRepository([ok(json)])

        let payments = try await repository.guardianPayments()

        #expect(transport.requests[0].0.path == "/v1/responsavel/payments")
        #expect(payments.dependents.count == 2)
        #expect(payments.dependents[0].fullName == "Pedro Silveira")
        #expect(payments.dependents[0].plan?.name == "Kids")
        #expect(payments.dependents[0].currentCharge?.isOpen == true)
        #expect(!payments.dependents[0].recurrenceActive)
        #expect(payments.dependents[1].currentCharge == nil)
        #expect(payments.dependents[1].recurrenceActive)
        // Consolidated histórico carries the child name (story 20).
        #expect(payments.history[0].studentName == "Júlia Silveira")
        #expect(payments.history[0].method == .card)
    }

    @Test("payDependentCharge posts on the responsável route")
    func payDependent() async throws {
        let json = """
        {"payment": \(paymentJSON()), "charge": \(chargeJSON()), "mandateCreated": false}
        """
        let (repository, transport) = makeRepository([ok(json, status: .created)])

        _ = try await repository.payDependentCharge(
            chargeId: Self.chargeId,
            method: .pix,
            recurrence: false,
            card: nil
        )

        let (request, _) = transport.requests[0]
        #expect(request.method == .post)
        #expect(
            request.path
                == "/v1/responsavel/payments/charges/\(Self.chargeId.uuidString.lowercased())/payments"
        )
    }
}
