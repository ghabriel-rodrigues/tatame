import Foundation
import Testing
@testable import TatameCore

private func belt(
    name: String = "Azul",
    colorSlug: String = "belt.blue",
    tipColorSlug: String? = nil,
    maxDegrees: Int = 4,
    degrees: Int = 2
) -> BeltView {
    BeltView(
        beltId: UUID(),
        name: name,
        colorSlug: colorSlug,
        tipColorSlug: tipColorSlug,
        maxDegrees: maxDegrees,
        degrees: degrees
    )
}

private func progress(
    current: Int = 26,
    target: Int = 40,
    label: String = "Próximo 3º grau",
    milestone: NextMilestone = NextMilestone(kind: .degree, degree: 3)
) -> GraduationProgress {
    GraduationProgress(current: current, target: target, label: label, nextMilestone: milestone)
}

@Suite("Graduation PT-BR formatters & model helpers")
struct GraduationFormattersTests {
    @Test("hero title: name plus pluralized degrees, dan wording on black")
    func heroTitle() {
        #expect(GraduationFormatters.heroTitlePTBR(belt: belt(degrees: 2)) == "Azul · 2 graus")
        #expect(GraduationFormatters.heroTitlePTBR(belt: belt(degrees: 1)) == "Azul · 1 grau")
        #expect(GraduationFormatters.heroTitlePTBR(belt: belt(name: "Branca", colorSlug: "belt.white", degrees: 0)) == "Branca")
        #expect(
            GraduationFormatters.heroTitlePTBR(
                belt: belt(name: "Preta", colorSlug: "belt.black", tipColorSlug: "belt.red", maxDegrees: 6, degrees: 2)
            ) == "Preta · 2º dan"
        )
    }

    @Test("chip label: 'Faixa azul · 2 graus' / 'Faixa preta · 2º dan' / bare at zero")
    func chipLabel() {
        #expect(GraduationFormatters.chipLabelPTBR(belt: belt(degrees: 2)) == "Faixa azul · 2 graus")
        #expect(
            GraduationFormatters.chipLabelPTBR(
                belt: belt(name: "Preta", colorSlug: "belt.black", degrees: 2)
            ) == "Faixa preta · 2º dan"
        )
        #expect(
            GraduationFormatters.chipLabelPTBR(
                belt: belt(name: "Branca", colorSlug: "belt.white", degrees: 0)
            ) == "Faixa branca"
        )
    }

    @Test("progress line and profile caption (degree vs next-belt milestone)")
    func progressCopy() {
        #expect(GraduationFormatters.progressLinePTBR(progress()) == "26 de 40 aulas")
        #expect(
            GraduationFormatters.progressCaptionPTBR(progress(current: 38))
                == "38 de 40 aulas para o 3º grau"
        )
        #expect(
            GraduationFormatters.progressCaptionPTBR(
                progress(milestone: NextMilestone(kind: .belt, degree: nil))
            ) == "26 de 40 aulas para a próxima faixa"
        )
    }

    @Test("progress fraction clamps into 0...1 and survives a zero target")
    func fraction() {
        #expect(progress(current: 20, target: 40).fraction == 0.5)
        #expect(progress(current: 44, target: 40).fraction == 1)
        #expect(progress(current: 5, target: 0).fraction == 0)
    }

    @Test("timeline titles per kind (aluno-09): degree, belt, revocation")
    func timelineTitles() {
        let ref = BeltRef(beltId: UUID(), name: "Azul", colorSlug: "belt.blue", tipColorSlug: nil, maxDegrees: 4)
        let actor = GraduationActor(userId: UUID(), fullName: "Rafael Nunes")
        func entry(kind: GraduationKind, degree: Int) -> GraduationEntry {
            GraduationEntry(
                id: UUID(), kind: kind, belt: ref, degree: degree, awardedAt: Date(),
                awardedBy: actor, notes: nil, reversed: false, reversesGraduationId: nil,
                certificateAvailable: false
            )
        }
        #expect(GraduationFormatters.timelineTitlePTBR(entry: entry(kind: .degree, degree: 2)) == "Azul · 2º grau")
        #expect(GraduationFormatters.timelineTitlePTBR(entry: entry(kind: .belt, degree: 0)) == "Faixa azul")
        #expect(GraduationFormatters.timelineTitlePTBR(entry: entry(kind: .revocation, degree: 0)) == "Revogação")
    }

    @Test("timeline month-year reads 'Maio de 2026' (capitalized pt-BR month)")
    func monthYear() {
        var components = DateComponents()
        components.year = 2026
        components.month = 5
        components.day = 10
        components.timeZone = TimeZone(identifier: "America/Sao_Paulo")
        let date = Calendar(identifier: .gregorian).date(from: components)!
        #expect(GraduationFormatters.monthYearPTBR(date) == "Maio de 2026")
    }

    @Test("author lines: 'Prof. Rafael Nunes' on the timeline, first name on notes")
    func authorLines() {
        let actor = GraduationActor(userId: UUID(), fullName: "Rafael Nunes")
        #expect(GraduationFormatters.professorLinePTBR(actor) == "Prof. Rafael Nunes")

        var components = DateComponents()
        components.year = 2026
        components.month = 7
        components.day = 12
        components.timeZone = TimeZone(identifier: "America/Sao_Paulo")
        components.hour = 12
        let date = Calendar(identifier: .gregorian).date(from: components)!
        let note = StudentNote(id: UUID(), body: "x", createdAt: date, author: actor)
        #expect(GraduationFormatters.noteMetaPTBR(note) == "12 jul · Prof. Rafael")
    }
}

@Suite("Graduation model helpers")
struct GraduationModelHelperTests {
    private func valid(
        _ name: String,
        id: UUID = UUID(),
        kind: ValidGraduation.LadderKind = .adult,
        enabled: Bool = true
    ) -> ValidGraduation {
        ValidGraduation(
            beltId: id,
            name: name,
            colorSlug: "belt.blue",
            tipColorSlug: nil,
            maxDegrees: 4,
            ladderKind: kind,
            enabled: enabled
        )
    }

    @Test("nextBelt picks the first enabled belt after the current one")
    func nextBeltSkipsDisabled() {
        let whiteId = UUID()
        let ladder = [
            valid("Branca", id: whiteId),
            valid("Cinza", kind: .kids, enabled: false),
            valid("Amarela", kind: .kids, enabled: false),
            valid("Azul"),
            valid("Roxa"),
        ]
        let next = ValidGraduation.nextBelt(after: whiteId, in: ladder)
        #expect(next?.name == "Azul")
    }

    @Test("nextBelt is nil at the top of the ladder and for unknown belts")
    func nextBeltEnds() {
        let redId = UUID()
        let ladder = [valid("Preta"), valid("Vermelha", id: redId)]
        #expect(ValidGraduation.nextBelt(after: redId, in: ladder) == nil)
        #expect(ValidGraduation.nextBelt(after: UUID(), in: ladder) == nil)
    }

    @Test("a fresh check-in bumps the home graduation numerator; duplicates don't")
    func homeCardBump() {
        let card = AlunoHomeGraduation(
            belt: BeltView(beltId: UUID(), name: "Azul", colorSlug: "belt.blue", tipColorSlug: nil, maxDegrees: 4, degrees: 2),
            progress: GraduationProgress(
                current: 26, target: 40, label: "Próximo 3º grau",
                nextMilestone: NextMilestone(kind: .degree, degree: 3)
            )
        )
        let stats = AlunoStats(
            monthPresencePct: 86, monthAttendedSessions: 12, monthTotalSessions: 14, streak: 7, totalLessons: 27
        )
        let home = AlunoHome(
            studentId: UUID(), studentName: "Lucas", todayClass: nil, stats: stats, graduation: card
        )
        func result(_ status: CheckinStatus) -> CheckinResult {
            CheckinResult(
                status: status,
                attendance: AttendanceRef(id: UUID(), classSessionId: UUID(), method: .code, checkedInAt: Date()),
                session: CheckinSessionRef(id: UUID(), classId: UUID(), className: "x", sessionDate: "2026-08-09"),
                stats: stats
            )
        }

        #expect(home.applying(result(.checkedIn)).graduation?.progress.current == 27)
        #expect(home.applying(result(.alreadyCheckedIn)).graduation?.progress.current == 26)
    }
}
