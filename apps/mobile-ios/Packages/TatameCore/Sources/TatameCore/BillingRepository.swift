// Repository seam for the billing slice (spec 006, BIL.22-24). Same
// convention as AttendanceRepository: protocol in TatameCore, implementation
// in TatameAPI, features depend only on this protocol and throw `ApiError`.

import Foundation

public protocol BillingRepository: Sendable {
    // MARK: Aluno — Carteira

    /// GET /aluno/wallet — plan header, current-cycle charge (server-side
    /// materialization), recurrence banner, histórico. `plan == nil` is the
    /// clean empty state.
    func alunoWallet() async throws -> Wallet

    /// POST /aluno/wallet/charges/:id/payments — create a payment attempt.
    /// `recurrence` is the card-only mandate toggle (422
    /// billing.method_mandate_mismatch otherwise).
    func payCharge(
        chargeId: UUID,
        method: PaymentMethod,
        recurrence: Bool,
        card: CardDetails?
    ) async throws -> PaymentCreated

    /// DELETE /aluno/wallet/mandate — cancel card recurrence (404 when none
    /// active).
    func cancelMandate() async throws

    // MARK: Responsável — Pagamentos

    /// GET /responsavel/payments — per-dependent current charges +
    /// consolidated histórico (server-side materialization).
    func guardianPayments() async throws -> GuardianPayments

    /// POST /responsavel/payments/charges/:id/payments — pay a dependent's
    /// charge (guardian can pay only own dependents; foreign ids are 404).
    func payDependentCharge(
        chargeId: UUID,
        method: PaymentMethod,
        recurrence: Bool,
        card: CardDetails?
    ) async throws -> PaymentCreated

    // MARK: Shared billing routes

    /// POST /billing/payments/:id/simulate — instant simulated settlement
    /// (404 unless the simulated provider is configured, story 44).
    func simulatePayment(paymentId: UUID) async throws -> SimulatedSettlement

    /// GET /billing/payments/:id/receipt — the comprovante payload.
    func receipt(paymentId: UUID) async throws -> PaymentReceipt
}

/// Default used by environment entries / previews; every call traps.
public struct UnimplementedBillingRepository: BillingRepository {
    public init() {}

    public func alunoWallet() async throws -> Wallet {
        fatalError("BillingRepository not injected")
    }

    public func payCharge(
        chargeId _: UUID,
        method _: PaymentMethod,
        recurrence _: Bool,
        card _: CardDetails?
    ) async throws -> PaymentCreated {
        fatalError("BillingRepository not injected")
    }

    public func cancelMandate() async throws {
        fatalError("BillingRepository not injected")
    }

    public func guardianPayments() async throws -> GuardianPayments {
        fatalError("BillingRepository not injected")
    }

    public func payDependentCharge(
        chargeId _: UUID,
        method _: PaymentMethod,
        recurrence _: Bool,
        card _: CardDetails?
    ) async throws -> PaymentCreated {
        fatalError("BillingRepository not injected")
    }

    public func simulatePayment(paymentId _: UUID) async throws -> SimulatedSettlement {
        fatalError("BillingRepository not injected")
    }

    public func receipt(paymentId _: UUID) async throws -> PaymentReceipt {
        fatalError("BillingRepository not injected")
    }
}
