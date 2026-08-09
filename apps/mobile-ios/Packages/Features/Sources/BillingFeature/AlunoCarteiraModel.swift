// Aluno Carteira model (spec 006, BIL.22 — stories 1-8, 14): GET
// /aluno/wallet (the fetch itself materializes the current cycle server-
// side), the three payment sheets, the comprovante, and the card-recurrence
// cancel (story 14).

import Foundation
import Observation
import TatameCore

@MainActor
@Observable
public final class AlunoCarteiraModel {
    public enum Phase: Equatable, Sendable {
        case idle
        case loading
        case loaded(Wallet)
        case failed(message: String)
    }

    /// Which sheet is up (payment method sheets + comprovante).
    public enum ActiveSheet: Identifiable, Equatable, Sendable {
        case pay(PaymentMethod)
        case comprovante(paymentId: UUID)

        public var id: String {
            switch self {
            case .pay(let method): "pay-\(method.rawValue)"
            case .comprovante(let paymentId): "comprovante-\(paymentId.uuidString)"
            }
        }
    }

    public private(set) var phase: Phase = .idle
    public var activeSheet: ActiveSheet?
    /// Inline error for the cancel-recurrence action.
    public private(set) var actionError: String?
    public private(set) var cancelingRecurrence = false

    @ObservationIgnored private let repository: any BillingRepository

    public init(repository: any BillingRepository) {
        self.repository = repository
    }

    public var wallet: Wallet? {
        if case .loaded(let wallet) = phase { return wallet }
        return nil
    }

    public func load() async {
        if case .loaded = phase {} else {
            phase = .loading
        }
        do {
            phase = .loaded(try await repository.alunoWallet())
        } catch let error as ApiError {
            phase = .failed(message: BillingMessages.message(for: error, notFound: BillingMessages.loadFailed))
        } catch {
            phase = .failed(message: BillingMessages.generic)
        }
    }

    /// Called by a settled payment sheet — refreshes the wallet so the card
    /// flips to Paga and the histórico gains the row (story 15).
    public func paymentSettled() async {
        await load()
    }

    /// Story 14: cancel the card recurrence from the Carteira banner.
    public func cancelRecurrence() async {
        guard !cancelingRecurrence else { return }
        cancelingRecurrence = true
        actionError = nil
        defer { cancelingRecurrence = false }
        do {
            try await repository.cancelMandate()
            await load()
        } catch let error as ApiError {
            actionError = BillingMessages.message(for: error, notFound: BillingMessages.generic)
        } catch {
            actionError = BillingMessages.generic
        }
    }

    /// Builds the flow model for a payment sheet over the current charge.
    public func flowModel(method: PaymentMethod) -> PaymentFlowModel? {
        guard let charge = wallet?.currentCharge, charge.isOpen else { return nil }
        return PaymentFlowModel(
            charge: charge,
            method: method,
            payer: .aluno,
            repository: repository,
            onSettled: { [weak self] in
                Task { await self?.paymentSettled() }
            }
        )
    }

    public func comprovanteModel(paymentId: UUID) -> ComprovanteModel {
        ComprovanteModel(paymentId: paymentId, repository: repository)
    }
}
