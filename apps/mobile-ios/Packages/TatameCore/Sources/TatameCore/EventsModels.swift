// Domain models for the events slice (spec 008-events, EVT.14-15). Mapped
// from the generated OpenAPI types inside TatameAPI — features only ever see
// these (ticket 02 convention). Amounts are integer cents; `priceCents ==
// nil` means gratuito, matching the schema's "NULL = gratuito".

import Foundation

/// Shared contract enum — one row per (event, student) whose status flips
/// (spec 008 story 26).
public enum EventRegistrationStatus: String, Sendable {
    case pendingPayment = "pending_payment"
    case confirmed
    case canceled
}

/// The caller's (or a dependent's) registration state on an event.
/// `chargeId` is the open event-origin charge to pay — present on
/// `pendingPayment` only; it drives the existing Pix sheet.
public struct EventRegistrationState: Sendable, Equatable {
    public let id: UUID
    public let status: EventRegistrationStatus
    public let chargeId: UUID?

    public init(id: UUID, status: EventRegistrationStatus, chargeId: UUID? = nil) {
        self.id = id
        self.status = status
        self.chargeId = chargeId
    }

    /// Chip/banner truth: a canceled row reads as "not registered".
    public var isConfirmed: Bool { status == .confirmed }
    public var isPendingPayment: Bool { status == .pendingPayment }
}

/// One event card on the aluno home ("Próximos eventos"), the Agenda
/// "Eventos do mês" and the persona calendars — the shared list shape
/// (AlunoEventItemDto / CalendarEventItemDto). `registration` is the own
/// state, present on aluno surfaces only.
public struct EventListItem: Sendable, Equatable, Identifiable {
    public let id: UUID
    public let name: String
    /// Design-system gradient slug (banner_preset).
    public let bannerPreset: String
    public let location: String?
    /// Tenant-local ISO "yyyy-MM-dd"; nil only on drafts, which never reach
    /// these surfaces.
    public let date: String?
    /// Tenant-local "HH:mm".
    public let time: String?
    /// Integer cents; nil = gratuito.
    public let priceCents: Int?
    public let registration: EventRegistrationState?

    public init(
        id: UUID,
        name: String,
        bannerPreset: String,
        location: String?,
        date: String?,
        time: String?,
        priceCents: Int?,
        registration: EventRegistrationState? = nil
    ) {
        self.id = id
        self.name = name
        self.bannerPreset = bannerPreset
        self.location = location
        self.date = date
        self.time = time
        self.priceCents = priceCents
        self.registration = registration
    }

    /// "Confirmado" chip state on list cards (spec 008 story 9).
    public var isConfirmed: Bool { registration?.isConfirmed == true }

    /// Day-of-month within `month` ("yyyy-MM"); nil when the event falls
    /// outside it or has no date — the calendar pink-dot source.
    public func dayOfMonth(inMonth month: String) -> Int? {
        guard let date, date.hasPrefix("\(month)-"), date.count == 10 else { return nil }
        return Int(date.suffix(2))
    }
}

/// GET /aluno/events/:id payload — the aluno-10 detail screen.
public struct EventDetail: Sendable, Equatable {
    public let id: UUID
    public let name: String
    public let bannerPreset: String
    public let location: String?
    public let date: String?
    public let time: String?
    /// Integer cents; nil = gratuito.
    public let priceCents: Int?
    public let description: String?
    /// The "Responsável: Prof. …" line.
    public let responsibleName: String
    public let registration: EventRegistrationState?

    public init(
        id: UUID,
        name: String,
        bannerPreset: String,
        location: String?,
        date: String?,
        time: String?,
        priceCents: Int?,
        description: String?,
        responsibleName: String,
        registration: EventRegistrationState? = nil
    ) {
        self.id = id
        self.name = name
        self.bannerPreset = bannerPreset
        self.location = location
        self.date = date
        self.time = time
        self.priceCents = priceCents
        self.description = description
        self.responsibleName = responsibleName
        self.registration = registration
    }

    public var isFree: Bool { priceCents == nil }
}

/// POST registration result — free events come back `confirmed`; paid ones
/// `pending_payment` plus the chargeId the existing wallet rails settle.
public struct EventRegistrationOutcome: Sendable, Equatable {
    public let registration: EventRegistrationState
    /// Pay this through the existing Pix sheet + simulate; nil on free.
    public let chargeId: UUID?

    public init(registration: EventRegistrationState, chargeId: UUID? = nil) {
        self.registration = registration
        self.chargeId = chargeId
    }
}

/// One dependent chip on the responsável Eventos tab (responsavel-06) —
/// per-child state, per the charter (spec 008 story 21).
public struct GuardianEventDependent: Sendable, Equatable, Identifiable {
    public let studentId: UUID
    public let fullName: String
    public let registration: EventRegistrationState?

    public var id: UUID { studentId }

    public init(studentId: UUID, fullName: String, registration: EventRegistrationState? = nil) {
        self.studentId = studentId
        self.fullName = fullName
        self.registration = registration
    }

    /// The chip's check state.
    public var isConfirmed: Bool { registration?.isConfirmed == true }
    public var isPendingPayment: Bool { registration?.isPendingPayment == true }
}

/// One gradient card on the responsável Eventos tab, dependents included.
public struct GuardianEvent: Sendable, Equatable, Identifiable {
    public let id: UUID
    public let name: String
    public let bannerPreset: String
    public let location: String?
    public let date: String?
    public let time: String?
    /// Integer cents; nil = gratuito.
    public let priceCents: Int?
    public let description: String?
    /// One chip per dependent — states independent of siblings'.
    public let dependents: [GuardianEventDependent]

    public init(
        id: UUID,
        name: String,
        bannerPreset: String,
        location: String?,
        date: String?,
        time: String?,
        priceCents: Int?,
        description: String?,
        dependents: [GuardianEventDependent]
    ) {
        self.id = id
        self.name = name
        self.bannerPreset = bannerPreset
        self.location = location
        self.date = date
        self.time = time
        self.priceCents = priceCents
        self.description = description
        self.dependents = dependents
    }

    public var isFree: Bool { priceCents == nil }

    public func dependent(studentId: UUID) -> GuardianEventDependent? {
        dependents.first { $0.studentId == studentId }
    }
}

/// One row of the professor dashboard's "Eventos futuros" list (read-only
/// academy-wide data, spec 008 story 22).
public struct ProfessorUpcomingEvent: Sendable, Equatable, Identifiable {
    public let id: UUID
    public let name: String
    public let bannerPreset: String
    public let location: String?
    public let date: String?
    public let time: String?
    /// Integer cents; nil = gratuito.
    public let priceCents: Int?
    /// The "N confirmados" of the dashboard list.
    public let confirmedCount: Int

    public init(
        id: UUID,
        name: String,
        bannerPreset: String,
        location: String?,
        date: String?,
        time: String?,
        priceCents: Int?,
        confirmedCount: Int
    ) {
        self.id = id
        self.name = name
        self.bannerPreset = bannerPreset
        self.location = location
        self.date = date
        self.time = time
        self.priceCents = priceCents
        self.confirmedCount = confirmedCount
    }
}
