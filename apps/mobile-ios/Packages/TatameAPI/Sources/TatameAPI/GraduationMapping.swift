// Generated `Components.Schemas.*` → TatameCore graduation models (spec 005;
// same convention as AttendanceMapping: features never see generated types).

import Foundation
import TatameCore

private func uuid(_ raw: String, _ what: String) throws -> UUID {
    guard let id = UUID(uuidString: raw) else {
        throw ApiError.decoding(description: "invalid \(what): \(raw)")
    }
    return id
}

extension BeltView {
    init(dto: Components.Schemas.BeltViewDto) throws {
        self.init(
            beltId: try uuid(dto.beltId, "belt id"),
            name: dto.name,
            colorSlug: dto.colorSlug,
            tipColorSlug: dto.tipColorSlug,
            maxDegrees: Int(dto.maxDegrees),
            degrees: Int(dto.degrees)
        )
    }
}

extension BeltRef {
    init(dto: Components.Schemas.BeltRefDto) throws {
        self.init(
            beltId: try uuid(dto.beltId, "belt id"),
            name: dto.name,
            colorSlug: dto.colorSlug,
            tipColorSlug: dto.tipColorSlug,
            maxDegrees: Int(dto.maxDegrees)
        )
    }
}

extension NextMilestone {
    init(dto: Components.Schemas.NextMilestoneDto) {
        self.init(
            kind: Kind(rawValue: dto.kind.rawValue) ?? .degree,
            degree: dto.degree.map(Int.init)
        )
    }
}

extension GraduationProgress {
    init(dto: Components.Schemas.GraduationProgressDto) {
        self.init(
            current: Int(dto.current),
            target: Int(dto.target),
            label: dto.label,
            nextMilestone: NextMilestone(dto: dto.nextMilestone)
        )
    }
}

extension AlunoHomeGraduation {
    init(dto: Components.Schemas.AlunoHomeGraduationDto) throws {
        self.init(
            belt: try BeltView(dto: dto.belt),
            progress: GraduationProgress(dto: dto.progress)
        )
    }
}

extension GraduationActor {
    init(dto: Components.Schemas.GraduationActorDto) throws {
        self.init(userId: try uuid(dto.userId, "actor user id"), fullName: dto.fullName)
    }
}

extension GraduationEntry {
    init(dto: Components.Schemas.GraduationEntryDto) throws {
        self.init(
            id: try uuid(dto.id, "graduation id"),
            kind: GraduationKind(rawValue: dto.kind.rawValue) ?? .degree,
            belt: try BeltRef(dto: dto.belt),
            degree: Int(dto.degree),
            awardedAt: dto.awardedAt,
            awardedBy: try GraduationActor(dto: dto.awardedBy),
            notes: dto.notes,
            reversed: dto.reversed,
            reversesGraduationId: try dto.reversesGraduationId.map { try uuid($0, "reversed graduation id") },
            certificateAvailable: dto.certificateAvailable
        )
    }
}

extension AlunoGraduation {
    init(dto: Components.Schemas.AlunoGraduationResponseDto) throws {
        self.init(
            belt: try BeltView(dto: dto.belt.value1),
            progress: GraduationProgress(dto: dto.progress),
            timeline: try dto.timeline.map(GraduationEntry.init(dto:))
        )
    }
}

extension ValidGraduation {
    init(dto: Components.Schemas.ValidGraduationDto) throws {
        self.init(
            beltId: try uuid(dto.beltId, "belt id"),
            name: dto.name,
            colorSlug: dto.colorSlug,
            tipColorSlug: dto.tipColorSlug,
            maxDegrees: Int(dto.maxDegrees),
            ladderKind: LadderKind(rawValue: dto.ladderKind.rawValue) ?? .adult,
            enabled: dto.enabled
        )
    }
}

extension ProfessorProfile {
    init(dto: Components.Schemas.ProfessorProfileResponseDto) throws {
        self.init(
            professor: try GraduationActor(dto: dto.professor),
            belt: try dto.belt.map { try BeltView(dto: $0.value1) },
            validGraduations: try dto.validGraduations.map(ValidGraduation.init(dto:))
        )
    }
}

extension StudentNote {
    init(dto: Components.Schemas.StudentNoteDto) throws {
        self.init(
            id: try uuid(dto.id, "note id"),
            body: dto.body,
            createdAt: dto.createdAt,
            author: try GraduationActor(dto: dto.author)
        )
    }
}

extension ProfileStudent {
    init(dto: Components.Schemas.ProfileStudentDto) throws {
        self.init(
            id: try uuid(dto.id, "student id"),
            fullName: dto.fullName,
            birthDate: dto.birthDate,
            status: StudentStatus(rawValue: dto.status.rawValue) ?? .active,
            badge: RosterBadge(rawValue: dto.badge.rawValue) ?? .ativo
        )
    }
}

extension StudentProfile {
    init(dto: Components.Schemas.StudentProfileResponseDto) throws {
        self.init(
            student: try ProfileStudent(dto: dto.student),
            belt: try BeltView(dto: dto.belt),
            progress: GraduationProgress(dto: dto.progress),
            stats: AlunoStats(dto: dto.stats.value1),
            notes: try dto.notes.map(StudentNote.init(dto:))
        )
    }
}

extension AwardResult {
    init(dto: Components.Schemas.AwardGraduationResponseDto) throws {
        self.init(
            graduation: try GraduationEntry(dto: dto.graduation),
            belt: try BeltView(dto: dto.belt.value1)
        )
    }
}
