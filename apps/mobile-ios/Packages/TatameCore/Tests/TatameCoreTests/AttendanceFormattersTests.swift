import Foundation
import Testing
@testable import TatameCore

@Suite("Attendance PT-BR formatters & model helpers")
struct AttendanceFormattersTests {
    @Test("countdown renders mm:ss, folding hours and clamping at zero")
    func countdown() {
        let now = Date(timeIntervalSince1970: 1_000_000)
        #expect(AttendanceFormatters.countdown(until: now.addingTimeInterval(582), from: now) == "09:42")
        #expect(AttendanceFormatters.countdown(until: now.addingTimeInterval(3_700), from: now) == "61:40")
        #expect(AttendanceFormatters.countdown(until: now.addingTimeInterval(5), from: now) == "00:05")
        #expect(AttendanceFormatters.countdown(until: now.addingTimeInterval(-10), from: now) == "00:00")
    }

    @Test("streak line renders the ordinal and hides when gamification is off")
    func streakLine() {
        #expect(
            AttendanceFormatters.streakLinePTBR(streak: 7)
                == "Essa é a sua 7ª aula seguida. Bom treino!"
        )
        #expect(AttendanceFormatters.streakLinePTBR(streak: nil) == nil)
        #expect(AttendanceFormatters.streakLinePTBR(streak: 0) == nil)
    }

    @Test("presentes header pluralizes")
    func presentesLabel() {
        #expect(AttendanceFormatters.presentesLabelPTBR(present: 3, total: 14) == "3 presentes de 14")
        #expect(AttendanceFormatters.presentesLabelPTBR(present: 1, total: 14) == "1 presente de 14")
        #expect(AttendanceFormatters.presentesLabelPTBR(present: 0, total: 3) == "0 presentes de 3")
    }

    @Test("live counter pluralizes (professor-03 copy)")
    func liveCounter() {
        #expect(AttendanceFormatters.liveCounterLabelPTBR(6) == "6 alunos já registraram presença")
        #expect(AttendanceFormatters.liveCounterLabelPTBR(1) == "1 aluno já registrou presença")
    }

    @Test("hero chip and sheet range use the slot times")
    func todayLabels() {
        let slot = ScheduleSlot(weekday: 6, startTime: "10:00", durationMinutes: 120)
        #expect(AttendanceFormatters.todayChipPTBR(slot: slot) == "Hoje às 10:00")
        #expect(AttendanceFormatters.todayRangePTBR(slot: slot) == "Hoje, 10:00 – 12:00")
        let malformed = ScheduleSlot(weekday: 1, startTime: "bad", durationMinutes: 60)
        #expect(AttendanceFormatters.todayRangePTBR(slot: malformed) == "Hoje, bad")
    }

    @Test("percent label rounds")
    func percent() {
        #expect(AttendanceFormatters.percentLabel(86.4) == "86%")
        #expect(AttendanceFormatters.percentLabel(85.5) == "86%")
        #expect(AttendanceFormatters.percentLabel(0) == "0%")
    }

    @Test("greeting follows the hour")
    func greeting() {
        #expect(AttendanceFormatters.greetingPTBR(hour: 8) == "Bom dia")
        #expect(AttendanceFormatters.greetingPTBR(hour: 15) == "Boa tarde")
        #expect(AttendanceFormatters.greetingPTBR(hour: 21) == "Boa noite")
        #expect(AttendanceFormatters.greetingPTBR(hour: 3) == "Boa noite")
    }

    @Test("first name extraction")
    func firstName() {
        #expect(AttendanceFormatters.firstName("Lucas Almeida") == "Lucas")
        #expect(AttendanceFormatters.firstName("Cher") == "Cher")
    }

    @Test("applying a check-in flips the hero and swaps the stats")
    func homeApplying() {
        let classId = UUID()
        let slot = ScheduleSlot(weekday: 6, startTime: "10:00", durationMinutes: 120)
        let home = AlunoHome(
            studentId: UUID(),
            studentName: "Lucas Almeida",
            todayClass: AlunoTodayClass(classId: classId, className: "Open mat", slot: slot, checkedIn: false),
            stats: AlunoStats(
                monthPresencePct: 86,
                monthAttendedSessions: 12,
                monthTotalSessions: 14,
                streak: 6,
                totalLessons: 25
            )
        )
        let fresh = AlunoStats(
            monthPresencePct: 88,
            monthAttendedSessions: 13,
            monthTotalSessions: 14,
            streak: 7,
            totalLessons: 26
        )
        let result = CheckinResult(
            status: .checkedIn,
            attendance: AttendanceRef(id: UUID(), classSessionId: UUID(), method: .qr, checkedInAt: Date()),
            session: CheckinSessionRef(id: UUID(), classId: classId, className: "Open mat", sessionDate: "2026-08-03"),
            stats: fresh
        )

        let updated = home.applying(result)

        #expect(updated.todayClass?.checkedIn == true)
        #expect(updated.todayClass?.className == "Open mat")
        #expect(updated.stats == fresh)
        #expect(updated.studentName == home.studentName)
    }

    @Test("live code activity window (revoked or expired = inactive)")
    func liveCodeActivity() {
        let now = Date(timeIntervalSince1970: 2_000_000)
        let session = LiveSession(
            id: UUID(),
            classId: UUID(),
            className: "Open mat",
            sessionDate: "2026-08-03",
            startsAt: nil,
            status: .scheduled
        )
        func code(expires: TimeInterval, revoked: Bool) -> LiveCode {
            LiveCode(
                id: UUID(),
                code: "4729",
                qrToken: "t",
                expiresAt: now.addingTimeInterval(expires),
                revokedAt: revoked ? now.addingTimeInterval(-1) : nil,
                session: session,
                presentCount: 0
            )
        }
        #expect(code(expires: 60, revoked: false).isActive(at: now))
        #expect(!code(expires: -1, revoked: false).isActive(at: now))
        #expect(!code(expires: 60, revoked: true).isActive(at: now))
    }
}
