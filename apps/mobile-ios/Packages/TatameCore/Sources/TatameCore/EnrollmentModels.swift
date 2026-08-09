// Domain models for the enrollment slice (spec 003-enrollment, ENR.24-26).
// Mapped from the generated OpenAPI types inside TatameAPI — features only
// ever see these (ticket 02 convention from the auth slice).

import Foundation

/// One recurring weekly slot of a turma (`class_schedules` row).
public struct ScheduleSlot: Sendable, Equatable {
    /// 0 = Sunday … 6 = Saturday (shared contract).
    public let weekday: Int
    /// "HH:mm".
    public let startTime: String
    public let durationMinutes: Int

    public init(weekday: Int, startTime: String, durationMinutes: Int) {
        self.weekday = weekday
        self.startTime = startTime
        self.durationMinutes = durationMinutes
    }
}

/// The professor teaching a turma.
public struct ClassProfessor: Sendable, Equatable {
    public let userId: UUID
    public let fullName: String

    public init(userId: UUID, fullName: String) {
        self.userId = userId
        self.fullName = fullName
    }
}

public enum ClassStatus: String, Sendable {
    case active
    case archived
}

/// Turma list item (professor "Minhas turmas") — occupancy and `lotada` are
/// server-derived; clients never compute them (spec 003).
public struct ClassSummary: Sendable, Equatable, Identifiable {
    public let id: UUID
    public let name: String
    public let status: ClassStatus
    public let capacity: Int
    public let occupancy: Int
    public let lotada: Bool
    public let ageMin: Int?
    public let ageMax: Int?
    public let professor: ClassProfessor
    public let schedules: [ScheduleSlot]

    public init(
        id: UUID,
        name: String,
        status: ClassStatus,
        capacity: Int,
        occupancy: Int,
        lotada: Bool,
        ageMin: Int?,
        ageMax: Int?,
        professor: ClassProfessor,
        schedules: [ScheduleSlot]
    ) {
        self.id = id
        self.name = name
        self.status = status
        self.capacity = capacity
        self.occupancy = occupancy
        self.lotada = lotada
        self.ageMin = ageMin
        self.ageMax = ageMax
        self.professor = professor
        self.schedules = schedules
    }
}

/// Ativo/Pendente badge on a roster row (derived server-side: pendente =
/// record not yet claimed by a login).
public enum RosterBadge: String, Sendable {
    case ativo
    case pendente
}

/// One enrolled student on a turma roster.
public struct RosterStudent: Sendable, Equatable, Identifiable {
    public let studentId: UUID
    public let fullName: String
    /// ISO "yyyy-MM-dd".
    public let birthDate: String
    public let badge: RosterBadge
    /// Derived current belt (GRD.6 belt exposure) — nil pre-graduation-slice.
    public let belt: BeltView?

    public var id: UUID { studentId }

    public init(
        studentId: UUID,
        fullName: String,
        birthDate: String,
        badge: RosterBadge,
        belt: BeltView? = nil
    ) {
        self.studentId = studentId
        self.fullName = fullName
        self.birthDate = birthDate
        self.badge = badge
        self.belt = belt
    }
}

/// Turma detail: summary + active roster.
public struct ClassDetail: Sendable, Equatable {
    public let summary: ClassSummary
    public let roster: [RosterStudent]

    public init(summary: ClassSummary, roster: [RosterStudent]) {
        self.summary = summary
        self.roster = roster
    }
}

/// Result of a roster add/remove mutation.
public struct EnrollmentResult: Sendable, Equatable {
    public enum Status: String, Sendable {
        case active
        case removed
    }

    public let classId: UUID
    public let studentId: UUID
    public let status: Status

    public init(classId: UUID, studentId: UUID, status: Status) {
        self.classId = classId
        self.studentId = studentId
        self.status = status
    }
}

/// The active class a dependent is enrolled in, with its schedule and the
/// server-derived next slot.
public struct DependentClass: Sendable, Equatable {
    public let id: UUID
    public let name: String
    public let schedules: [ScheduleSlot]
    public let nextSlot: ScheduleSlot?

    public init(id: UUID, name: String, schedules: [ScheduleSlot], nextSlot: ScheduleSlot?) {
        self.id = id
        self.name = name
        self.schedules = schedules
        self.nextSlot = nextSlot
    }
}

public enum StudentStatus: String, Sendable {
    case active
    case inactive
}

/// One child on the responsável dependents panel.
public struct Dependent: Sendable, Equatable, Identifiable {
    public let id: UUID
    public let fullName: String
    /// ISO "yyyy-MM-dd".
    public let birthDate: String
    public let status: StudentStatus
    /// Nil when the child is registered but not enrolled (full grid, story 34).
    public let enrolledClass: DependentClass?
    /// Derived current belt (GRD.6, story 34) — the dependent-card BeltBar.
    public let belt: BeltView?

    public init(
        id: UUID,
        fullName: String,
        birthDate: String,
        status: StudentStatus,
        enrolledClass: DependentClass?,
        belt: BeltView? = nil
    ) {
        self.id = id
        self.fullName = fullName
        self.birthDate = birthDate
        self.status = status
        self.enrolledClass = enrolledClass
        self.belt = belt
    }
}

/// POST /responsavel/dependents result — `enrolled` is false when no class
/// was accepted or the accepted class filled up meanwhile (story 34).
public struct RegisteredDependent: Sendable, Equatable {
    public let dependent: Dependent
    public let enrolled: Bool

    public init(dependent: Dependent, enrolled: Bool) {
        self.dependent = dependent
        self.enrolled = enrolled
    }
}

/// Age-suggested class for the cadastrar-filho sheet (server-side rule).
public struct ClassSuggestion: Sendable, Equatable {
    public let id: UUID
    public let name: String
    public let ageMin: Int?
    public let ageMax: Int?
    public let capacity: Int
    public let occupancy: Int
    public let schedules: [ScheduleSlot]

    public init(
        id: UUID,
        name: String,
        ageMin: Int?,
        ageMax: Int?,
        capacity: Int,
        occupancy: Int,
        schedules: [ScheduleSlot]
    ) {
        self.id = id
        self.name = name
        self.ageMin = ageMin
        self.ageMax = ageMax
        self.capacity = capacity
        self.occupancy = occupancy
        self.schedules = schedules
    }
}
