import Foundation
import Testing
@testable import BillingFeature
import TatameCore

// MARK: - Fake (repository-protocol seam, spec 006)

final class FakeBillingRepository: BillingRepository, @unchecked Sendable {
    var walletResult: Result<Wallet, ApiError> = .failure(.unknown(status: 0, code: nil))
    private(set) var walletCalls = 0

    var payResult: Result<PaymentCreated, ApiError> = .failure(.unknown(status: 0, code: nil))
    private(set) var payCalls: [(chargeId: UUID, method: PaymentMethod, recurrence: Bool, card: CardDetails?)] = []

    var cancelMandateResult: Result<Void, ApiError> = .success(())
    private(set) var cancelMandateCalls = 0

    var guardianPaymentsResult: Result<GuardianPayments, ApiError> = .failure(.unknown(status: 0, code: nil))
    private(set) var guardianPaymentsCalls = 0

    var payDependentResult: Result<PaymentCreated, ApiError> = .failure(.unknown(status: 0, code: nil))
    private(set) var payDependentCalls: [(chargeId: UUID, method: PaymentMethod, recurrence: Bool, card: CardDetails?)] = []

    var simulateResult: Result<SimulatedSettlement, ApiError> = .failure(.unknown(status: 0, code: nil))
    private(set) var simulateCalls: [UUID] = []

    var receiptResult: Result<PaymentReceipt, ApiError> = .failure(.unknown(status: 0, code: nil))
    private(set) var receiptCalls: [UUID] = []

    func alunoWallet() async throws -> Wallet {
        walletCalls += 1
        return try walletResult.get()
    }

    func payCharge(
        chargeId: UUID,
        method: PaymentMethod,
        recurrence: Bool,
        card: CardDetails?
    ) async throws -> PaymentCreated {
        payCalls.append((chargeId, method, recurrence, card))
        return try payResult.get()
    }

    func cancelMandate() async throws {
        cancelMandateCalls += 1
        try cancelMandateResult.get()
    }

    func guardianPayments() async throws -> GuardianPayments {
        guardianPaymentsCalls += 1
        return try guardianPaymentsResult.get()
    }

    func payDependentCharge(
        chargeId: UUID,
        method: PaymentMethod,
        recurrence: Bool,
        card: CardDetails?
    ) async throws -> PaymentCreated {
        payDependentCalls.append((chargeId, method, recurrence, card))
        return try payDependentResult.get()
    }

    func simulatePayment(paymentId: UUID) async throws -> SimulatedSettlement {
        simulateCalls.append(paymentId)
        return try simulateResult.get()
    }

    func receipt(paymentId: UUID) async throws -> PaymentReceipt {
        receiptCalls.append(paymentId)
        return try receiptResult.get()
    }
}

// MARK: - Fixtures

enum BillingFixtures {
    static let studentId = UUID(uuidString: "0198a7b0-0000-7000-8000-0000000000d1")!
    static let planId = UUID(uuidString: "0198a7b0-0000-7000-8000-0000000000d2")!
    static let chargeId = UUID(uuidString: "0198a7b0-0000-7000-8000-0000000000d3")!
    static let paymentId = UUID(uuidString: "0198a7b0-0000-7000-8000-0000000000d4")!
    static let dependentId = UUID(uuidString: "0198a7b0-0000-7000-8000-0000000000d5")!

    static func plan(name: String = "Mensal", amountCents: Int = 18000) -> AcademyPlan {
        AcademyPlan(
            id: planId,
            name: name,
            amountCents: amountCents,
            currency: "BRL",
            recurrence: .monthly,
            dueDay: 10,
            isActive: true
        )
    }

    static func payment(
        id: UUID = paymentId,
        method: PaymentMethod = .pix,
        status: PaymentStatus = .pending,
        provider: PaymentProvider = .simulated,
        providerData: PaymentProviderData? = PaymentProviderData(
            qrPayload: "TATAME-SIM-PIX-QR",
            copiaECola: "TATAME-SIM-PIX-COPIA"
        ),
        paidAt: Date? = nil
    ) -> Payment {
        Payment(
            id: id,
            chargeId: chargeId,
            method: method,
            status: status,
            amountCents: 18000,
            currency: "BRL",
            provider: provider,
            providerData: providerData,
            paidAt: paidAt
        )
    }

    static func charge(
        status: ChargeStatus = .open,
        overdue: Bool = false,
        payments: [Payment] = []
    ) -> Charge {
        Charge(
            id: chargeId,
            studentId: studentId,
            status: status,
            overdue: overdue,
            amountCents: 18000,
            currency: "BRL",
            dueDate: "2026-08-10",
            periodStart: "2026-08-01",
            academyPlanId: planId,
            payments: payments
        )
    }

    static func wallet(
        plan: AcademyPlan? = plan(),
        currentCharge: Charge? = charge(),
        recurrenceActive: Bool = false,
        history: [WalletHistoryEntry] = []
    ) -> Wallet {
        Wallet(
            studentId: studentId,
            studentName: "Lucas Almeida",
            plan: plan,
            currentCharge: currentCharge,
            recurrence: WalletRecurrence(
                active: recurrenceActive,
                nextChargeDueDate: recurrenceActive ? "2026-09-01" : nil
            ),
            history: history
        )
    }

    static func settlement(method: PaymentMethod = .pix) -> SimulatedSettlement {
        SimulatedSettlement(
            payment: payment(method: method, status: .succeeded, paidAt: Date()),
            charge: charge(status: .paid, payments: [payment(method: method, status: .succeeded, paidAt: Date())])
        )
    }

    static func guardianPayments(
        pedroCharge: Charge? = charge(),
        recurrenceActive: Bool = false
    ) -> GuardianPayments {
        GuardianPayments(
            dependents: [
                DependentCharges(
                    studentId: dependentId,
                    fullName: "Pedro Silveira",
                    plan: plan(name: "Kids", amountCents: 15000),
                    currentCharge: pedroCharge,
                    recurrenceActive: recurrenceActive
                )
            ],
            history: [
                WalletHistoryEntry(
                    studentId: dependentId,
                    chargeId: UUID(),
                    periodStart: "2026-07-01",
                    amountCents: 15000,
                    currency: "BRL",
                    chargeStatus: .paid,
                    paymentId: UUID(),
                    method: .pix,
                    paidAt: Date(),
                    studentName: "Pedro Silveira"
                )
            ]
        )
    }
}

// MARK: - AlunoCarteiraModel (BIL.22)

@MainActor
@Suite("AlunoCarteiraModel")
struct AlunoCarteiraModelTests {
    @Test("load maps the wallet payload; reload keeps content visible")
    func loadSuccess() async {
        let repository = FakeBillingRepository()
        repository.walletResult = .success(BillingFixtures.wallet())
        let model = AlunoCarteiraModel(repository: repository)

        await model.load()

        #expect(model.wallet?.plan?.name == "Mensal")
        #expect(model.wallet?.currentCharge?.isOpen == true)
        #expect(repository.walletCalls == 1)

        await model.load()
        #expect(repository.walletCalls == 2)
        if case .loaded = model.phase {} else {
            Issue.record("expected loaded phase")
        }
    }

    @Test("load failure surfaces PT-BR copy")
    func loadFailure() async {
        let repository = FakeBillingRepository()
        repository.walletResult = .failure(.network(.notConnectedToInternet))
        let model = AlunoCarteiraModel(repository: repository)

        await model.load()

        #expect(model.phase == .failed(message: BillingMessages.offline))
    }

    @Test("no-plan wallet is the clean empty state (story 8)")
    func emptyState() async {
        let repository = FakeBillingRepository()
        repository.walletResult = .success(
            BillingFixtures.wallet(plan: nil, currentCharge: nil)
        )
        let model = AlunoCarteiraModel(repository: repository)

        await model.load()

        let wallet = model.wallet
        #expect(wallet?.plan == nil)
        #expect(wallet?.currentCharge == nil)
        #expect(wallet?.history.isEmpty == true)
    }

    @Test("flowModel exists only over an open charge")
    func flowModelGating() async {
        let repository = FakeBillingRepository()
        repository.walletResult = .success(BillingFixtures.wallet())
        let model = AlunoCarteiraModel(repository: repository)
        await model.load()

        #expect(model.flowModel(method: .pix) != nil)

        repository.walletResult = .success(
            BillingFixtures.wallet(currentCharge: BillingFixtures.charge(status: .paid))
        )
        await model.load()
        #expect(model.flowModel(method: .pix) == nil)

        repository.walletResult = .success(BillingFixtures.wallet(currentCharge: nil))
        await model.load()
        #expect(model.flowModel(method: .boleto) == nil)
    }

    @Test("paymentSettled refreshes the wallet (card flips to Paga, story 15)")
    func settledRefresh() async {
        let repository = FakeBillingRepository()
        repository.walletResult = .success(BillingFixtures.wallet())
        let model = AlunoCarteiraModel(repository: repository)
        await model.load()

        let paid = BillingFixtures.payment(method: .pix, status: .succeeded, paidAt: Date())
        repository.walletResult = .success(
            BillingFixtures.wallet(currentCharge: BillingFixtures.charge(status: .paid, payments: [paid]))
        )
        await model.paymentSettled()

        #expect(model.wallet?.currentCharge?.isPaid == true)
        #expect(model.wallet?.currentCharge?.settledPayment == paid)
        #expect(repository.walletCalls == 2)
    }

    @Test("cancelRecurrence cancels the mandate and reloads (story 14)")
    func cancelRecurrence() async {
        let repository = FakeBillingRepository()
        repository.walletResult = .success(BillingFixtures.wallet(recurrenceActive: true))
        let model = AlunoCarteiraModel(repository: repository)
        await model.load()
        #expect(model.wallet?.recurrence.active == true)

        repository.walletResult = .success(BillingFixtures.wallet(recurrenceActive: false))
        await model.cancelRecurrence()

        #expect(repository.cancelMandateCalls == 1)
        #expect(model.wallet?.recurrence.active == false)
        #expect(model.actionError == nil)
    }

    @Test("cancelRecurrence failure surfaces an inline error, wallet untouched")
    func cancelRecurrenceFailure() async {
        let repository = FakeBillingRepository()
        repository.walletResult = .success(BillingFixtures.wallet(recurrenceActive: true))
        repository.cancelMandateResult = .failure(.forbidden(code: ApiErrorCode.tenantReadOnly))
        let model = AlunoCarteiraModel(repository: repository)
        await model.load()

        await model.cancelRecurrence()

        #expect(model.actionError == BillingMessages.readOnly)
        #expect(model.wallet?.recurrence.active == true)
        #expect(repository.walletCalls == 1)
    }
}

// MARK: - PaymentFlowModel (BIL.23)

@MainActor
@Suite("PaymentFlowModel")
struct PaymentFlowModelTests {
    private func pixFlow(
        repository: FakeBillingRepository,
        payer: PaymentFlowModel.Payer = .aluno,
        method: PaymentMethod = .pix,
        onSettled: @escaping @MainActor () -> Void = {}
    ) -> PaymentFlowModel {
        PaymentFlowModel(
            charge: BillingFixtures.charge(),
            method: method,
            payer: payer,
            repository: repository,
            onSettled: onSettled
        )
    }

    @Test("pix: start creates the pending payment on the aluno route")
    func pixStart() async {
        let repository = FakeBillingRepository()
        repository.payResult = .success(PaymentCreated(
            payment: BillingFixtures.payment(),
            charge: BillingFixtures.charge(),
            mandateCreated: false
        ))
        let model = pixFlow(repository: repository)

        await model.start()

        #expect(repository.payCalls.count == 1)
        #expect(repository.payCalls[0].chargeId == BillingFixtures.chargeId)
        #expect(repository.payCalls[0].method == .pix)
        #expect(!repository.payCalls[0].recurrence)
        #expect(repository.payCalls[0].card == nil)
        #expect(model.payment?.providerData?.qrPayload == "TATAME-SIM-PIX-QR")
        #expect(model.canSimulate)
    }

    @Test("pix: simulate settles the charge and notifies for the wallet refresh")
    func pixSimulate() async {
        let repository = FakeBillingRepository()
        repository.payResult = .success(PaymentCreated(
            payment: BillingFixtures.payment(),
            charge: BillingFixtures.charge(),
            mandateCreated: false
        ))
        repository.simulateResult = .success(BillingFixtures.settlement())
        var settled = false
        let model = pixFlow(repository: repository) { settled = true }

        await model.start()
        await model.simulate()

        #expect(repository.simulateCalls == [BillingFixtures.paymentId])
        if case .success(let payment, let mandateCreated) = model.phase {
            #expect(payment.status == .succeeded)
            #expect(!mandateCreated)
        } else {
            Issue.record("expected success phase")
        }
        #expect(settled)
    }

    @Test("simulate button gating: non-simulated provider hides it and simulate no-ops (story 44)")
    func simulateGating() async {
        let repository = FakeBillingRepository()
        repository.payResult = .success(PaymentCreated(
            payment: BillingFixtures.payment(provider: .stripe, providerData: nil),
            charge: BillingFixtures.charge(),
            mandateCreated: false
        ))
        let model = pixFlow(repository: repository)

        await model.start()
        #expect(!model.canSimulate)

        await model.simulate()
        #expect(repository.simulateCalls.isEmpty)
        if case .ready = model.phase {} else {
            Issue.record("expected phase to stay ready")
        }
    }

    @Test("boleto: start renders linha digitável; simulate compensates")
    func boletoFlow() async {
        let repository = FakeBillingRepository()
        let boletoData = PaymentProviderData(
            linhaDigitavel: "34191.79001 01043.510047 91020.150008 6 94850000018000",
            barcodePayload: "TATAME-SIM-BOLETO-BARCODE"
        )
        repository.payResult = .success(PaymentCreated(
            payment: BillingFixtures.payment(method: .boleto, providerData: boletoData),
            charge: BillingFixtures.charge(),
            mandateCreated: false
        ))
        repository.simulateResult = .success(BillingFixtures.settlement(method: .boleto))
        let model = pixFlow(repository: repository, method: .boleto)

        await model.start()
        #expect(repository.payCalls[0].method == .boleto)
        #expect(model.payment?.providerData?.linhaDigitavel?.hasPrefix("34191") == true)
        #expect(model.canSimulate)

        await model.simulate()
        if case .success(let payment, _) = model.phase {
            #expect(payment.method == .boleto)
        } else {
            Issue.record("expected success phase")
        }
    }

    @Test("copy actions push the payload to the pasteboard and confirm")
    func copyActions() async {
        let repository = FakeBillingRepository()
        repository.payResult = .success(PaymentCreated(
            payment: BillingFixtures.payment(),
            charge: BillingFixtures.charge(),
            mandateCreated: false
        ))
        let model = pixFlow(repository: repository)
        await model.start()

        model.copyPixCode()
        #expect(model.copyConfirmation == BillingMessages.pixCopied)
    }

    @Test("cartão: form gates the button; pay sends holder + derived last4 + toggle, settles inline")
    func cardFlow() async {
        let repository = FakeBillingRepository()
        let settledCard = BillingFixtures.payment(
            method: .card,
            status: .succeeded,
            providerData: nil,
            paidAt: Date()
        )
        repository.payResult = .success(PaymentCreated(
            payment: settledCard,
            charge: BillingFixtures.charge(status: .paid, payments: [settledCard]),
            mandateCreated: true
        ))
        var settled = false
        let model = pixFlow(repository: repository, method: .card) { settled = true }

        #expect(!model.canPayCard)
        model.cardNumber = "4242 4242 4242 4242"
        model.cardHolder = "LUCAS ALMEIDA"
        model.cardValidity = "12/28"
        model.cardCVV = "123"
        model.recurrenceToggle = true
        #expect(model.canPayCard)

        await model.payCard()

        #expect(repository.payCalls.count == 1)
        #expect(repository.payCalls[0].method == .card)
        #expect(repository.payCalls[0].recurrence)
        #expect(repository.payCalls[0].card?.holderName == "LUCAS ALMEIDA")
        // The PAN never leaves the sheet — only the derived last4.
        #expect(repository.payCalls[0].card?.last4 == "4242")
        if case .success(let payment, let mandateCreated) = model.phase {
            #expect(payment.status == .succeeded)
            #expect(mandateCreated)
        } else {
            Issue.record("expected success phase")
        }
        #expect(settled)
    }

    @Test("cartão: recurrence mismatch code maps to PT-BR copy and retry returns to the form")
    func cardFailureRetry() async {
        let repository = FakeBillingRepository()
        repository.payResult = .failure(.conflict(code: ApiErrorCode.billingMethodMandateMismatch))
        let model = pixFlow(repository: repository, method: .card)
        model.cardNumber = "4242 4242 4242 4242"
        model.cardHolder = "LUCAS ALMEIDA"
        model.cardValidity = "12/28"
        model.cardCVV = "123"

        await model.payCard()
        #expect(model.phase == .failed(message: BillingMessages.methodMandateMismatch))

        await model.retry()
        #expect(model.phase == .idle)
        #expect(model.canPayCard)
    }

    @Test("pix creation failure surfaces charge-not-payable copy; retry re-creates")
    func pixFailureRetry() async {
        let repository = FakeBillingRepository()
        repository.payResult = .failure(.conflict(code: ApiErrorCode.billingChargeNotPayable))
        let model = pixFlow(repository: repository)

        await model.start()
        #expect(model.phase == .failed(message: BillingMessages.chargeNotPayable))

        repository.payResult = .success(PaymentCreated(
            payment: BillingFixtures.payment(),
            charge: BillingFixtures.charge(),
            mandateCreated: false
        ))
        await model.retry()
        #expect(model.canSimulate)
        #expect(repository.payCalls.count == 2)
    }

    @Test("responsável payer routes through the dependent endpoint (story 18)")
    func responsavelRoute() async {
        let repository = FakeBillingRepository()
        repository.payDependentResult = .success(PaymentCreated(
            payment: BillingFixtures.payment(),
            charge: BillingFixtures.charge(),
            mandateCreated: false
        ))
        let model = pixFlow(repository: repository, payer: .responsavel)

        await model.start()

        #expect(repository.payCalls.isEmpty)
        #expect(repository.payDependentCalls.count == 1)
        #expect(repository.payDependentCalls[0].method == .pix)
        #expect(model.canSimulate)
    }
}

// MARK: - ResponsavelPagamentosModel (BIL.24)

@MainActor
@Suite("ResponsavelPagamentosModel")
struct ResponsavelPagamentosModelTests {
    @Test("load maps dependents and the consolidated histórico")
    func loadSuccess() async {
        let repository = FakeBillingRepository()
        repository.guardianPaymentsResult = .success(BillingFixtures.guardianPayments())
        let model = ResponsavelPagamentosModel(repository: repository)

        await model.load()

        #expect(model.payments?.dependents.count == 1)
        #expect(model.payments?.dependents[0].fullName == "Pedro Silveira")
        #expect(model.payments?.history.count == 1)
        #expect(model.payments?.history[0].studentName == "Pedro Silveira")
    }

    @Test("load failure surfaces PT-BR copy")
    func loadFailure() async {
        let repository = FakeBillingRepository()
        repository.guardianPaymentsResult = .failure(.network(.timedOut))
        let model = ResponsavelPagamentosModel(repository: repository)

        await model.load()

        #expect(model.phase == .failed(message: BillingMessages.offline))
    }

    @Test("pixFlowModel targets the dependent's open charge; paid charge yields none")
    func pixFlowSelection() async {
        let repository = FakeBillingRepository()
        repository.guardianPaymentsResult = .success(BillingFixtures.guardianPayments())
        let model = ResponsavelPagamentosModel(repository: repository)
        await model.load()

        let flow = model.pixFlowModel(studentId: BillingFixtures.dependentId)
        #expect(flow?.charge.id == BillingFixtures.chargeId)
        #expect(flow?.method == .pix)
        #expect(flow?.payer == .responsavel)
        #expect(model.pixFlowModel(studentId: UUID()) == nil)

        repository.guardianPaymentsResult = .success(
            BillingFixtures.guardianPayments(
                pedroCharge: BillingFixtures.charge(status: .paid),
                recurrenceActive: true
            )
        )
        await model.load()
        #expect(model.pixFlowModel(studentId: BillingFixtures.dependentId) == nil)
        #expect(model.dependent(studentId: BillingFixtures.dependentId)?.recurrenceActive == true)
    }

    @Test("settled Pix refreshes the list (open card flips to Paga)")
    func settledRefresh() async {
        let repository = FakeBillingRepository()
        repository.guardianPaymentsResult = .success(BillingFixtures.guardianPayments())
        let model = ResponsavelPagamentosModel(repository: repository)
        await model.load()

        let paid = BillingFixtures.payment(method: .pix, status: .succeeded, paidAt: Date())
        repository.guardianPaymentsResult = .success(
            BillingFixtures.guardianPayments(
                pedroCharge: BillingFixtures.charge(status: .paid, payments: [paid])
            )
        )
        await model.paymentSettled()

        #expect(model.payments?.dependents[0].currentCharge?.isPaid == true)
        #expect(repository.guardianPaymentsCalls == 2)
    }
}

// MARK: - ComprovanteModel (stories 5, 19)

@MainActor
@Suite("ComprovanteModel")
struct ComprovanteModelTests {
    @Test("load fetches the receipt payload by payment id")
    func loadReceipt() async {
        let repository = FakeBillingRepository()
        let settled = BillingFixtures.payment(status: .succeeded, paidAt: Date())
        repository.receiptResult = .success(PaymentReceipt(
            payment: settled,
            charge: BillingFixtures.charge(status: .paid),
            studentName: "Lucas Almeida",
            planName: "Mensal",
            academyName: "Horizonte BJJ"
        ))
        let model = ComprovanteModel(paymentId: BillingFixtures.paymentId, repository: repository)

        await model.load()

        #expect(repository.receiptCalls == [BillingFixtures.paymentId])
        if case .loaded(let receipt) = model.phase {
            #expect(receipt.studentName == "Lucas Almeida")
            #expect(receipt.academyName == "Horizonte BJJ")
        } else {
            Issue.record("expected loaded phase")
        }
    }

    @Test("missing receipt surfaces the 404 copy")
    func receiptNotFound() async {
        let repository = FakeBillingRepository()
        repository.receiptResult = .failure(.notFound(code: ApiErrorCode.notFound))
        let model = ComprovanteModel(paymentId: BillingFixtures.paymentId, repository: repository)

        await model.load()

        #expect(model.phase == .failed(message: "Comprovante não encontrado."))
    }
}

// MARK: - BillingMessages (stable-code mapping)

@Suite("BillingMessages")
struct BillingMessagesTests {
    @Test("billing.* codes map to PT-BR copy; unknown codes fall back")
    func codeMapping() {
        #expect(
            BillingMessages.message(for: .conflict(code: ApiErrorCode.billingChargeNotPayable))
                == BillingMessages.chargeNotPayable
        )
        #expect(
            BillingMessages.message(for: .conflict(code: ApiErrorCode.billingMethodMandateMismatch))
                == BillingMessages.methodMandateMismatch
        )
        #expect(
            BillingMessages.message(for: .conflict(code: ApiErrorCode.billingMandateAlreadyActive))
                == BillingMessages.mandateAlreadyActive
        )
        #expect(
            BillingMessages.message(for: .conflict(code: ApiErrorCode.billingSimulateUnavailable))
                == BillingMessages.simulateUnavailable
        )
        #expect(
            BillingMessages.message(for: .notFound(code: ApiErrorCode.billingSimulateUnavailable))
                == BillingMessages.simulateUnavailable
        )
        #expect(
            BillingMessages.message(for: .forbidden(code: ApiErrorCode.tenantReadOnly))
                == BillingMessages.readOnly
        )
        #expect(
            BillingMessages.message(for: .notFound(code: ApiErrorCode.notFound), notFound: "Custom.")
                == "Custom."
        )
        #expect(
            BillingMessages.message(for: .network(.notConnectedToInternet)) == BillingMessages.offline
        )
        #expect(
            BillingMessages.message(for: .server(status: 500, code: nil)) == BillingMessages.generic
        )
    }
}
