import Foundation
import Testing
@testable import TatameCore

@Suite("Agenda models & formatters (spec 007)")
struct AgendaModelTests {
    private static let classId = UUID(uuidString: "0198a7b0-0000-7000-8000-000000000021")!
    private static let beltId = UUID(uuidString: "0198a7b0-0000-7000-8000-000000000022")!

    private func belt(_ name: String) -> BeltRef {
        BeltRef(
            beltId: Self.beltId,
            name: name,
            colorSlug: "belt.blue",
            tipColorSlug: nil,
            maxDegrees: 4
        )
    }

    private func item(
        startTime: String = "19:00",
        endTime: String = "20:00",
        ageMin: Int? = nil,
        ageMax: Int? = nil,
        minBelt: BeltRef? = nil,
        maxBelt: BeltRef? = nil,
        checkedIn: Bool = false
    ) -> AgendaClassItem {
        AgendaClassItem(
            classId: Self.classId,
            className: "Fundamentos",
            startTime: startTime,
            endTime: endTime,
            professorName: "Rafael Nunes",
            ageMin: ageMin,
            ageMax: ageMax,
            minBelt: minBelt,
            maxBelt: maxBelt,
            occupancy: AgendaOccupancy(active: 18, capacity: 24),
            checkedIn: checkedIn
        )
    }

    // MARK: Chips

    @Test("occupancy chip is always the N de M vagas form")
    func occupancyLabel() {
        #expect(AgendaOccupancy(active: 18, capacity: 24).labelPTBR == "18 de 24 vagas")
        #expect(AgendaOccupancy(active: 0, capacity: 16).labelPTBR == "0 de 16 vagas")
    }

    @Test("level chip composes belt range, single bounds, age range, and the all-belts fallback")
    func levelChipComposition() {
        #expect(item(minBelt: belt("Branca"), maxBelt: belt("Azul")).levelChipLabelPTBR == "Branca a azul")
        #expect(item(minBelt: belt("Azul")).levelChipLabelPTBR == "Azul ou acima")
        #expect(item(maxBelt: belt("Roxa")).levelChipLabelPTBR == "Até roxa")
        #expect(item(ageMin: 4, ageMax: 12).levelChipLabelPTBR == "4 a 12 anos")
        #expect(item(ageMin: 13).levelChipLabelPTBR == "a partir de 13 anos")
        #expect(item().levelChipLabelPTBR == "Todas as faixas")
    }

    @Test("belts win over the age range when both are present")
    func levelChipBeltsWin() {
        let both = item(ageMin: 4, ageMax: 12, minBelt: belt("Branca"), maxBelt: belt("Azul"))
        #expect(both.levelChipLabelPTBR == "Branca a azul")
    }

    @Test("time range label and duration derive from the HH:mm pair")
    func timeRangeAndDuration() {
        #expect(item().timeRangeLabel == "19:00 – 20:00")
        #expect(item().durationMinutes == 60)
        #expect(item(startTime: "10:00", endTime: "12:00").durationMinutes == 120)
        // Past-midnight wrap.
        #expect(item(startTime: "23:30", endTime: "00:30").durationMinutes == 60)
        // Malformed times yield nil, never a crash.
        #expect(item(startTime: "25:00").durationMinutes == nil)
        #expect(item(endTime: "junk").durationMinutes == nil)
    }

    // MARK: Check-in affordance (stories 6-10)

    @Test("the button shows iff isToday && !checkedIn")
    func affordanceRule() {
        let pending = item()
        let done = item(checkedIn: true)
        let today = AlunoAgenda(weekday: 6, isToday: true, classes: [pending, done], events: [])
        let otherDay = AlunoAgenda(weekday: 3, isToday: false, classes: [pending], events: [])

        #expect(today.showsCheckinButton(for: pending))
        #expect(!today.showsCheckinButton(for: done))
        #expect(!otherDay.showsCheckinButton(for: pending))
    }

    @Test("checkinTarget builds the Phase-4 sheet slot only when the button shows")
    func checkinTarget() throws {
        let pending = item(startTime: "10:00", endTime: "12:00")
        let today = AlunoAgenda(weekday: 6, isToday: true, classes: [pending], events: [])

        let target = try #require(today.checkinTarget(for: pending))
        #expect(target.classId == Self.classId)
        #expect(target.className == "Fundamentos")
        #expect(target.slot == ScheduleSlot(weekday: 6, startTime: "10:00", durationMinutes: 120))
        #expect(!target.checkedIn)

        let done = item(checkedIn: true)
        #expect(today.checkinTarget(for: done) == nil)

        let otherDay = AlunoAgenda(weekday: 3, isToday: false, classes: [pending], events: [])
        #expect(otherDay.checkinTarget(for: pending) == nil)
    }

    // MARK: Calendar buckets

    private func calendarItem(_ startTime: String, name: String = "Fundamentos") -> CalendarClassItem {
        CalendarClassItem(
            classId: Self.classId,
            className: name,
            startTime: startTime,
            endTime: "21:00",
            professorName: "Rafael Nunes",
            occupancy: AgendaOccupancy(active: 12, capacity: 20)
        )
    }

    @Test("weekdaysWithClasses skips empty buckets and missing keys read as empty")
    func bucketExpansionSource() {
        let calendar = PersonaCalendar(
            month: "2026-08",
            classesByWeekday: [1: [calendarItem("19:00")], 3: [], 6: [calendarItem("10:00")]],
            events: []
        )
        #expect(calendar.weekdaysWithClasses == [1, 6])
        #expect(calendar.dayAgenda(weekday: 0).isEmpty)
        #expect(calendar.dayAgenda(weekday: 3).isEmpty)
    }

    @Test("dayAgenda sorts the bucket by start time")
    func dayAgendaSorted() {
        let calendar = PersonaCalendar(
            month: "2026-08",
            classesByWeekday: [2: [calendarItem("20:00", name: "Avançada"), calendarItem("18:00", name: "Kids")]],
            events: []
        )
        #expect(calendar.dayAgenda(weekday: 2).map(\.className) == ["Kids", "Avançada"])
    }

    // MARK: Persona copy (spec 007 fixed PT-BR)

    @Test("persona copy matches the prototypes")
    func personaCopy() {
        #expect(CalendarPersona.aluno.subtitlePTBR == "Suas aulas e eventos da academia")
        #expect(CalendarPersona.professor.subtitlePTBR == "Aulas recorrentes e eventos da academia")
        #expect(CalendarPersona.aluno.classLegendPTBR == "sua aula")
        #expect(CalendarPersona.professor.classLegendPTBR == "aula recorrente")
        #expect(CalendarPersona.aluno.emptyDayPTBR == "Dia livre — o tatame espera você no próximo treino.")
        #expect(CalendarPersona.professor.emptyDayPTBR == "Dia livre — bom descanso.")
    }
}

@Suite("Month grid math (spec 007, Sunday-first)")
struct MonthGridTests {
    private func date(_ year: Int, _ month: Int, _ day: Int) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar.date(from: DateComponents(year: year, month: month, day: day, hour: 12))!
    }

    private var utcCalendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }

    @Test("August 2026 lays out like the prototype: 31 days starting on a Saturday")
    func august2026() {
        let grid = MonthGrid.current(now: date(2026, 8, 2), calendar: utcCalendar)
        #expect(grid.year == 2026)
        #expect(grid.month == 8)
        #expect(grid.daysInMonth == 31)
        #expect(grid.firstWeekday == 6)
        #expect(grid.leadingBlanks == 6)
        #expect(grid.todayDay == 2)
        // Aug 2 2026 is a Sunday; Aug 8 the next Saturday.
        #expect(grid.weekday(of: 2) == 0)
        #expect(grid.weekday(of: 8) == 6)
        #expect(grid.weekday(of: 31) == 1)
        #expect(grid.monthParam == "2026-08")
        #expect(grid.titlePTBR == "Agosto 2026")
        #expect(grid.dayHeadingPTBR(2) == "Domingo, 2 de Agosto")
        #expect(grid.dayHeadingPTBR(15) == "Sábado, 15 de Agosto")
    }

    @Test("February 2026 (28 days, Sunday start) and the leap year 2028")
    func februaryEdges() {
        let grid = MonthGrid.current(now: date(2026, 2, 10), calendar: utcCalendar)
        #expect(grid.daysInMonth == 28)
        #expect(grid.firstWeekday == 0)
        #expect(grid.monthParam == "2026-02")

        let leap = MonthGrid.current(now: date(2028, 2, 1), calendar: utcCalendar)
        #expect(leap.daysInMonth == 29)
    }

    @Test("the day-pill default weekday maps Apple weekday to the contract 0=Sunday")
    func todayWeekday() {
        // Aug 2 2026 = Sunday; Aug 4 = Tuesday.
        #expect(AgendaWeekday.today(now: date(2026, 8, 2), calendar: utcCalendar) == 0)
        #expect(AgendaWeekday.today(now: date(2026, 8, 4), calendar: utcCalendar) == 2)
        #expect(AgendaWeekday.today(now: date(2026, 8, 8), calendar: utcCalendar) == 6)
    }

    @Test("grid header letters and names are the handoff fixed copy")
    func fixedNames() {
        #expect(MonthGrid.weekdayLettersPTBR == ["D", "S", "T", "Q", "Q", "S", "S"])
        #expect(MonthGrid.weekdayNamesPTBR.count == 7)
        #expect(MonthGrid.monthNamesPTBR.count == 12)
    }
}
