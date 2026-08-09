// Generated `Components.Schemas.*` → TatameCore billing models (spec 006;
// same convention as AttendanceMapping: features never see generated types).

import Foundation
import OpenAPIRuntime
import TatameCore

private func uuid(_ raw: String, _ what: String) throws -> UUID {
    guard let id = UUID(uuidString: raw) else {
        throw ApiError.decoding(description: "invalid \(what): \(raw)")
    }
    return id
}

extension AcademyPlan {
    init(dto: Components.Schemas.PlanDto) throws {
        self.init(
            id: try uuid(dto.id, "plan id"),
            name: dto.name,
            amountCents: Int(dto.amountCents),
            currency: dto.currency,
            recurrence: BillingRecurrence(rawValue: dto.recurrence.rawValue) ?? .monthly,
            dueDay: Int(dto.dueDay),
            isActive: dto.isActive
        )
    }
}

extension PaymentProviderData {
    /// `provider_data` is free-form jsonb on the wire; only the render keys
    /// the sheets consume are surfaced (Pix QR/copia-e-cola, boleto linha
    /// digitável/barcode).
    init?(container: OpenAPIRuntime.OpenAPIObjectContainer?) {
        guard let value = container?.value else { return nil }
        self.init(
            qrPayload: value["qrPayload"] as? String,
            copiaECola: value["copiaECola"] as? String,
            linhaDigitavel: value["linhaDigitavel"] as? String,
            barcodePayload: value["barcodePayload"] as? String
        )
    }
}

extension Payment {
    init(dto: Components.Schemas.PaymentDto) throws {
        self.init(
            id: try uuid(dto.id, "payment id"),
            chargeId: try uuid(dto.chargeId, "charge id"),
            method: PaymentMethod(rawValue: dto.method.rawValue) ?? .pix,
            status: PaymentStatus(rawValue: dto.status.rawValue) ?? .pending,
            amountCents: Int(dto.amountCents),
            currency: dto.currency,
            provider: PaymentProvider(rawValue: dto.provider.rawValue) ?? .simulated,
            providerData: PaymentProviderData(container: dto.providerData),
            paidAt: dto.paidAt,
            receiptUrl: dto.receiptUrl
        )
    }
}

extension Charge {
    init(dto: Components.Schemas.ChargeWithPaymentsDto) throws {
        self.init(
            id: try uuid(dto.id, "charge id"),
            studentId: try uuid(dto.studentId, "student id"),
            guardianId: try dto.guardianId.map { try uuid($0, "guardian id") },
            status: ChargeStatus(rawValue: dto.status.rawValue) ?? .open,
            overdue: dto.overdue,
            amountCents: Int(dto.amountCents),
            currency: dto.currency,
            dueDate: dto.dueDate,
            periodStart: dto.periodStart,
            periodEnd: dto.periodEnd,
            academyPlanId: try dto.academyPlanId.map { try uuid($0, "plan id") },
            payments: try dto.payments.map(Payment.init(dto:))
        )
    }

    init(dto: Components.Schemas.ChargeDto) throws {
        self.init(
            id: try uuid(dto.id, "charge id"),
            studentId: try uuid(dto.studentId, "student id"),
            guardianId: try dto.guardianId.map { try uuid($0, "guardian id") },
            status: ChargeStatus(rawValue: dto.status.rawValue) ?? .open,
            overdue: dto.overdue,
            amountCents: Int(dto.amountCents),
            currency: dto.currency,
            dueDate: dto.dueDate,
            periodStart: dto.periodStart,
            periodEnd: dto.periodEnd,
            academyPlanId: try dto.academyPlanId.map { try uuid($0, "plan id") },
            payments: []
        )
    }
}

extension WalletRecurrence {
    init(dto: Components.Schemas.WalletRecurrenceDto) {
        self.init(active: dto.active, nextChargeDueDate: dto.nextChargeDueDate)
    }
}

extension WalletHistoryEntry {
    init(dto: Components.Schemas.HistoryEntryDto) throws {
        self.init(
            studentId: try uuid(dto.studentId, "student id"),
            chargeId: try uuid(dto.chargeId, "charge id"),
            periodStart: dto.periodStart,
            amountCents: Int(dto.amountCents),
            currency: dto.currency,
            chargeStatus: ChargeStatus(rawValue: dto.chargeStatus.rawValue) ?? .paid,
            paymentId: try uuid(dto.paymentId, "payment id"),
            method: PaymentMethod(rawValue: dto.method.rawValue) ?? .pix,
            paidAt: dto.paidAt,
            receiptUrl: dto.receiptUrl,
            studentName: nil
        )
    }

    init(dto: Components.Schemas.GuardianHistoryEntryDto) throws {
        self.init(
            studentId: try uuid(dto.studentId, "student id"),
            chargeId: try uuid(dto.chargeId, "charge id"),
            periodStart: dto.periodStart,
            amountCents: Int(dto.amountCents),
            currency: dto.currency,
            chargeStatus: ChargeStatus(rawValue: dto.chargeStatus.rawValue) ?? .paid,
            paymentId: try uuid(dto.paymentId, "payment id"),
            method: PaymentMethod(rawValue: dto.method.rawValue) ?? .pix,
            paidAt: dto.paidAt,
            receiptUrl: dto.receiptUrl,
            studentName: dto.studentName
        )
    }
}

extension Wallet {
    init(dto: Components.Schemas.WalletResponseDto) throws {
        self.init(
            studentId: try uuid(dto.student.id, "student id"),
            studentName: dto.student.fullName,
            plan: try dto.plan.map { try AcademyPlan(dto: $0.value1) },
            currentCharge: try dto.currentCharge.map { try Charge(dto: $0.value1) },
            recurrence: WalletRecurrence(dto: dto.recurrence),
            history: try dto.history.map(WalletHistoryEntry.init(dto:))
        )
    }
}

extension PaymentCreated {
    init(dto: Components.Schemas.PaymentCreatedResponseDto) throws {
        self.init(
            payment: try Payment(dto: dto.payment),
            charge: try Charge(dto: dto.charge),
            mandateCreated: dto.mandateCreated
        )
    }
}

extension SimulatedSettlement {
    init(dto: Components.Schemas.SimulatePaymentResponseDto) throws {
        self.init(
            payment: try Payment(dto: dto.payment),
            charge: try Charge(dto: dto.charge)
        )
    }
}

extension PaymentReceipt {
    init(dto: Components.Schemas.ReceiptResponseDto) throws {
        self.init(
            payment: try Payment(dto: dto.payment),
            charge: try Charge(dto: dto.charge),
            studentName: dto.studentName,
            planName: dto.planName,
            academyName: dto.academyName
        )
    }
}

extension DependentCharges {
    init(dto: Components.Schemas.DependentPaymentsDto) throws {
        self.init(
            studentId: try uuid(dto.studentId, "student id"),
            fullName: dto.fullName,
            plan: try dto.plan.map { try AcademyPlan(dto: $0.value1) },
            currentCharge: try dto.currentCharge.map { try Charge(dto: $0.value1) },
            recurrenceActive: dto.recurrenceActive
        )
    }
}

extension GuardianPayments {
    init(dto: Components.Schemas.GuardianPaymentsResponseDto) throws {
        self.init(
            dependents: try dto.dependents.map(DependentCharges.init(dto:)),
            history: try dto.history.map(WalletHistoryEntry.init(dto:))
        )
    }
}

extension MensalidadeAlert {
    init(dto: Components.Schemas.MensalidadeAlertDto) throws {
        self.init(
            chargeId: try uuid(dto.chargeId, "charge id"),
            amountCents: Int(dto.amountCents),
            currency: dto.currency,
            dueDate: dto.dueDate,
            overdue: dto.overdue,
            periodStart: dto.periodStart
        )
    }
}
