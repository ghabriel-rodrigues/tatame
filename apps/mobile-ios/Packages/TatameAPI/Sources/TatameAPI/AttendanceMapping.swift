// Generated `Components.Schemas.*` → TatameCore attendance models (spec 004;
// same convention as EnrollmentMapping: features never see generated types).

import Foundation
import TatameCore

private func uuid(_ raw: String, _ what: String) throws -> UUID {
    guard let id = UUID(uuidString: raw) else {
        throw ApiError.decoding(description: "invalid \(what): \(raw)")
    }
    return id
}

extension AlunoStats {
    init(dto: Components.Schemas.AlunoStatsDto) {
        self.init(
            monthPresencePct: dto.monthPresencePct,
            monthAttendedSessions: Int(dto.monthAttendedSessions),
            monthTotalSessions: Int(dto.monthTotalSessions),
            streak: dto.streak.map(Int.init),
            totalLessons: Int(dto.totalLessons)
        )
    }
}

extension AlunoTodayClass {
    init(dto: Components.Schemas.AlunoTodayClassDto) throws {
        self.init(
            classId: try uuid(dto.classId, "class id"),
            className: dto.className,
            slot: ScheduleSlot(dto: dto.slot),
            checkedIn: dto.checkedIn
        )
    }
}

extension AlunoHome {
    init(dto: Components.Schemas.AlunoHomeResponseDto) throws {
        self.init(
            studentId: try uuid(dto.student.id, "student id"),
            studentName: dto.student.fullName,
            todayClass: try dto.todayClass.map { try AlunoTodayClass(dto: $0.value1) },
            stats: AlunoStats(dto: dto.stats),
            graduation: try dto.graduation.map { try AlunoHomeGraduation(dto: $0.value1) },
            mensalidade: try dto.mensalidade.map { try MensalidadeAlert(dto: $0.value1) },
            upcomingEvents: try dto.upcomingEvents.map(EventListItem.init(dto:))
        )
    }
}

extension AttendanceRef {
    init(dto: Components.Schemas.AttendanceRefDto) throws {
        self.init(
            id: try uuid(dto.id, "attendance id"),
            classSessionId: try uuid(dto.classSessionId, "session id"),
            method: CheckinMethod(rawValue: dto.method.rawValue) ?? .manual,
            checkedInAt: dto.checkedInAt
        )
    }
}

extension CheckinSessionRef {
    init(dto: Components.Schemas.CheckinSessionRefDto) throws {
        self.init(
            id: try uuid(dto.id, "session id"),
            classId: try uuid(dto.classId, "class id"),
            className: dto.className,
            sessionDate: dto.sessionDate
        )
    }
}

extension CheckinResult {
    init(dto: Components.Schemas.CheckinResponseDto) throws {
        self.init(
            status: CheckinStatus(rawValue: dto.status.rawValue) ?? .checkedIn,
            attendance: try AttendanceRef(dto: dto.attendance),
            session: try CheckinSessionRef(dto: dto.session),
            stats: AlunoStats(dto: dto.stats.value1)
        )
    }
}

extension LiveSession {
    init(dto: Components.Schemas.LiveSessionDto) throws {
        self.init(
            id: try uuid(dto.id, "session id"),
            classId: try uuid(dto.classId, "class id"),
            className: dto.className,
            sessionDate: dto.sessionDate,
            startsAt: dto.startsAt,
            status: ClassSessionStatus(rawValue: dto.status.rawValue) ?? .scheduled
        )
    }
}

extension LiveCode {
    init(dto: Components.Schemas.LiveCodeResponseDto) throws {
        self.init(
            id: try uuid(dto.id, "live code id"),
            code: dto.code,
            qrToken: dto.qrToken,
            expiresAt: dto.expiresAt,
            revokedAt: dto.revokedAt,
            session: try LiveSession(dto: dto.session),
            presentCount: Int(dto.presentCount)
        )
    }
}

extension StreamTicket {
    init(dto: Components.Schemas.StreamTicketResponseDto) {
        self.init(ticket: dto.ticket, expiresInSeconds: Int(dto.expiresInSeconds))
    }
}

extension LiveAttendee {
    init(dto: Components.Schemas.SnapshotAttendanceDto) throws {
        self.init(
            id: try uuid(dto.id, "attendance id"),
            studentId: try uuid(dto.studentId, "student id"),
            studentName: dto.studentName,
            method: CheckinMethod(rawValue: dto.method.rawValue) ?? .manual,
            checkedInAt: dto.checkedInAt
        )
    }
}

extension LiveSnapshot {
    init(dto: Components.Schemas.LiveSnapshotResponseDto) throws {
        self.init(
            presentCount: Int(dto.presentCount),
            codeId: try uuid(dto.code.id, "live code id"),
            codeExpiresAt: dto.code.expiresAt,
            codeRevokedAt: dto.code.revokedAt,
            attendances: try dto.attendances.map(LiveAttendee.init(dto:))
        )
    }
}

extension RollCallAttendance {
    init(dto: Components.Schemas.RosterAttendanceDto) throws {
        self.init(
            id: try uuid(dto.id, "attendance id"),
            method: CheckinMethod(rawValue: dto.method.rawValue) ?? .manual,
            checkedInAt: dto.checkedInAt,
            recordedByUserId: try dto.recordedByUserId.map { try uuid($0, "recorded-by id") }
        )
    }
}

extension RollCallRow {
    init(dto: Components.Schemas.RosterRowDto) throws {
        self.init(
            studentId: try uuid(dto.studentId, "student id"),
            fullName: dto.fullName,
            attendance: try dto.attendance.map { try RollCallAttendance(dto: $0.value1) },
            belt: try dto.belt.map { try BeltView(dto: $0.value1) }
        )
    }
}

extension RollCall {
    init(dto: Components.Schemas.RollCallResponseDto) throws {
        self.init(
            session: try LiveSession(dto: dto.session),
            presentCount: Int(dto.presentCount),
            roster: try dto.roster.map(RollCallRow.init(dto:))
        )
    }
}

extension MarkAttendanceResult {
    init(dto: Components.Schemas.MarkAttendanceResponseDto) throws {
        self.init(
            status: CheckinStatus(rawValue: dto.status.rawValue) ?? .checkedIn,
            attendanceId: try uuid(dto.attendance.id, "attendance id"),
            presentCount: Int(dto.presentCount)
        )
    }
}

extension RevokeAttendanceResult {
    init(dto: Components.Schemas.RevokeAttendanceResponseDto) throws {
        self.init(
            status: Status(rawValue: dto.status.rawValue) ?? .revoked,
            attendanceId: try uuid(dto.attendanceId, "attendance id"),
            presentCount: Int(dto.presentCount)
        )
    }
}

extension ProfessorNextClass {
    init(dto: Components.Schemas.ProfessorNextClassDto) throws {
        self.init(
            classId: try uuid(dto.classId, "class id"),
            className: dto.className,
            slot: ScheduleSlot(dto: dto.slot),
            checkedInCount: Int(dto.checkedInCount)
        )
    }
}

extension ProfessorTodayClass {
    init(dto: Components.Schemas.ProfessorTodayClassDto) throws {
        self.init(
            classId: try uuid(dto.classId, "class id"),
            className: dto.className,
            slot: ScheduleSlot(dto: dto.slot),
            checkedInCount: Int(dto.checkedInCount),
            enrolledCount: Int(dto.enrolledCount)
        )
    }
}

extension ProfessorDashboard {
    init(dto: Components.Schemas.ProfessorDashboardResponseDto) throws {
        self.init(
            alunosHoje: Int(dto.alunosHoje),
            presencaMediaPct: dto.presencaMediaPct,
            nextClass: try dto.nextClass.map { try ProfessorNextClass(dto: $0.value1) },
            todayClasses: try dto.todayClasses.map(ProfessorTodayClass.init(dto:)),
            upcomingEventsCount: Int(dto.upcomingEventsCount),
            upcomingEvents: try dto.upcomingEvents.map(ProfessorUpcomingEvent.init(dto:))
        )
    }
}

extension RosterStudent {
    /// GET /professor/students rows feed the same picker UI the roster rows
    /// use — same shape by contract design.
    init(dto: Components.Schemas.ProfessorStudentDto) throws {
        self.init(
            studentId: try uuid(dto.id, "student id"),
            fullName: dto.fullName,
            birthDate: dto.birthDate,
            badge: RosterBadge(rawValue: dto.badge.rawValue) ?? .ativo,
            belt: try dto.belt.map { try BeltView(dto: $0.value1) }
        )
    }
}
