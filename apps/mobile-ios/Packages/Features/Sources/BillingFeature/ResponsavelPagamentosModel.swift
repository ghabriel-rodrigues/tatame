// Responsável Pagamentos model (spec 006, BIL.24 — stories 17-21): GET
// /responsavel/payments (per-dependent current charges + consolidated
// histórico; the fetch materializes server-side), Pix per dependent, and the
// comprovante for settled charges.

import Foundation
import Observation
import TatameCore

@MainActor
@Observable
public final class ResponsavelPagamentosModel {
    public enum Phase: Equatable, Sendable {
        case idle
        case loading
        case loaded(GuardianPayments)
        case failed(message: String)
    }

    public enum ActiveSheet: Identifiable, Equatable, Sendable {
        /// Pix sheet addressed to one dependent's charge (story 18).
        case pix(studentId: UUID)
        case comprovante(paymentId: UUID)

        public var id: String {
            switch self {
            case .pix(let studentId): "pix-\(studentId.uuidString)"
            case .comprovante(let paymentId): "comprovante-\(paymentId.uuidString)"
            }
        }
    }

    public private(set) var phase: Phase = .idle
    public var activeSheet: ActiveSheet?

    @ObservationIgnored private let repository: any BillingRepository

    public init(repository: any BillingRepository) {
        self.repository = repository
    }

    public var payments: GuardianPayments? {
        if case .loaded(let payments) = phase { return payments }
        return nil
    }

    public func load() async {
        if case .loaded = phase {} else {
            phase = .loading
        }
        do {
            phase = .loaded(try await repository.guardianPayments())
        } catch let error as ApiError {
            phase = .failed(message: BillingMessages.message(for: error, notFound: BillingMessages.loadFailed))
        } catch {
            phase = .failed(message: BillingMessages.generic)
        }
    }

    public func paymentSettled() async {
        await load()
    }

    /// Pix flow over one dependent's open charge (story 18).
    public func pixFlowModel(studentId: UUID) -> PaymentFlowModel? {
        guard
            let dependent = payments?.dependents.first(where: { $0.studentId == studentId }),
            let charge = dependent.currentCharge, charge.isOpen
        else { return nil }
        return PaymentFlowModel(
            charge: charge,
            method: .pix,
            payer: .responsavel,
            repository: repository,
            onSettled: { [weak self] in
                Task { await self?.paymentSettled() }
            }
        )
    }

    /// The dependent a Pix sheet is addressed to ("Mensalidade de agosto ·
    /// Pedro Silveira").
    public func dependent(studentId: UUID) -> DependentCharges? {
        payments?.dependents.first { $0.studentId == studentId }
    }

    public func comprovanteModel(paymentId: UUID) -> ComprovanteModel {
        ComprovanteModel(paymentId: paymentId, repository: repository)
    }
}
