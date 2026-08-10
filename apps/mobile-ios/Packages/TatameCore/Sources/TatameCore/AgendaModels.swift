// Domain models for the agenda slice (spec 007-agenda, AGD.9-10). Read
// models only — mapped from the generated OpenAPI types inside TatameAPI;
// features only ever see these (ticket 02 convention).

import Foundation

/// Occupancy chip source — always the "N de M" form (capacity is NOT NULL;
/// the prototype's "Livre" string is sample data, spec 007 further notes).
public struct AgendaOccupancy: Sendable, Equatable {
    /// Active enrollments — the "N" of the "N de M" chip.
    public let active: Int
    public let capacity: Int

    public init(active: Int, capacity: Int) {
        self.active = active
        self.capacity = capacity
    }
}

// The spec-007 `AgendaEvent` placeholder retired with spec 008: the events
// arrays now carry real `EventListItem` values (EventsModels.swift).

/// One schedule slot of an enrolled class on the aluno agenda. A class with
/// two slots on the same weekday yields two items (spec 007 story 5), so
/// identity includes the start time.
public struct AgendaClassItem: Sendable, Equatable, Identifiable {
    public let classId: UUID
    public let className: String
    /// "HH:mm".
    public let startTime: String
    /// "HH:mm" (slot start + duration, server-derived).
    public let endTime: String
    public let professorName: String
    public let ageMin: Int?
    public let ageMax: Int?
    /// Level chip lower bound; both belt ends nil = age range or
    /// "Todas as faixas".
    public let minBelt: BeltRef?
    public let maxBelt: BeltRef?
    public let occupancy: AgendaOccupancy
    /// True iff today's session exists AND the caller holds an active
    /// (non-revoked) attendance on it; always false off-today.
    public let checkedIn: Bool

    public var id: String { "\(classId.uuidString)-\(startTime)" }

    public init(
        classId: UUID,
        className: String,
        startTime: String,
        endTime: String,
        professorName: String,
        ageMin: Int?,
        ageMax: Int?,
        minBelt: BeltRef?,
        maxBelt: BeltRef?,
        occupancy: AgendaOccupancy,
        checkedIn: Bool
    ) {
        self.classId = classId
        self.className = className
        self.startTime = startTime
        self.endTime = endTime
        self.professorName = professorName
        self.ageMin = ageMin
        self.ageMax = ageMax
        self.minBelt = minBelt
        self.maxBelt = maxBelt
        self.occupancy = occupancy
        self.checkedIn = checkedIn
    }
}

/// GET /aluno/agenda payload.
public struct AlunoAgenda: Sendable, Equatable {
    /// 0 = Sunday … 6 = Saturday (shared contract).
    public let weekday: Int
    /// Whether the returned weekday is today in the tenant timezone — the
    /// check-in affordance gate (never computed client-side).
    public let isToday: Bool
    /// Sorted by start time (server-side).
    public let classes: [AgendaClassItem]
    /// "Eventos do mês": the current tenant-local month's published events
    /// with own registration state (spec 008 — the Phase-7 empty state
    /// retires).
    public let events: [EventListItem]

    public init(weekday: Int, isToday: Bool, classes: [AgendaClassItem], events: [EventListItem] = []) {
        self.weekday = weekday
        self.isToday = isToday
        self.classes = classes
        self.events = events
    }

    /// The check-in affordance rule (spec 007 stories 6-10): button iff
    /// `isToday && !checkedIn`; green check iff `checkedIn`; nothing
    /// off-today.
    public func showsCheckinButton(for item: AgendaClassItem) -> Bool {
        isToday && !item.checkedIn
    }

    /// Builds the Phase-4 check-in sheet target for an agenda row — the
    /// button only *opens* the existing sheet; every rule stays server-side.
    /// Nil when the affordance rule says no button (or the slot times are
    /// malformed).
    public func checkinTarget(for item: AgendaClassItem) -> AlunoTodayClass? {
        guard showsCheckinButton(for: item), let duration = item.durationMinutes else { return nil }
        return AlunoTodayClass(
            classId: item.classId,
            className: item.className,
            slot: ScheduleSlot(weekday: weekday, startTime: item.startTime, durationMinutes: duration),
            checkedIn: false
        )
    }
}

/// One class item inside a calendar weekday bucket (persona-scoped
/// server-side; the shape is shared by aluno and professor).
public struct CalendarClassItem: Sendable, Equatable, Identifiable {
    public let classId: UUID
    public let className: String
    /// "HH:mm".
    public let startTime: String
    /// "HH:mm".
    public let endTime: String
    public let professorName: String
    public let occupancy: AgendaOccupancy

    public var id: String { "\(classId.uuidString)-\(startTime)" }

    public init(
        classId: UUID,
        className: String,
        startTime: String,
        endTime: String,
        professorName: String,
        occupancy: AgendaOccupancy
    ) {
        self.classId = classId
        self.className = className
        self.startTime = startTime
        self.endTime = endTime
        self.professorName = professorName
        self.occupancy = occupancy
    }
}

/// GET /{aluno|professor}/calendar payload: the weekly recurrence plan (not
/// per-date dots) — the client expands it over the rendered month grid
/// (spec 007 calendar contract).
public struct PersonaCalendar: Sendable, Equatable {
    /// "YYYY-MM", echoed by the server.
    public let month: String
    /// 0 = Sunday … 6 = Saturday; missing keys read as empty buckets.
    public let classesByWeekday: [Int: [CalendarClassItem]]
    /// The requested month's published events as dated items — the pink
    /// dots (spec 008; aluno items carry own registration state).
    public let events: [EventListItem]

    public init(month: String, classesByWeekday: [Int: [CalendarClassItem]], events: [EventListItem] = []) {
        self.month = month
        self.classesByWeekday = classesByWeekday
        self.events = events
    }

    /// Weekdays whose bucket is non-empty — a date gets the class dot iff
    /// its weekday is in this set.
    public var weekdaysWithClasses: Set<Int> {
        Set(classesByWeekday.filter { !$0.value.isEmpty }.keys)
    }

    /// Selected-day agenda: the weekday bucket sorted by start time (Evento
    /// entries merge in separately via `events(onDay:)`, spec 008 story 16).
    public func dayAgenda(weekday: Int) -> [CalendarClassItem] {
        (classesByWeekday[weekday] ?? []).sorted { $0.startTime < $1.startTime }
    }

    /// Days-of-month carrying at least one event — the pink-dot source
    /// (spec 008; dates are tenant-local, bucketed server-side).
    public var eventDays: Set<Int> {
        Set(events.compactMap { $0.dayOfMonth(inMonth: month) })
    }

    /// The selected day's Evento entries, sorted by time (undated never
    /// reaches published surfaces).
    public func events(onDay day: Int) -> [EventListItem] {
        events
            .filter { $0.dayOfMonth(inMonth: month) == day }
            .sorted { ($0.time ?? "") < ($1.time ?? "") }
    }
}
