// Domain models for the billing slice (spec 006-billing, BIL.22-24).
// Mapped from the generated OpenAPI types inside TatameAPI — features only
// ever see these (ticket 02 convention). Amounts are integer cents
// everywhere (spec note); clients format R$ via BillingFormatters.

import Foundation

/// Shared contract enum — plan recurrence (the handoff recurrence chips).
public enum BillingRecurrence: String, Sendable {
    case monthly
    case quarterly
    case semiannual
    case yearly
}

/// Charge lifecycle (spec: `overdue` column is the lazy flip; the derived
/// `overdue` flag on the payload is truth).
public enum ChargeStatus: String, Sendable {
    case open
    case paid
    case overdue
    case canceled
    case refunded
}

public enum PaymentMethod: String, Sendable {
    case pix
    case boleto
    case card
}

public enum PaymentStatus: String, Sendable {
    case pending
    case succeeded
    case failed
    case refunded
}

/// v1 runtime provider is always `simulated`; `stripe` is the stage-2 swap.
/// Clients gate the "Simular pagamento" button on `.simulated` (story 44).
public enum PaymentProvider: String, Sendable {
    case simulated
    case stripe
}

/// The aluno's assigned mensalidade plan (wallet header).
public struct AcademyPlan: Sendable, Equatable {
    public let id: UUID
    public let name: String
    public let amountCents: Int
    public let currency: String
    public let recurrence: BillingRecurrence
    public let dueDay: Int
    public let isActive: Bool

    public init(
        id: UUID,
        name: String,
        amountCents: Int,
        currency: String,
        recurrence: BillingRecurrence,
        dueDay: Int,
        isActive: Bool
    ) {
        self.id = id
        self.name = name
        self.amountCents = amountCents
        self.currency = currency
        self.recurrence = recurrence
        self.dueDay = dueDay
        self.isActive = isActive
    }
}

/// Render-ready provider snapshot (`payments.provider_data`): Pix QR payload
/// + copia-e-cola, boleto linha digitável + barcode. Free-form jsonb on the
/// wire; only the known render keys are surfaced.
public struct PaymentProviderData: Sendable, Equatable {
    public let qrPayload: String?
    public let copiaECola: String?
    public let linhaDigitavel: String?
    public let barcodePayload: String?

    public init(
        qrPayload: String? = nil,
        copiaECola: String? = nil,
        linhaDigitavel: String? = nil,
        barcodePayload: String? = nil
    ) {
        self.qrPayload = qrPayload
        self.copiaECola = copiaECola
        self.linhaDigitavel = linhaDigitavel
        self.barcodePayload = barcodePayload
    }
}

/// One settlement attempt on a charge.
public struct Payment: Sendable, Equatable, Identifiable {
    public let id: UUID
    public let chargeId: UUID
    public let method: PaymentMethod
    public let status: PaymentStatus
    public let amountCents: Int
    public let currency: String
    public let provider: PaymentProvider
    public let providerData: PaymentProviderData?
    public let paidAt: Date?
    public let receiptUrl: String?

    public init(
        id: UUID,
        chargeId: UUID,
        method: PaymentMethod,
        status: PaymentStatus,
        amountCents: Int,
        currency: String,
        provider: PaymentProvider,
        providerData: PaymentProviderData? = nil,
        paidAt: Date? = nil,
        receiptUrl: String? = nil
    ) {
        self.id = id
        self.chargeId = chargeId
        self.method = method
        self.status = status
        self.amountCents = amountCents
        self.currency = currency
        self.provider = provider
        self.providerData = providerData
        self.paidAt = paidAt
        self.receiptUrl = receiptUrl
    }
}

/// One receivable (`charges` row). `overdue` is the derived truth flag —
/// never the lazily flipped status column (spec doctrine). `studentId` went
/// nullable with the spec-009 order-origin relaxation: professor order
/// charges have no student row.
public struct Charge: Sendable, Equatable, Identifiable {
    public let id: UUID
    public let studentId: UUID?
    public let guardianId: UUID?
    public let status: ChargeStatus
    public let overdue: Bool
    public let amountCents: Int
    public let currency: String
    /// ISO "yyyy-MM-dd".
    public let dueDate: String
    /// ISO "yyyy-MM-dd" — competência start (month-name source).
    public let periodStart: String?
    public let periodEnd: String?
    public let academyPlanId: UUID?
    /// Settlement attempts (present on wallet payloads; empty elsewhere).
    public let payments: [Payment]

    public init(
        id: UUID,
        studentId: UUID?,
        guardianId: UUID? = nil,
        status: ChargeStatus,
        overdue: Bool,
        amountCents: Int,
        currency: String,
        dueDate: String,
        periodStart: String? = nil,
        periodEnd: String? = nil,
        academyPlanId: UUID? = nil,
        payments: [Payment] = []
    ) {
        self.id = id
        self.studentId = studentId
        self.guardianId = guardianId
        self.status = status
        self.overdue = overdue
        self.amountCents = amountCents
        self.currency = currency
        self.dueDate = dueDate
        self.periodStart = periodStart
        self.periodEnd = periodEnd
        self.academyPlanId = academyPlanId
        self.payments = payments
    }

    /// "Em aberto" chip state: open or (lazily flipped) overdue.
    public var isOpen: Bool {
        status == .open || status == .overdue || overdue
    }

    /// "Paga" chip state (success treatment, story 15).
    public var isPaid: Bool {
        status == .paid
    }

    /// The settled payment backing "Ver comprovante" on a paid charge.
    public var settledPayment: Payment? {
        payments.last { $0.status == .succeeded }
    }
}

/// "Cobrança recorrente ativa" banner switch + next vencimento.
public struct WalletRecurrence: Sendable, Equatable {
    public let active: Bool
    /// ISO "yyyy-MM-dd" — "a próxima mensalidade chega em …".
    public let nextChargeDueDate: String?

    public init(active: Bool, nextChargeDueDate: String? = nil) {
        self.active = active
        self.nextChargeDueDate = nextChargeDueDate
    }
}

/// One settled row on the histórico (aluno and responsável consolidated).
public struct WalletHistoryEntry: Sendable, Equatable, Identifiable {
    public let studentId: UUID
    public let chargeId: UUID
    /// ISO "yyyy-MM-dd" — competência (month label source).
    public let periodStart: String?
    public let amountCents: Int
    public let currency: String
    public let chargeStatus: ChargeStatus
    public let paymentId: UUID
    public let method: PaymentMethod
    public let paidAt: Date?
    public let receiptUrl: String?
    /// Set on the responsável consolidated histórico ("Pedro · julho").
    public let studentName: String?

    public var id: UUID { paymentId }

    public init(
        studentId: UUID,
        chargeId: UUID,
        periodStart: String?,
        amountCents: Int,
        currency: String,
        chargeStatus: ChargeStatus,
        paymentId: UUID,
        method: PaymentMethod,
        paidAt: Date? = nil,
        receiptUrl: String? = nil,
        studentName: String? = nil
    ) {
        self.studentId = studentId
        self.chargeId = chargeId
        self.periodStart = periodStart
        self.amountCents = amountCents
        self.currency = currency
        self.chargeStatus = chargeStatus
        self.paymentId = paymentId
        self.method = method
        self.paidAt = paidAt
        self.receiptUrl = receiptUrl
        self.studentName = studentName
    }
}

/// GET /aluno/wallet payload. `plan == nil` → clean empty state (billing
/// never invents money, story 8).
public struct Wallet: Sendable, Equatable {
    public let studentId: UUID
    public let studentName: String
    public let plan: AcademyPlan?
    public let currentCharge: Charge?
    public let recurrence: WalletRecurrence
    public let history: [WalletHistoryEntry]

    public init(
        studentId: UUID,
        studentName: String,
        plan: AcademyPlan?,
        currentCharge: Charge?,
        recurrence: WalletRecurrence,
        history: [WalletHistoryEntry]
    ) {
        self.studentId = studentId
        self.studentName = studentName
        self.plan = plan
        self.currentCharge = currentCharge
        self.recurrence = recurrence
        self.history = history
    }
}

/// Card display metadata sent on a card payment (display only — never a PAN;
/// the client derives last4 before the number leaves the sheet).
public struct CardDetails: Sendable, Equatable {
    public let holderName: String?
    public let last4: String?

    public init(holderName: String? = nil, last4: String? = nil) {
        self.holderName = holderName
        self.last4 = last4
    }
}

/// POST …/charges/:id/payments result — `mandateCreated` is true when the
/// "Usar este cartão na recorrência mensal" toggle created the mandate.
public struct PaymentCreated: Sendable, Equatable {
    public let payment: Payment
    public let charge: Charge
    public let mandateCreated: Bool

    public init(payment: Payment, charge: Charge, mandateCreated: Bool) {
        self.payment = payment
        self.charge = charge
        self.mandateCreated = mandateCreated
    }
}

/// POST /billing/payments/:id/simulate result — instant settlement through
/// the normalized-event handler (simulated driver only).
public struct SimulatedSettlement: Sendable, Equatable {
    public let payment: Payment
    public let charge: Charge

    public init(payment: Payment, charge: Charge) {
        self.payment = payment
        self.charge = charge
    }
}

/// GET /billing/payments/:id/receipt — the comprovante render payload.
/// `studentName` is nil on professor order-charge receipts (spec 009 —
/// no student row behind the buyer).
public struct PaymentReceipt: Sendable, Equatable {
    public let payment: Payment
    public let charge: Charge
    public let studentName: String?
    public let planName: String?
    public let academyName: String?

    public init(
        payment: Payment,
        charge: Charge,
        studentName: String?,
        planName: String? = nil,
        academyName: String? = nil
    ) {
        self.payment = payment
        self.charge = charge
        self.studentName = studentName
        self.planName = planName
        self.academyName = academyName
    }
}

/// One dependent on the responsável Pagamentos screen (responsavel-04).
public struct DependentCharges: Sendable, Equatable, Identifiable {
    public let studentId: UUID
    public let fullName: String
    public let plan: AcademyPlan?
    public let currentCharge: Charge?
    /// "Pago via recorrência no cartão" mandate switch.
    public let recurrenceActive: Bool

    public var id: UUID { studentId }

    public init(
        studentId: UUID,
        fullName: String,
        plan: AcademyPlan?,
        currentCharge: Charge?,
        recurrenceActive: Bool
    ) {
        self.studentId = studentId
        self.fullName = fullName
        self.plan = plan
        self.currentCharge = currentCharge
        self.recurrenceActive = recurrenceActive
    }
}

/// GET /responsavel/payments payload.
public struct GuardianPayments: Sendable, Equatable {
    public let dependents: [DependentCharges]
    public let history: [WalletHistoryEntry]

    public init(dependents: [DependentCharges], history: [WalletHistoryEntry]) {
        self.dependents = dependents
        self.history = history
    }
}

/// "Mensalidade em aberto" alert on the aluno home and the dependent card —
/// real charge data deep-linking into the Carteira (stories 7, 22).
public struct MensalidadeAlert: Sendable, Equatable {
    public let chargeId: UUID
    public let amountCents: Int
    public let currency: String
    /// ISO "yyyy-MM-dd".
    public let dueDate: String
    /// Derived truth: past due (never the lazy status flip).
    public let overdue: Bool
    /// ISO "yyyy-MM-dd" — competência (month label source).
    public let periodStart: String?

    public init(
        chargeId: UUID,
        amountCents: Int,
        currency: String,
        dueDate: String,
        overdue: Bool,
        periodStart: String? = nil
    ) {
        self.chargeId = chargeId
        self.amountCents = amountCents
        self.currency = currency
        self.dueDate = dueDate
        self.overdue = overdue
        self.periodStart = periodStart
    }
}
