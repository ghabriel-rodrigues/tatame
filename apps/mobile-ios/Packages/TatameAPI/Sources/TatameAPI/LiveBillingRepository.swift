// LiveBillingRepository — the generated Client wrapped behind the TatameCore
// protocol (spec 006, BIL.22-24; same pattern as LiveGraduationRepository).
// Every error is normalized into ApiError; the stable billing codes
// (billing.charge_not_payable, billing.method_mandate_mismatch,
// billing.mandate_already_active, billing.simulate_unavailable) flow through
// the problem+json mapper untouched. Simulate 404 (provider gating, story
// 44) surfaces as .notFound — the sheets hide the button beforehand by
// checking payment.provider.

import Foundation
import TatameCore

struct LiveBillingRepository: BillingRepository {
    let client: Client

    // MARK: Aluno — Carteira

    func alunoWallet() async throws -> Wallet {
        try await ApiErrorMapper.run {
            let response = try await client.AlunoWalletController_getWallet_v1(.init())
            switch response {
            case .ok(let ok):
                return try Wallet(dto: try ok.body.json)
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }

    func payCharge(
        chargeId: UUID,
        method: PaymentMethod,
        recurrence: Bool,
        card: CardDetails?
    ) async throws -> PaymentCreated {
        try await ApiErrorMapper.run {
            let response = try await client.AlunoWalletController_pay_v1(
                .init(
                    path: .init(id: chargeId.uuidString.lowercased()),
                    body: .json(Self.payBody(method: method, recurrence: recurrence, card: card))
                )
            )
            switch response {
            case .created(let created):
                return try PaymentCreated(dto: try created.body.json)
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }

    func cancelMandate() async throws {
        try await ApiErrorMapper.run {
            let response = try await client.AlunoWalletController_cancelMandate_v1(.init())
            switch response {
            case .noContent:
                return
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }

    // MARK: Responsável — Pagamentos

    func guardianPayments() async throws -> GuardianPayments {
        try await ApiErrorMapper.run {
            let response = try await client.ResponsavelPaymentsController_list_v1(.init())
            switch response {
            case .ok(let ok):
                return try GuardianPayments(dto: try ok.body.json)
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }

    func payDependentCharge(
        chargeId: UUID,
        method: PaymentMethod,
        recurrence: Bool,
        card: CardDetails?
    ) async throws -> PaymentCreated {
        try await ApiErrorMapper.run {
            let response = try await client.ResponsavelPaymentsController_pay_v1(
                .init(
                    path: .init(id: chargeId.uuidString.lowercased()),
                    body: .json(Self.payBody(method: method, recurrence: recurrence, card: card))
                )
            )
            switch response {
            case .created(let created):
                return try PaymentCreated(dto: try created.body.json)
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }

    // MARK: Shared billing routes

    func simulatePayment(paymentId: UUID) async throws -> SimulatedSettlement {
        try await ApiErrorMapper.run {
            let response = try await client.BillingSharedController_simulate_v1(
                .init(path: .init(id: paymentId.uuidString.lowercased()))
            )
            switch response {
            case .ok(let ok):
                return try SimulatedSettlement(dto: try ok.body.json)
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }

    func receipt(paymentId: UUID) async throws -> PaymentReceipt {
        try await ApiErrorMapper.run {
            let response = try await client.BillingSharedController_receipt_v1(
                .init(path: .init(id: paymentId.uuidString.lowercased()))
            )
            switch response {
            case .ok(let ok):
                return try PaymentReceipt(dto: try ok.body.json)
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }

    // MARK: Body assembly

    private static func payBody(
        method: PaymentMethod,
        recurrence: Bool,
        card: CardDetails?
    ) -> Components.Schemas.CreateChargePaymentDto {
        let methodPayload: Components.Schemas.CreateChargePaymentDto.methodPayload =
            switch method {
            case .pix: .pix
            case .boleto: .boleto
            case .card: .card
            }
        return .init(
            method: methodPayload,
            // Only carried when toggled — the server treats absence as false
            // and rejects non-card recurrence with the stable 422 code.
            recurrence: recurrence ? true : nil,
            card: card.map { .init(holderName: $0.holderName, last4: $0.last4) }
        )
    }
}
