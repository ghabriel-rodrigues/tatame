// Aluno Agenda tab model (spec 007, AGD.9 — stories 1-13): day-of-week
// pills with today preselected, the selected weekday's enrolled classes,
// and the check-in handoff to the Phase-4 sheet. A successful check-in
// refetches the agenda (the server stays the authority on checkedIn).

import AttendanceFeature
import Foundation
import Observation
import TatameCore

@MainActor
@Observable
public final class AlunoAgendaModel {
    public enum Phase: Equatable, Sendable {
        case idle
        case loading
        case loaded(AlunoAgenda)
        case failed(message: String)
    }

    /// The selected day pill (0 = Sunday … 6 = Saturday). Defaults to
    /// today so the tab opens on "what can I train today?" (story 2).
    public private(set) var selectedWeekday: Int
    public private(set) var phase: Phase = .idle
    /// The Phase-4 sheet target — non-nil presents the check-in sheet.
    public var checkinTarget: AlunoTodayClass?

    @ObservationIgnored private let repository: any AgendaRepository

    public init(
        repository: any AgendaRepository,
        todayWeekday: Int = AgendaWeekday.today()
    ) {
        self.repository = repository
        selectedWeekday = todayWeekday
    }

    public var agenda: AlunoAgenda? {
        if case .loaded(let agenda) = phase { return agenda }
        return nil
    }

    public func load() async {
        // Keep the loaded list on screen during silent refetches (same
        // convention as AlunoHomeModel).
        if case .loaded = phase {} else {
            phase = .loading
        }
        do {
            phase = .loaded(try await repository.alunoAgenda(weekday: selectedWeekday))
        } catch let error as ApiError {
            phase = .failed(message: AttendanceMessages.message(for: error))
        } catch {
            phase = .failed(message: AttendanceMessages.generic)
        }
    }

    /// Day pill tap — refetches the tapped weekday (story 1).
    public func select(weekday: Int) async {
        guard weekday != selectedWeekday || agenda == nil else { return }
        selectedWeekday = weekday
        phase = .loading
        await load()
    }

    /// Check-in button tap: builds the Phase-4 sheet target iff the
    /// affordance rule allows it (`isToday && !checkedIn`, story 6).
    public func openCheckin(for item: AgendaClassItem) {
        guard let target = agenda?.checkinTarget(for: item) else { return }
        checkinTarget = target
    }

    /// Fired by the sheet's one successful round trip — refetch so the row
    /// flips to the green check server-truthfully (story 8).
    public func handleCheckinResult(_ result: CheckinResult) {
        Task { await load() }
    }
}
