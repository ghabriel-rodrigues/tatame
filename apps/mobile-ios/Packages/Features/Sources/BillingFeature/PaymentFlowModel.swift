// Payment sheet flow model (spec 006, BIL.23 — stories 9-15, 18): one model
// drives the three sheets. Pix/boleto create the pending payment on open
// (the provider payload is what the sheet renders) and settle through the
// simulate endpoint; cartão settles inline on "Pagar" with the optional
// mandate toggle. "Simular pagamento" renders only when the created payment
// carries the simulated provider (story 44 gating).

import Foundation
import Observation
import TatameCore

@MainActor
@Observable
public final class PaymentFlowModel {
    /// Who is paying — picks the aluno or responsável endpoint.
    public enum Payer: Sendable, Equatable {
        case aluno
        case responsavel
    }

    public enum Phase: Equatable, Sendable {
        /// Card form (cartão) / not started yet (pix, boleto).
        case idle
        /// Pix/boleto payment being created on open.
        case creating
        /// Pending payment created — sheet renders the provider payload.
        case ready(Payment)
        /// Simulate (pix/boleto) or inline card charge in flight.
        case processing
        /// Settled — success pop; `mandateCreated` adds the recurrence line.
        case success(Payment, mandateCreated: Bool)
        case failed(message: String)
    }

    public let charge: Charge
    public let method: PaymentMethod
    public let payer: Payer

    public private(set) var phase: Phase = .idle
    /// Transient "Código Pix copiado." / "Linha digitável copiada." line.
    public private(set) var copyConfirmation: String?

    // Cartão display-metadata fields (display only — never sent as a PAN;
    // only holder name + client-derived last4 leave the sheet).
    public var cardNumber = ""
    public var cardHolder = ""
    public var cardValidity = ""
    public var cardCVV = ""
    /// "Usar este cartão na recorrência mensal" (story 12).
    public var recurrenceToggle = false

    @ObservationIgnored private let repository: any BillingRepository
    @ObservationIgnored private let onSettled: @MainActor () -> Void

    public init(
        charge: Charge,
        method: PaymentMethod,
        payer: Payer,
        repository: any BillingRepository,
        onSettled: @escaping @MainActor () -> Void = {}
    ) {
        self.charge = charge
        self.method = method
        self.payer = payer
        self.repository = repository
        self.onSettled = onSettled
    }

    /// The created pending payment, when any.
    public var payment: Payment? {
        switch phase {
        case .ready(let payment), .success(let payment, _): payment
        default: nil
        }
    }

    /// Story 44: the simulate button exists only on the simulated provider.
    public var canSimulate: Bool {
        if case .ready(let payment) = phase {
            return payment.provider == .simulated && payment.status == .pending
        }
        return false
    }

    /// Cartão form completeness (display metadata only).
    public var canPayCard: Bool {
        guard case .idle = phase else { return false }
        return !cardNumber.filter(\.isNumber).isEmpty
            && !cardHolder.trimmingCharacters(in: .whitespaces).isEmpty
            && !cardValidity.isEmpty
            && !cardCVV.isEmpty
    }

    // MARK: Pix / boleto — create on open, settle via simulate

    /// Creates the pending payment the sheet renders (pix QR / boleto linha).
    public func start() async {
        guard case .idle = phase, method != .card else { return }
        phase = .creating
        do {
            let created = try await pay(recurrence: false, card: nil)
            phase = .ready(created.payment)
        } catch let error as ApiError {
            phase = .failed(message: BillingMessages.message(for: error))
        } catch {
            phase = .failed(message: BillingMessages.generic)
        }
    }

    /// "Simular pagamento" / "Simular compensação" — instant settlement
    /// through the same normalized-event handler the webhook will use.
    public func simulate() async {
        guard case .ready(let payment) = phase, payment.provider == .simulated else { return }
        phase = .processing
        do {
            let settled = try await repository.simulatePayment(paymentId: payment.id)
            phase = .success(settled.payment, mandateCreated: false)
            onSettled()
        } catch let error as ApiError {
            phase = .failed(message: BillingMessages.message(for: error))
        } catch {
            phase = .failed(message: BillingMessages.generic)
        }
    }

    // MARK: Cartão — inline settle + mandate toggle

    /// "Pagar R$ …" — card charges settle inline on the simulated driver;
    /// the toggle creates the mandate in the same gesture (story 12).
    public func payCard() async {
        guard method == .card, canPayCard else { return }
        phase = .processing
        do {
            let created = try await pay(
                recurrence: recurrenceToggle,
                card: CardDetails(
                    holderName: cardHolder.trimmingCharacters(in: .whitespaces),
                    last4: BillingFormatters.cardLast4(fromNumber: cardNumber)
                )
            )
            phase = .success(created.payment, mandateCreated: created.mandateCreated)
            onSettled()
        } catch let error as ApiError {
            phase = .failed(message: BillingMessages.message(for: error))
        } catch {
            phase = .failed(message: BillingMessages.generic)
        }
    }

    /// Retry after a failure: cartão returns to the form, pix/boleto
    /// re-create the payment.
    public func retry() async {
        guard case .failed = phase else { return }
        phase = .idle
        if method != .card {
            await start()
        }
    }

    // MARK: Copy actions

    /// "Copiar código Pix" — copia-e-cola to the pasteboard + confirmation.
    public func copyPixCode() {
        guard let code = payment?.providerData?.copiaECola else { return }
        BillingPasteboard.copy(code)
        copyConfirmation = BillingMessages.pixCopied
    }

    /// "Copiar linha digitável".
    public func copyLinhaDigitavel() {
        guard let linha = payment?.providerData?.linhaDigitavel else { return }
        BillingPasteboard.copy(linha)
        copyConfirmation = BillingMessages.boletoCopied
    }

    private func pay(recurrence: Bool, card: CardDetails?) async throws -> PaymentCreated {
        switch payer {
        case .aluno:
            try await repository.payCharge(
                chargeId: charge.id,
                method: method,
                recurrence: recurrence,
                card: card
            )
        case .responsavel:
            try await repository.payDependentCharge(
                chargeId: charge.id,
                method: method,
                recurrence: recurrence,
                card: card
            )
        }
    }
}
