import Foundation
import Testing
@testable import TatameCore

@Suite("Enrollment PT-BR formatters")
struct EnrollmentFormattersTests {
    private func slot(_ weekday: Int, _ start: String = "19:00", minutes: Int = 90) -> ScheduleSlot {
        ScheduleSlot(weekday: weekday, startTime: start, durationMinutes: minutes)
    }

    @Test("schedule line matches the handoff card form")
    func scheduleLine() {
        let slots = [slot(1), slot(3), slot(5)]
        #expect(slots.scheduleLinePTBR == "Seg · Qua · Sex 19:00 – 20:30")
        #expect([ScheduleSlot]().scheduleLinePTBR == "Sem horário definido")
    }

    @Test("suggestion line matches the handoff chip form")
    func suggestionLine() {
        let slots = [slot(2, "18:00", minutes: 45), slot(4, "18:00", minutes: 45)]
        #expect(slots.suggestionLinePTBR == "Ter e Qui 18:00")
        #expect([slot(6, "10:00")].suggestionLinePTBR == "Sáb 10:00")
    }

    @Test("end time wraps within the day and rejects malformed input")
    func endTime() {
        #expect(slot(1, "19:00", minutes: 60).endTime == "20:00")
        #expect(slot(1, "23:30", minutes: 60).endTime == "00:30")
        #expect(slot(1, "xx", minutes: 60).endTime == nil)
    }

    @Test("occupancy and age chips match the handoff copy")
    func chips() {
        let kids = ClassSummary(
            id: UUID(),
            name: "Kids",
            status: .active,
            capacity: 16,
            occupancy: 14,
            lotada: false,
            ageMin: 4,
            ageMax: 12,
            professor: ClassProfessor(userId: UUID(), fullName: "Carlos"),
            schedules: []
        )
        #expect(kids.occupancyLabelPTBR == "14 de 16 vagas")
        #expect(kids.ageRangeLabelPTBR == "4 a 12 anos")
        #expect(abs(kids.occupancyFraction - 14.0 / 16.0) < 0.0001)
    }

    @Test("BR date entry converts to ISO only when complete and real")
    func brToISO() {
        #expect(BirthDates.isoFromBR("10/06/2017") == "2017-06-10")
        #expect(BirthDates.isoFromBR("10062017") == "2017-06-10")
        #expect(BirthDates.isoFromBR("10/06/20") == nil)
        #expect(BirthDates.isoFromBR("31/02/2017") == nil)
        #expect(BirthDates.isoFromBR("") == nil)
    }

    @Test("age labels pluralize in PT-BR")
    func ageLabels() {
        let now = Calendar(identifier: .gregorian).date(from: DateComponents(year: 2026, month: 8, day: 3))!
        #expect(BirthDates.ageLabelPTBR(fromISO: "2017-06-10", now: now) == "9 anos")
        #expect(BirthDates.ageLabelPTBR(fromISO: "2025-01-10", now: now) == "1 ano")
        #expect(BirthDates.ageLabelPTBR(fromISO: "not-a-date", now: now) == nil)
    }

    @Test("initials follow the handoff avatar form")
    func initials() {
        #expect(NameInitials.from("Lucas Almeida") == "LA")
        #expect(NameInitials.from("Bia de Andrade") == "BA")
        #expect(NameInitials.from("Cher") == "C")
    }

    @Test("next-slot tile label matches the handoff")
    func nextSlotLabel() {
        #expect(slot(2, "18:00").nextSlotLabelPTBR == "Ter 18:00")
    }
}

@Suite("SessionContext permissions")
struct SessionContextPermissionsTests {
    @Test("absent keys resolve to the given default; present keys win")
    func permissionResolution() {
        let membership = Membership(
            id: UUID(),
            type: .academy,
            role: .guardian,
            tenantId: UUID(),
            academyName: "Horizonte BJJ",
            academyStatus: .active,
            status: "active"
        )
        let user = UserSummary(id: UUID(), email: "x@tatame.dev", fullName: "X")
        let hydrated = SessionContext(
            user: user,
            memberships: [membership],
            activeMembership: membership,
            permissions: [PermissionKey.dependentsRegister: false]
        )
        let fresh = SessionContext(user: user, memberships: [membership], activeMembership: membership)

        #expect(!hydrated.permission(PermissionKey.dependentsRegister, default: true))
        #expect(fresh.permission(PermissionKey.dependentsRegister, default: true))
        #expect(fresh.permissions.isEmpty)
    }
}
