// Domain models for the graduation slice (spec 005-graduation, GRD.21-23).
// Mapped from the generated OpenAPI types inside TatameAPI — features only
// ever see these (ticket 02 convention). Belts are keyed by design-token
// slugs (never hex) and components never switch on belt names.

import Foundation

/// The derived current belt of a student (shared `BeltViewDto` payload):
/// catalog identity + design-token slugs + current degrees.
public struct BeltView: Sendable, Equatable {
    public let beltId: UUID
    /// PT-BR display name from the catalog ("Azul").
    public let name: String
    /// Design-token slug ("belt.blue") — never hex.
    public let colorSlug: String
    /// Ponteira override slug; nil = default `belt.tip`.
    public let tipColorSlug: String?
    /// 0 = no degree stripes (red belt in v1).
    public let maxDegrees: Int
    /// Current degrees on this belt (0 after a belt promotion).
    public let degrees: Int

    public init(
        beltId: UUID,
        name: String,
        colorSlug: String,
        tipColorSlug: String?,
        maxDegrees: Int,
        degrees: Int
    ) {
        self.beltId = beltId
        self.name = name
        self.colorSlug = colorSlug
        self.tipColorSlug = tipColorSlug
        self.maxDegrees = maxDegrees
        self.degrees = degrees
    }
}

/// Catalog belt reference without a degree count (timeline entries).
public struct BeltRef: Sendable, Equatable {
    public let beltId: UUID
    public let name: String
    public let colorSlug: String
    public let tipColorSlug: String?
    public let maxDegrees: Int

    public init(beltId: UUID, name: String, colorSlug: String, tipColorSlug: String?, maxDegrees: Int) {
        self.beltId = beltId
        self.name = name
        self.colorSlug = colorSlug
        self.tipColorSlug = tipColorSlug
        self.maxDegrees = maxDegrees
    }
}

/// What the progress bar points at: the next degree or the next belt.
public struct NextMilestone: Sendable, Equatable {
    public enum Kind: String, Sendable {
        case degree
        case belt
    }

    public let kind: Kind
    /// The degree the bar points at; nil when the milestone is the next belt.
    public let degree: Int?

    public init(kind: Kind, degree: Int?) {
        self.kind = kind
        self.degree = degree
    }
}

/// Progress toward the next milestone: active lessons since the last award
/// against the academy's lessons-per-degree rule (server-derived).
public struct GraduationProgress: Sendable, Equatable {
    public let current: Int
    public let target: Int
    /// PT-BR convenience label ("Próximo 3º grau" / "Próxima faixa").
    public let label: String
    public let nextMilestone: NextMilestone

    public init(current: Int, target: Int, label: String, nextMilestone: NextMilestone) {
        self.current = current
        self.target = target
        self.label = label
        self.nextMilestone = nextMilestone
    }

    /// Bar fill fraction, clamped to 0...1 (0 when the target is degenerate).
    public var fraction: Double {
        guard target > 0 else { return 0 }
        return min(1, max(0, Double(current) / Double(target)))
    }

    /// Copy with one more counted lesson (post-check-in optimistic bump —
    /// a new active attendance after the last award counts toward progress).
    public func addingLesson() -> GraduationProgress {
        GraduationProgress(current: current + 1, target: target, label: label, nextMilestone: nextMilestone)
    }
}

/// The aluno-home graduation card payload (GRD.22 — real target).
public struct AlunoHomeGraduation: Sendable, Equatable {
    public let belt: BeltView
    public let progress: GraduationProgress

    public init(belt: BeltView, progress: GraduationProgress) {
        self.belt = belt
        self.progress = progress
    }
}

/// Who awarded a graduation / wrote a note.
public struct GraduationActor: Sendable, Equatable {
    public let userId: UUID
    public let fullName: String

    public init(userId: UUID, fullName: String) {
        self.userId = userId
        self.fullName = fullName
    }
}

public enum GraduationKind: String, Sendable {
    case degree
    case belt
    case revocation
}

/// One "Histórico de evolução" entry (append-only history row).
public struct GraduationEntry: Sendable, Equatable, Identifiable {
    public let id: UUID
    public let kind: GraduationKind
    public let belt: BeltRef
    /// 0 on belt promotions and revocations.
    public let degree: Int
    public let awardedAt: Date
    public let awardedBy: GraduationActor
    public let notes: String?
    /// Award reversed by a later revocation compensation row.
    public let reversed: Bool
    /// Set on revocation rows.
    public let reversesGraduationId: UUID?
    /// Render-only "Ver certificado" placeholder — non-reversed belt awards.
    public let certificateAvailable: Bool

    public init(
        id: UUID,
        kind: GraduationKind,
        belt: BeltRef,
        degree: Int,
        awardedAt: Date,
        awardedBy: GraduationActor,
        notes: String?,
        reversed: Bool,
        reversesGraduationId: UUID?,
        certificateAvailable: Bool
    ) {
        self.id = id
        self.kind = kind
        self.belt = belt
        self.degree = degree
        self.awardedAt = awardedAt
        self.awardedBy = awardedBy
        self.notes = notes
        self.reversed = reversed
        self.reversesGraduationId = reversesGraduationId
        self.certificateAvailable = certificateAvailable
    }
}

/// GET /aluno/graduation payload (hero + progress + timeline).
public struct AlunoGraduation: Sendable, Equatable {
    public let belt: BeltView
    public let progress: GraduationProgress
    /// Newest first.
    public let timeline: [GraduationEntry]

    public init(belt: BeltView, progress: GraduationProgress, timeline: [GraduationEntry]) {
        self.belt = belt
        self.progress = progress
        self.timeline = timeline
    }
}

/// One belt of the merged régua on "Graduações válidas" (professor profile).
public struct ValidGraduation: Sendable, Equatable, Identifiable {
    public enum LadderKind: String, Sendable {
        case adult
        case kids
    }

    public let beltId: UUID
    public let name: String
    public let colorSlug: String
    public let tipColorSlug: String?
    public let maxDegrees: Int
    public let ladderKind: LadderKind
    /// Kids belts reflect the admin toggles (dimmed when false).
    public let enabled: Bool

    public var id: UUID { beltId }

    public init(
        beltId: UUID,
        name: String,
        colorSlug: String,
        tipColorSlug: String?,
        maxDegrees: Int,
        ladderKind: LadderKind,
        enabled: Bool
    ) {
        self.beltId = beltId
        self.name = name
        self.colorSlug = colorSlug
        self.tipColorSlug = tipColorSlug
        self.maxDegrees = maxDegrees
        self.ladderKind = ladderKind
        self.enabled = enabled
    }

    /// The default "Promover faixa" target: the first *enabled* belt after
    /// `current` in the merged régua order (nil at the end of the ladder or
    /// when the current belt is not in the list).
    public static func nextBelt(after currentBeltId: UUID, in ladder: [ValidGraduation]) -> ValidGraduation? {
        guard let index = ladder.firstIndex(where: { $0.beltId == currentBeltId }) else { return nil }
        return ladder.dropFirst(index + 1).first(where: { $0.enabled })
    }
}

/// GET /professor/profile payload (belt chip + graduações válidas).
public struct ProfessorProfile: Sendable, Equatable {
    public let professor: GraduationActor
    /// Display-only membership rank chip — nil when unset.
    public let belt: BeltView?
    /// Merged régua in handoff ladder order.
    public let validGraduations: [ValidGraduation]

    public init(professor: GraduationActor, belt: BeltView?, validGraduations: [ValidGraduation]) {
        self.professor = professor
        self.belt = belt
        self.validGraduations = validGraduations
    }
}

/// One persistent observação (staff-visible coaching note).
public struct StudentNote: Sendable, Equatable, Identifiable {
    public let id: UUID
    public let body: String
    public let createdAt: Date
    public let author: GraduationActor

    public init(id: UUID, body: String, createdAt: Date, author: GraduationActor) {
        self.id = id
        self.body = body
        self.createdAt = createdAt
        self.author = author
    }
}

/// The student header of the professor "perfil do aluno".
public struct ProfileStudent: Sendable, Equatable {
    public let id: UUID
    public let fullName: String
    /// ISO "yyyy-MM-dd".
    public let birthDate: String
    public let status: StudentStatus
    public let badge: RosterBadge

    public init(id: UUID, fullName: String, birthDate: String, status: StudentStatus, badge: RosterBadge) {
        self.id = id
        self.fullName = fullName
        self.birthDate = birthDate
        self.status = status
        self.badge = badge
    }
}

/// GET /professor/students/:id/profile payload.
public struct StudentProfile: Sendable, Equatable {
    public let student: ProfileStudent
    public let belt: BeltView
    public let progress: GraduationProgress
    /// Phase-4 attendance stat tiles.
    public let stats: AlunoStats
    /// Observações, newest first.
    public let notes: [StudentNote]

    public init(
        student: ProfileStudent,
        belt: BeltView,
        progress: GraduationProgress,
        stats: AlunoStats,
        notes: [StudentNote]
    ) {
        self.student = student
        self.belt = belt
        self.progress = progress
        self.stats = stats
        self.notes = notes
    }
}

/// What an award posts: one more degree, or a belt promotion.
public enum AwardKind: String, Sendable {
    case degree
    case belt
}

/// POST graduations result — the new history row + freshly derived belt.
public struct AwardResult: Sendable, Equatable {
    public let graduation: GraduationEntry
    public let belt: BeltView

    public init(graduation: GraduationEntry, belt: BeltView) {
        self.graduation = graduation
        self.belt = belt
    }
}
