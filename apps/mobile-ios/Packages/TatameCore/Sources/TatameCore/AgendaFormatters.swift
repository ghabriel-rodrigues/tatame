// PT-BR display helpers + pure grid math for the agenda slice (spec 007,
// AGD.9-10). UI copy only — code stays English, per the charter. Mirrors the
// handoff labels: "Branca a azul", "18 de 24 vagas", "Agosto 2026",
// "Domingo, 2 de Agosto".

import Foundation

public extension AgendaOccupancy {
    /// Occupancy chip: "18 de 24 vagas" — always the "N de M" form (spec 007
    /// further notes; "Livre" is prototype sample data, not a state).
    var labelPTBR: String {
        "\(active) de \(capacity) vagas"
    }
}

public extension AgendaClassItem {
    /// Level chip (spec 007 agenda contract): belt range first, then the
    /// Kids age range, then "Todas as faixas" — composed like the handoff
    /// samples "Branca a azul" / "Azul ou acima" / "4 a 12 anos".
    var levelChipLabelPTBR: String {
        switch (minBelt, maxBelt) {
        case let (.some(min), .some(max)):
            return "\(min.name) a \(max.name.lowercased())"
        case let (.some(min), nil):
            return "\(min.name) ou acima"
        case let (nil, .some(max)):
            return "Até \(max.name.lowercased())"
        case (nil, nil):
            switch (ageMin, ageMax) {
            case let (.some(min), .some(max)): return "\(min) a \(max) anos"
            case let (.some(min), nil): return "a partir de \(min) anos"
            case let (nil, .some(max)): return "até \(max) anos"
            case (nil, nil): return "Todas as faixas"
            }
        }
    }

    /// Card time range: "19:00 – 20:00".
    var timeRangeLabel: String {
        "\(startTime) – \(endTime)"
    }

    /// Slot length derived from the "HH:mm" pair (wrapping past midnight);
    /// nil for malformed times. Feeds the Phase-4 check-in sheet's
    /// `ScheduleSlot`.
    var durationMinutes: Int? {
        guard let start = AgendaTime.minutes(startTime), let end = AgendaTime.minutes(endTime) else {
            return nil
        }
        let delta = end - start
        return delta > 0 ? delta : delta + 24 * 60
    }
}

/// "HH:mm" parsing shared by the agenda helpers.
public enum AgendaTime {
    /// "19:30" → 1170; nil for malformed input.
    public static func minutes(_ time: String) -> Int? {
        let parts = time.split(separator: ":")
        guard parts.count == 2,
              let hour = Int(parts[0]), let minute = Int(parts[1]),
              (0...23).contains(hour), (0...59).contains(minute)
        else { return nil }
        return hour * 60 + minute
    }
}

/// Client-side "today" for the day-pill default (0 = Sunday … 6 = Saturday,
/// the shared contract convention). The server remains the authority on
/// `isToday` — this only preselects the pill (spec 007 story 2).
public enum AgendaWeekday {
    public static func today(now: Date = Date(), calendar: Calendar = .current) -> Int {
        calendar.component(.weekday, from: now) - 1
    }
}

/// Month calendar copy fixed per persona by the prototypes (spec 007 client
/// placement decision) — subtitles, legend, and the empty-day voice.
public enum CalendarPersona: String, Sendable, Equatable {
    case aluno
    case professor

    public var subtitlePTBR: String {
        switch self {
        case .aluno: "Suas aulas e eventos da academia"
        case .professor: "Aulas recorrentes e eventos da academia"
        }
    }

    /// Class-dot legend label ("evento" is shared).
    public var classLegendPTBR: String {
        switch self {
        case .aluno: "sua aula"
        case .professor: "aula recorrente"
        }
    }

    public var emptyDayPTBR: String {
        switch self {
        case .aluno: "Dia livre — o tatame espera você no próximo treino."
        case .professor: "Dia livre — bom descanso."
        }
    }
}

/// Pure month-grid math (Sunday-first, matching the prototype's `getDay()`
/// layout). Clients render the current month only — the "‹" chevron is back
/// navigation, month paging is out of scope (spec 007).
public struct MonthGrid: Sendable, Equatable {
    public let year: Int
    /// 1…12.
    public let month: Int
    public let daysInMonth: Int
    /// Weekday of day 1 (0 = Sunday) — also the leading-blank count of the
    /// Sunday-first grid.
    public let firstWeekday: Int
    /// Day-of-month of today; nil when the grid is not the current month.
    public let todayDay: Int?

    public init(year: Int, month: Int, daysInMonth: Int, firstWeekday: Int, todayDay: Int?) {
        self.year = year
        self.month = month
        self.daysInMonth = daysInMonth
        self.firstWeekday = firstWeekday
        self.todayDay = todayDay
    }

    /// Grid for the month containing `now` (today highlighted).
    public static func current(now: Date = Date(), calendar: Calendar = .current) -> MonthGrid {
        var gregorian = calendar
        if gregorian.identifier != .gregorian {
            gregorian = Calendar(identifier: .gregorian)
            gregorian.timeZone = calendar.timeZone
        }
        let components = gregorian.dateComponents([.year, .month, .day], from: now)
        let year = components.year ?? 2026
        let month = components.month ?? 1
        let firstOfMonth = gregorian.date(from: DateComponents(year: year, month: month, day: 1)) ?? now
        let daysInMonth = gregorian.range(of: .day, in: .month, for: firstOfMonth)?.count ?? 30
        let firstWeekday = gregorian.component(.weekday, from: firstOfMonth) - 1
        return MonthGrid(
            year: year,
            month: month,
            daysInMonth: daysInMonth,
            firstWeekday: firstWeekday,
            todayDay: components.day
        )
    }

    /// Contract weekday (0 = Sunday) of a day of this month.
    public func weekday(of day: Int) -> Int {
        (firstWeekday + day - 1) % 7
    }

    /// Leading blanks of the Sunday-first grid.
    public var leadingBlanks: Int { firstWeekday }

    /// Query form the calendar endpoints echo: "2026-08".
    public var monthParam: String {
        String(format: "%04d-%02d", year, month)
    }

    /// Handoff month names (fixed PT-BR copy — no locale lookups).
    public static let monthNamesPTBR = [
        "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
        "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
    ]

    /// Handoff full weekday names indexed by the contract weekday.
    public static let weekdayNamesPTBR = [
        "Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado",
    ]

    /// Grid header letters, Sunday-first (handoff calendar card).
    public static let weekdayLettersPTBR = ["D", "S", "T", "Q", "Q", "S", "S"]

    /// Screen title: "Agosto 2026".
    public var titlePTBR: String {
        guard (1...12).contains(month) else { return monthParam }
        return "\(Self.monthNamesPTBR[month - 1]) \(year)"
    }

    /// Selected-day heading: "Domingo, 2 de Agosto".
    public func dayHeadingPTBR(_ day: Int) -> String {
        guard (1...12).contains(month) else { return "\(day)" }
        return "\(Self.weekdayNamesPTBR[weekday(of: day)]), \(day) de \(Self.monthNamesPTBR[month - 1])"
    }
}
