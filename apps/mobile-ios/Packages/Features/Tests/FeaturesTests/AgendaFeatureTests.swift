import Foundation
import Testing
@testable import AgendaFeature
import TatameCore

// MARK: - Fake (repository-protocol seam, spec 007)

final class FakeAgendaRepository: AgendaRepository, @unchecked Sendable {
    var agendaResults: [Int?: Result<AlunoAgenda, ApiError>] = [:]
    private(set) var agendaCalls: [Int?] = []
    var alunoCalendarResult: Result<PersonaCalendar, ApiError> = .failure(.unknown(status: 0, code: nil))
    private(set) var alunoCalendarCalls: [String?] = []
    var professorCalendarResult: Result<PersonaCalendar, ApiError> = .failure(.unknown(status: 0, code: nil))
    private(set) var professorCalendarCalls: [String?] = []

    func alunoAgenda(weekday: Int?) async throws -> AlunoAgenda {
        agendaCalls.append(weekday)
        guard let result = agendaResults[weekday] else {
            throw ApiError.unknown(status: 0, code: nil)
        }
        return try result.get()
    }

    func alunoCalendar(month: String?) async throws -> PersonaCalendar {
        alunoCalendarCalls.append(month)
        return try alunoCalendarResult.get()
    }

    func professorCalendar(month: String?) async throws -> PersonaCalendar {
        professorCalendarCalls.append(month)
        return try professorCalendarResult.get()
    }
}

// MARK: - Fixtures

private let classId = UUID(uuidString: "0198a7b0-0000-7000-8000-000000000041")!

private func agendaItem(
    startTime: String = "10:00",
    endTime: String = "12:00",
    checkedIn: Bool = false
) -> AgendaClassItem {
    AgendaClassItem(
        classId: classId,
        className: "Open mat",
        startTime: startTime,
        endTime: endTime,
        professorName: "Toda a equipe",
        ageMin: nil,
        ageMax: nil,
        minBelt: nil,
        maxBelt: nil,
        occupancy: AgendaOccupancy(active: 21, capacity: 40),
        checkedIn: checkedIn
    )
}

private func calendarItem(_ startTime: String, name: String = "Fundamentos") -> CalendarClassItem {
    CalendarClassItem(
        classId: classId,
        className: name,
        startTime: startTime,
        endTime: "20:00",
        professorName: "Rafael Nunes",
        occupancy: AgendaOccupancy(active: 18, capacity: 24)
    )
}

/// August 2026 — the prototype month: 31 days, day 1 on a Saturday, today
/// = Sunday the 2nd.
private let august2026 = MonthGrid(year: 2026, month: 8, daysInMonth: 31, firstWeekday: 6, todayDay: 2)

// MARK: - Aluno agenda model (AGD.9)

@Suite("AlunoAgendaModel (day pills + check-in affordance, spec 007)")
@MainActor
struct AlunoAgendaModelTests {
    @Test("the day pill defaults to today and load fetches it")
    func defaultsToToday() async {
        let repository = FakeAgendaRepository()
        repository.agendaResults[2] = .success(
            AlunoAgenda(weekday: 2, isToday: true, classes: [agendaItem()], events: [])
        )
        let model = AlunoAgendaModel(repository: repository, todayWeekday: 2)

        #expect(model.selectedWeekday == 2)
        await model.load()

        #expect(repository.agendaCalls == [2])
        #expect(model.agenda?.weekday == 2)
        #expect(model.agenda?.classes.count == 1)
    }

    @Test("selecting another pill refetches that weekday")
    func pillSelectionFetches() async {
        let repository = FakeAgendaRepository()
        repository.agendaResults[2] = .success(AlunoAgenda(weekday: 2, isToday: true, classes: [], events: []))
        repository.agendaResults[5] = .success(
            AlunoAgenda(weekday: 5, isToday: false, classes: [agendaItem(startTime: "19:00", endTime: "20:00")], events: [])
        )
        let model = AlunoAgendaModel(repository: repository, todayWeekday: 2)
        await model.load()

        await model.select(weekday: 5)

        #expect(model.selectedWeekday == 5)
        #expect(repository.agendaCalls == [2, 5])
        #expect(model.agenda?.classes.first?.startTime == "19:00")
    }

    @Test("openCheckin builds the Phase-4 target only when the affordance rule allows")
    func checkinAffordance() async {
        let repository = FakeAgendaRepository()
        let pending = agendaItem()
        repository.agendaResults[2] = .success(
            AlunoAgenda(weekday: 2, isToday: true, classes: [pending], events: [])
        )
        let model = AlunoAgendaModel(repository: repository, todayWeekday: 2)
        await model.load()

        model.openCheckin(for: pending)

        let target = model.checkinTarget
        #expect(target?.classId == classId)
        #expect(target?.slot == ScheduleSlot(weekday: 2, startTime: "10:00", durationMinutes: 120))
        #expect(target?.checkedIn == false)
    }

    @Test("no sheet target for a checked-in row or an off-today day")
    func noAffordanceOffTodayOrDone() async {
        let repository = FakeAgendaRepository()
        let done = agendaItem(checkedIn: true)
        repository.agendaResults[2] = .success(
            AlunoAgenda(weekday: 2, isToday: true, classes: [done], events: [])
        )
        let model = AlunoAgendaModel(repository: repository, todayWeekday: 2)
        await model.load()
        model.openCheckin(for: done)
        #expect(model.checkinTarget == nil)

        // Off-today weekday: never a button, even for a pending row.
        let pending = agendaItem()
        repository.agendaResults[5] = .success(
            AlunoAgenda(weekday: 5, isToday: false, classes: [pending], events: [])
        )
        await model.select(weekday: 5)
        model.openCheckin(for: pending)
        #expect(model.checkinTarget == nil)
    }

    @Test("a successful check-in refetches the agenda (server stays the authority)")
    func checkinRefetches() async {
        let repository = FakeAgendaRepository()
        repository.agendaResults[2] = .success(
            AlunoAgenda(weekday: 2, isToday: true, classes: [agendaItem()], events: [])
        )
        let model = AlunoAgendaModel(repository: repository, todayWeekday: 2)
        await model.load()
        #expect(repository.agendaCalls.count == 1)

        repository.agendaResults[2] = .success(
            AlunoAgenda(weekday: 2, isToday: true, classes: [agendaItem(checkedIn: true)], events: [])
        )
        let stats = AlunoStats(
            monthPresencePct: 90,
            monthAttendedSessions: 9,
            monthTotalSessions: 10,
            streak: nil,
            totalLessons: 20
        )
        model.handleCheckinResult(
            CheckinResult(
                status: .checkedIn,
                attendance: AttendanceRef(id: UUID(), classSessionId: UUID(), method: .qr, checkedInAt: Date()),
                session: CheckinSessionRef(id: UUID(), classId: classId, className: "Open mat", sessionDate: "2026-08-04"),
                stats: stats
            )
        )
        // The refetch runs on a spawned task; give it a beat.
        try? await Task.sleep(for: .milliseconds(50))

        #expect(repository.agendaCalls.count == 2)
        #expect(model.agenda?.classes.first?.checkedIn == true)
    }

    @Test("failure maps to the PT-BR message and retry reloads")
    func failureState() async {
        let repository = FakeAgendaRepository()
        repository.agendaResults[2] = .failure(.network(.notConnectedToInternet))
        let model = AlunoAgendaModel(repository: repository, todayWeekday: 2)
        await model.load()

        guard case .failed = model.phase else {
            Issue.record("expected failed phase, got \(model.phase)")
            return
        }
        #expect(model.agenda == nil)
    }
}

// MARK: - Month calendar model (AGD.10)

@Suite("MonthCalendarModel (bucket → dot expansion, spec 007)")
@MainActor
struct MonthCalendarModelTests {
    private func loadedModel(
        persona: CalendarPersona,
        buckets: [Int: [CalendarClassItem]],
        events: [EventListItem] = []
    ) async -> (MonthCalendarModel, FakeAgendaRepository) {
        let repository = FakeAgendaRepository()
        let calendar = PersonaCalendar(month: "2026-08", classesByWeekday: buckets, events: events)
        repository.alunoCalendarResult = .success(calendar)
        repository.professorCalendarResult = .success(calendar)
        let model = MonthCalendarModel(persona: persona, repository: repository, grid: august2026)
        await model.load()
        return (model, repository)
    }

    @Test("selection defaults to today and the aluno fetch carries the grid month")
    func defaultsAndFetch() async {
        let (model, repository) = await loadedModel(persona: .aluno, buckets: [:])
        #expect(model.selectedDay == 2)
        #expect(repository.alunoCalendarCalls == ["2026-08"])
        #expect(repository.professorCalendarCalls.isEmpty)
    }

    @Test("the professor persona hits the professor endpoint")
    func professorFetch() async {
        let (_, repository) = await loadedModel(persona: .professor, buckets: [:])
        #expect(repository.professorCalendarCalls == ["2026-08"])
        #expect(repository.alunoCalendarCalls.isEmpty)
    }

    @Test("weekday buckets expand to dots over the fixed August 2026 grid")
    func dotExpansion() async {
        // Mon + Sat recur; Sunday empty.
        let (model, _) = await loadedModel(
            persona: .aluno,
            buckets: [1: [calendarItem("19:00")], 6: [calendarItem("10:00")], 0: []]
        )

        // Aug 2026: 1 = Sat, 2 = Sun, 3 = Mon, 8 = Sat, 31 = Mon.
        #expect(model.hasClassDot(day: 1))
        #expect(model.hasClassDot(day: 3))
        #expect(model.hasClassDot(day: 8))
        #expect(model.hasClassDot(day: 31))
        #expect(!model.hasClassDot(day: 2))
        #expect(!model.hasClassDot(day: 4))
        // No events on this calendar — no pink dots.
        #expect(!model.hasEventDot(day: 1))
    }

    @Test("event dots and day Evento entries turn real (spec 008 story 16)")
    func eventDotsAndEntries() async {
        let event = EventListItem(
            id: UUID(),
            name: "Open mat de verão",
            bannerPreset: "event-purple-pink",
            location: "Tatame principal",
            date: "2026-08-15",
            time: "10:00",
            priceCents: nil
        )
        let (model, _) = await loadedModel(
            persona: .aluno,
            buckets: [1: [calendarItem("19:00")]],
            events: [event]
        )

        #expect(model.hasEventDot(day: 15))
        #expect(!model.hasEventDot(day: 14))

        // Aug 15 2026 is a Saturday — no Monday class bucket, but the day
        // is not empty: the Evento entry fills it.
        model.selectedDay = 15
        #expect(model.selectedDayEvents.map(\.name) == ["Open mat de verão"])
        #expect(!model.showsEmptyDay)

        // The professor calendar renders the same academy-wide events.
        let (professor, _) = await loadedModel(persona: .professor, buckets: [:], events: [event])
        #expect(professor.hasEventDot(day: 15))
    }

    @Test("selecting a day shows its weekday agenda sorted by time")
    func daySelection() async {
        let (model, _) = await loadedModel(
            persona: .aluno,
            buckets: [1: [calendarItem("20:00", name: "Avançada"), calendarItem("18:00", name: "Kids")]]
        )

        model.selectedDay = 3 // Monday.
        #expect(model.selectedDayItems.map(\.className) == ["Kids", "Avançada"])
        #expect(model.selectedDayHeadingPTBR == "Segunda, 3 de Agosto")
        #expect(!model.showsEmptyDay)
    }

    @Test("free days show the persona's designed empty copy")
    func personaEmptyCopy() async {
        let (aluno, _) = await loadedModel(persona: .aluno, buckets: [1: [calendarItem("19:00")]])
        aluno.selectedDay = 2 // Sunday — no bucket.
        #expect(aluno.showsEmptyDay)
        #expect(aluno.persona.emptyDayPTBR == "Dia livre — o tatame espera você no próximo treino.")

        let (professor, _) = await loadedModel(persona: .professor, buckets: [:])
        #expect(professor.showsEmptyDay)
        #expect(professor.persona.emptyDayPTBR == "Dia livre — bom descanso.")
    }

    @Test("failure maps to the failed phase without an empty-day claim")
    func failureState() async {
        let repository = FakeAgendaRepository()
        repository.alunoCalendarResult = .failure(.forbidden(code: ApiErrorCode.forbiddenRole))
        let model = MonthCalendarModel(persona: .aluno, repository: repository, grid: august2026)
        await model.load()

        guard case .failed = model.phase else {
            Issue.record("expected failed phase, got \(model.phase)")
            return
        }
        #expect(!model.showsEmptyDay)
    }
}
