// Domain models for the attendance slice (spec 004-attendance, ATT.22-24).
// Mapped from the generated OpenAPI types inside TatameAPI — features only
// ever see these (ticket 02 convention).

import Foundation

/// How a presence was registered (shared contract enum).
public enum CheckinMethod: String, Sendable {
    case qr
    case code
    case manual
}

/// Stable duplicate state — clients render "Presença registrada", never an
/// error (spec 004 story 9).
public enum CheckinStatus: String, Sendable {
    case checkedIn = "checked_in"
    case alreadyCheckedIn = "already_checked_in"
}

/// Aluno stat tiles + graduation numerator. `streak` is nil when the academy
/// disabled `gamification.streak` — clients hide the tile and the pop line.
public struct AlunoStats: Sendable, Equatable {
    public let monthPresencePct: Double
    public let monthAttendedSessions: Int
    public let monthTotalSessions: Int
    public let streak: Int?
    public let totalLessons: Int

    public init(
        monthPresencePct: Double,
        monthAttendedSessions: Int,
        monthTotalSessions: Int,
        streak: Int?,
        totalLessons: Int
    ) {
        self.monthPresencePct = monthPresencePct
        self.monthAttendedSessions = monthAttendedSessions
        self.monthTotalSessions = monthTotalSessions
        self.streak = streak
        self.totalLessons = totalLessons
    }
}

/// Today's class on the aluno home hero — `checkedIn` flips the hero to the
/// "Presença registrada" chip state.
public struct AlunoTodayClass: Sendable, Equatable {
    public let classId: UUID
    public let className: String
    public let slot: ScheduleSlot
    public let checkedIn: Bool

    public init(classId: UUID, className: String, slot: ScheduleSlot, checkedIn: Bool) {
        self.classId = classId
        self.className = className
        self.slot = slot
        self.checkedIn = checkedIn
    }
}

/// GET /aluno/home payload.
public struct AlunoHome: Sendable, Equatable {
    public let studentId: UUID
    public let studentName: String
    public let todayClass: AlunoTodayClass?
    public let stats: AlunoStats
    /// Real graduation card payload (GRD.22) — nil only when the backend
    /// predates the graduation slice.
    public let graduation: AlunoHomeGraduation?

    public init(
        studentId: UUID,
        studentName: String,
        todayClass: AlunoTodayClass?,
        stats: AlunoStats,
        graduation: AlunoHomeGraduation? = nil
    ) {
        self.studentId = studentId
        self.studentName = studentName
        self.todayClass = todayClass
        self.stats = stats
        self.graduation = graduation
    }

    /// Copy with the hero flipped and the stats refreshed (post-check-in).
    /// A fresh check-in also bumps the graduation progress numerator (one
    /// more active lesson since the last award); duplicates don't.
    public func applying(_ result: CheckinResult) -> AlunoHome {
        let flipped = todayClass.map {
            AlunoTodayClass(classId: $0.classId, className: $0.className, slot: $0.slot, checkedIn: true)
        }
        let bumped = graduation.map { card in
            result.status == .checkedIn
                ? AlunoHomeGraduation(belt: card.belt, progress: card.progress.addingLesson())
                : card
        }
        return AlunoHome(
            studentId: studentId,
            studentName: studentName,
            todayClass: flipped,
            stats: result.stats,
            graduation: bumped
        )
    }
}

/// The attendance row a check-in produced (or found, on duplicate).
public struct AttendanceRef: Sendable, Equatable {
    public let id: UUID
    public let classSessionId: UUID
    public let method: CheckinMethod
    public let checkedInAt: Date

    public init(id: UUID, classSessionId: UUID, method: CheckinMethod, checkedInAt: Date) {
        self.id = id
        self.classSessionId = classSessionId
        self.method = method
        self.checkedInAt = checkedInAt
    }
}

/// The session a check-in landed on.
public struct CheckinSessionRef: Sendable, Equatable {
    public let id: UUID
    public let classId: UUID
    public let className: String
    /// ISO "yyyy-MM-dd".
    public let sessionDate: String

    public init(id: UUID, classId: UUID, className: String, sessionDate: String) {
        self.id = id
        self.classId = classId
        self.className = className
        self.sessionDate = sessionDate
    }
}

/// POST /aluno/checkins result — carries fresh stats so the success pop and
/// the home tiles update from one round trip (spec 004).
public struct CheckinResult: Sendable, Equatable {
    public let status: CheckinStatus
    public let attendance: AttendanceRef
    public let session: CheckinSessionRef
    public let stats: AlunoStats

    public init(status: CheckinStatus, attendance: AttendanceRef, session: CheckinSessionRef, stats: AlunoStats) {
        self.status = status
        self.attendance = attendance
        self.session = session
        self.stats = stats
    }
}

public enum ClassSessionStatus: String, Sendable {
    case scheduled
    case done
    case canceled
}

/// One materialized class occurrence (`class_sessions` row).
public struct LiveSession: Sendable, Equatable {
    public let id: UUID
    public let classId: UUID
    public let className: String
    /// ISO "yyyy-MM-dd".
    public let sessionDate: String
    public let startsAt: Date?
    public let status: ClassSessionStatus

    public init(
        id: UUID,
        classId: UUID,
        className: String,
        sessionDate: String,
        startsAt: Date?,
        status: ClassSessionStatus
    ) {
        self.id = id
        self.classId = classId
        self.className = className
        self.sessionDate = sessionDate
        self.startsAt = startsAt
        self.status = status
    }
}

/// The professor-opened chamada window: 4-digit code + opaque QR token.
public struct LiveCode: Sendable, Equatable, Identifiable {
    public let id: UUID
    /// The 4-digit human code.
    public let code: String
    /// Opaque token the QR encodes — never the digits.
    public let qrToken: String
    public let expiresAt: Date
    public let revokedAt: Date?
    public let session: LiveSession
    public let presentCount: Int

    public init(
        id: UUID,
        code: String,
        qrToken: String,
        expiresAt: Date,
        revokedAt: Date?,
        session: LiveSession,
        presentCount: Int
    ) {
        self.id = id
        self.code = code
        self.qrToken = qrToken
        self.expiresAt = expiresAt
        self.revokedAt = revokedAt
        self.session = session
        self.presentCount = presentCount
    }

    /// Active = not revoked and not expired at `now`.
    public func isActive(at now: Date = Date()) -> Bool {
        revokedAt == nil && expiresAt > now
    }
}

/// Short-lived signed SSE ticket (issue 09) — query-string credential for the
/// stream route only, never a session token.
public struct StreamTicket: Sendable, Equatable {
    public let ticket: String
    public let expiresInSeconds: Int

    public init(ticket: String, expiresInSeconds: Int) {
        self.ticket = ticket
        self.expiresInSeconds = expiresInSeconds
    }
}

/// One student on the live arriving list (id = attendance id).
public struct LiveAttendee: Sendable, Equatable, Identifiable {
    public let id: UUID
    public let studentId: UUID
    public let studentName: String
    public let method: CheckinMethod
    public let checkedInAt: Date

    public init(id: UUID, studentId: UUID, studentName: String, method: CheckinMethod, checkedInAt: Date) {
        self.id = id
        self.studentId = studentId
        self.studentName = studentName
        self.method = method
        self.checkedInAt = checkedInAt
    }
}

/// GET /professor/live-codes/:id/attendances — snapshot + polling target.
public struct LiveSnapshot: Sendable, Equatable {
    public let presentCount: Int
    public let codeId: UUID
    public let codeExpiresAt: Date
    public let codeRevokedAt: Date?
    /// Active rows only, oldest first.
    public let attendances: [LiveAttendee]

    public init(
        presentCount: Int,
        codeId: UUID,
        codeExpiresAt: Date,
        codeRevokedAt: Date?,
        attendances: [LiveAttendee]
    ) {
        self.presentCount = presentCount
        self.codeId = codeId
        self.codeExpiresAt = codeExpiresAt
        self.codeRevokedAt = codeRevokedAt
        self.attendances = attendances
    }
}

/// Named SSE events on the live-chamada stream (issue 09 contract).
public enum LiveStreamEvent: Sendable, Equatable {
    case checkin(LiveAttendee, presentCount: Int)
    case revoke(attendanceId: UUID, presentCount: Int)
}

/// A roster row's attendance state on the manual chamada. `recordedByUserId`
/// nil = self check-in; set = professor-recorded manual row.
public struct RollCallAttendance: Sendable, Equatable {
    public let id: UUID
    public let method: CheckinMethod
    public let checkedInAt: Date
    public let recordedByUserId: UUID?

    public init(id: UUID, method: CheckinMethod, checkedInAt: Date, recordedByUserId: UUID?) {
        self.id = id
        self.method = method
        self.checkedInAt = checkedInAt
        self.recordedByUserId = recordedByUserId
    }
}

/// One roster row on the manual chamada — self check-ins arrive pre-toggled.
public struct RollCallRow: Sendable, Equatable, Identifiable {
    public let studentId: UUID
    public let fullName: String
    public let attendance: RollCallAttendance?
    /// Derived current belt (GRD.6 belt exposure) — nil pre-graduation-slice.
    public let belt: BeltView?

    public var id: UUID { studentId }
    public var present: Bool { attendance != nil }

    public init(studentId: UUID, fullName: String, attendance: RollCallAttendance?, belt: BeltView? = nil) {
        self.studentId = studentId
        self.fullName = fullName
        self.attendance = attendance
        self.belt = belt
    }
}

/// POST /professor/classes/:id/roll-call payload.
public struct RollCall: Sendable, Equatable {
    public let session: LiveSession
    public let presentCount: Int
    public let roster: [RollCallRow]

    public init(session: LiveSession, presentCount: Int, roster: [RollCallRow]) {
        self.session = session
        self.presentCount = presentCount
        self.roster = roster
    }
}

/// Manual toggle-on result (duplicate mark is benign).
public struct MarkAttendanceResult: Sendable, Equatable {
    public let status: CheckinStatus
    public let attendanceId: UUID
    public let presentCount: Int

    public init(status: CheckinStatus, attendanceId: UUID, presentCount: Int) {
        self.status = status
        self.attendanceId = attendanceId
        self.presentCount = presentCount
    }
}

/// Same-day toggle-off result (a second toggle-off is benign).
public struct RevokeAttendanceResult: Sendable, Equatable {
    public enum Status: String, Sendable {
        case revoked
        case alreadyRevoked = "already_revoked"
    }

    public let status: Status
    public let attendanceId: UUID
    public let presentCount: Int

    public init(status: Status, attendanceId: UUID, presentCount: Int) {
        self.status = status
        self.attendanceId = attendanceId
        self.presentCount = presentCount
    }
}

/// Next-class hero on the professor dashboard.
public struct ProfessorNextClass: Sendable, Equatable {
    public let classId: UUID
    public let className: String
    public let slot: ScheduleSlot
    public let checkedInCount: Int

    public init(classId: UUID, className: String, slot: ScheduleSlot, checkedInCount: Int) {
        self.classId = classId
        self.className = className
        self.slot = slot
        self.checkedInCount = checkedInCount
    }
}

/// One of today's classes on the professor dashboard.
public struct ProfessorTodayClass: Sendable, Equatable, Identifiable {
    public let classId: UUID
    public let className: String
    public let slot: ScheduleSlot
    public let checkedInCount: Int
    public let enrolledCount: Int

    public var id: UUID { classId }

    public init(classId: UUID, className: String, slot: ScheduleSlot, checkedInCount: Int, enrolledCount: Int) {
        self.classId = classId
        self.className = className
        self.slot = slot
        self.checkedInCount = checkedInCount
        self.enrolledCount = enrolledCount
    }
}

/// GET /professor/dashboard payload (spec 004 stories 34-36).
public struct ProfessorDashboard: Sendable, Equatable {
    public let alunosHoje: Int
    public let presencaMediaPct: Double
    public let nextClass: ProfessorNextClass?
    public let todayClasses: [ProfessorTodayClass]

    public init(
        alunosHoje: Int,
        presencaMediaPct: Double,
        nextClass: ProfessorNextClass?,
        todayClasses: [ProfessorTodayClass]
    ) {
        self.alunosHoje = alunosHoje
        self.presencaMediaPct = presencaMediaPct
        self.nextClass = nextClass
        self.todayClasses = todayClasses
    }
}
