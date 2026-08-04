// Generated `Components.Schemas.*` → TatameCore enrollment models (spec 003;
// same convention as DomainMapping: features never see generated types).

import Foundation
import TatameCore

extension ScheduleSlot {
    init(dto: Components.Schemas.ScheduleSlotViewDto) {
        self.init(
            weekday: Int(dto.weekday),
            startTime: dto.startTime,
            durationMinutes: Int(dto.durationMinutes)
        )
    }
}

extension ClassProfessor {
    init(dto: Components.Schemas.ClassProfessorDto) throws {
        guard let userId = UUID(uuidString: dto.userId) else {
            throw ApiError.decoding(description: "invalid professor user id: \(dto.userId)")
        }
        self.init(userId: userId, fullName: dto.fullName)
    }
}

extension ClassSummary {
    init(dto: Components.Schemas.ClassListItemDto) throws {
        guard let id = UUID(uuidString: dto.id) else {
            throw ApiError.decoding(description: "invalid class id: \(dto.id)")
        }
        self.init(
            id: id,
            name: dto.name,
            status: ClassStatus(rawValue: dto.status.rawValue) ?? .active,
            capacity: Int(dto.capacity),
            occupancy: Int(dto.occupancy),
            lotada: dto.lotada,
            ageMin: dto.ageMin.map(Int.init),
            ageMax: dto.ageMax.map(Int.init),
            professor: try ClassProfessor(dto: dto.professor),
            schedules: dto.schedules.map(ScheduleSlot.init(dto:))
        )
    }

    init(dto: Components.Schemas.ClassDetailDto) throws {
        guard let id = UUID(uuidString: dto.id) else {
            throw ApiError.decoding(description: "invalid class id: \(dto.id)")
        }
        self.init(
            id: id,
            name: dto.name,
            status: ClassStatus(rawValue: dto.status.rawValue) ?? .active,
            capacity: Int(dto.capacity),
            occupancy: Int(dto.occupancy),
            lotada: dto.lotada,
            ageMin: dto.ageMin.map(Int.init),
            ageMax: dto.ageMax.map(Int.init),
            professor: try ClassProfessor(dto: dto.professor),
            schedules: dto.schedules.map(ScheduleSlot.init(dto:))
        )
    }
}

extension RosterStudent {
    init(dto: Components.Schemas.RosterStudentDto) throws {
        guard let studentId = UUID(uuidString: dto.studentId) else {
            throw ApiError.decoding(description: "invalid student id: \(dto.studentId)")
        }
        self.init(
            studentId: studentId,
            fullName: dto.fullName,
            birthDate: dto.birthDate,
            badge: RosterBadge(rawValue: dto.badge.rawValue) ?? .ativo
        )
    }
}

extension ClassDetail {
    init(dto: Components.Schemas.ClassDetailDto) throws {
        self.init(
            summary: try ClassSummary(dto: dto),
            roster: try dto.roster.map(RosterStudent.init(dto:))
        )
    }
}

extension EnrollmentResult {
    init(dto: Components.Schemas.EnrollmentResultDto) throws {
        guard let classId = UUID(uuidString: dto.classId), let studentId = UUID(uuidString: dto.studentId) else {
            throw ApiError.decoding(description: "invalid enrollment ids")
        }
        self.init(
            classId: classId,
            studentId: studentId,
            status: Status(rawValue: dto.status.rawValue) ?? .active
        )
    }
}

extension DependentClass {
    init(dto: Components.Schemas.DependentClassDto) throws {
        guard let id = UUID(uuidString: dto.id) else {
            throw ApiError.decoding(description: "invalid class id: \(dto.id)")
        }
        self.init(
            id: id,
            name: dto.name,
            schedules: dto.schedules.map(ScheduleSlot.init(dto:)),
            nextSlot: dto.nextSlot.map { ScheduleSlot(dto: $0.value1) }
        )
    }
}

extension Dependent {
    init(dto: Components.Schemas.DependentDetailDto) throws {
        guard let id = UUID(uuidString: dto.id) else {
            throw ApiError.decoding(description: "invalid dependent id: \(dto.id)")
        }
        self.init(
            id: id,
            fullName: dto.fullName,
            birthDate: dto.birthDate,
            status: StudentStatus(rawValue: dto.status.rawValue) ?? .active,
            enrolledClass: try dto._class.map { try DependentClass(dto: $0.value1) }
        )
    }
}

extension ClassSuggestion {
    init(dto: Components.Schemas.ClassSuggestionDto) throws {
        guard let id = UUID(uuidString: dto.id) else {
            throw ApiError.decoding(description: "invalid class id: \(dto.id)")
        }
        self.init(
            id: id,
            name: dto.name,
            ageMin: dto.ageMin.map(Int.init),
            ageMax: dto.ageMax.map(Int.init),
            capacity: Int(dto.capacity),
            occupancy: Int(dto.occupancy),
            schedules: dto.schedules.map(ScheduleSlot.init(dto:))
        )
    }
}
