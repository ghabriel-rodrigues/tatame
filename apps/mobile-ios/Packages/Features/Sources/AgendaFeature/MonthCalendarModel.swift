// Month calendar model shared by the aluno and professor screens (spec 007,
// AGD.10 — stories 14-23): one fetch of the persona-scoped weekday buckets,
// client-side expansion over the rendered month grid, and the selected-day
// agenda. Clients render the current month only (no paging by design).

import AttendanceFeature
import Foundation
import Observation
import TatameCore

@MainActor
@Observable
public final class MonthCalendarModel {
    public enum Phase: Equatable, Sendable {
        case idle
        case loading
        case loaded(PersonaCalendar)
        case failed(message: String)
    }

    public let persona: CalendarPersona
    public let grid: MonthGrid
    /// Day-of-month; defaults to today (falls back to 1 off-current-month,
    /// unreachable in v1 since only the current month renders).
    public var selectedDay: Int
    public private(set) var phase: Phase = .idle

    @ObservationIgnored private let repository: any AgendaRepository

    public init(
        persona: CalendarPersona,
        repository: any AgendaRepository,
        grid: MonthGrid = .current()
    ) {
        self.persona = persona
        self.repository = repository
        self.grid = grid
        selectedDay = grid.todayDay ?? 1
    }

    public var calendar: PersonaCalendar? {
        if case .loaded(let calendar) = phase { return calendar }
        return nil
    }

    public func load() async {
        if case .loaded = phase {} else {
            phase = .loading
        }
        do {
            let calendar = switch persona {
            case .aluno: try await repository.alunoCalendar(month: grid.monthParam)
            case .professor: try await repository.professorCalendar(month: grid.monthParam)
            }
            phase = .loaded(calendar)
        } catch let error as ApiError {
            phase = .failed(message: AttendanceMessages.message(for: error))
        } catch {
            phase = .failed(message: AttendanceMessages.generic)
        }
    }

    // MARK: Grid expansion (dots derive from schedules, not sessions)

    /// Purple dot iff the date's weekday bucket is non-empty (story 14).
    public func hasClassDot(day: Int) -> Bool {
        calendar?.weekdaysWithClasses.contains(grid.weekday(of: day)) ?? false
    }

    /// Pink dot iff an event falls on the date (spec 008 — the Phase-7
    /// legend finally tells the truth).
    public func hasEventDot(day: Int) -> Bool {
        calendar?.eventDays.contains(day) ?? false
    }

    // MARK: Selected day

    /// "Domingo, 2 de Agosto".
    public var selectedDayHeadingPTBR: String {
        grid.dayHeadingPTBR(selectedDay)
    }

    /// The selected day's agenda: its weekday bucket sorted by time; Evento
    /// entries merge in separately via `selectedDayEvents` (spec 008).
    public var selectedDayItems: [CalendarClassItem] {
        calendar?.dayAgenda(weekday: grid.weekday(of: selectedDay)) ?? []
    }

    /// The selected day's Evento entries (spec 008 story 16 — dated items,
    /// sorted by time).
    public var selectedDayEvents: [EventListItem] {
        calendar?.events(onDay: selectedDay) ?? []
    }

    /// Free-day empty state with the persona's designed copy (stories 18/23);
    /// a day with only an event is not empty (spec 008).
    public var showsEmptyDay: Bool {
        if case .loaded = phase { return selectedDayItems.isEmpty && selectedDayEvents.isEmpty }
        return false
    }
}
