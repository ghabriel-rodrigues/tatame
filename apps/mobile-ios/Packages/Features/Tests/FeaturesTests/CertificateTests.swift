import Foundation
import Testing
@testable import GraduationFeature
import TatameCore

@Suite("CertificateData unlock (spec 013, REP.18 — certificates mean belt promotions)")
struct CertificateTests {
    private static let beltId = UUID(uuidString: "0198a7b0-0000-7000-8000-0000000000c1")!
    private static let professor = GraduationActor(
        userId: UUID(uuidString: "0198a7b0-0000-7000-8000-0000000000c2")!,
        fullName: "Rafael Nunes"
    )

    private func entry(
        kind: GraduationKind,
        degree: Int = 0,
        reversed: Bool = false,
        certificateAvailable: Bool
    ) -> GraduationEntry {
        GraduationEntry(
            id: UUID(),
            kind: kind,
            belt: BeltRef(
                beltId: Self.beltId,
                name: "Azul",
                colorSlug: "belt.blue",
                tipColorSlug: nil,
                maxDegrees: 4
            ),
            degree: degree,
            awardedAt: Date(timeIntervalSince1970: 1_732_104_000), // 2024-11-20 12:00 UTC
            awardedBy: Self.professor,
            notes: nil,
            reversed: reversed,
            reversesGraduationId: nil,
            certificateAvailable: certificateAvailable
        )
    }

    @Test("a flagged belt promotion composes the branded certificate")
    func beltPromotionUnlocks() throws {
        let data = try #require(CertificateData(
            entry: entry(kind: .belt, certificateAvailable: true),
            studentName: "Lucas Almeida",
            academyName: "Horizonte BJJ"
        ))

        #expect(data.studentName == "Lucas Almeida")
        #expect(data.academyName == "Horizonte BJJ")
        #expect(data.belt.name == "Azul")
        #expect(data.belt.colorSlug == "belt.blue")
        #expect(data.professorName == "Rafael Nunes")
    }

    @Test("degree entries stay without a certificate (story 30)")
    func degreeStaysLocked() {
        #expect(CertificateData(
            entry: entry(kind: .degree, degree: 2, certificateAvailable: false),
            studentName: "Lucas Almeida",
            academyName: "Horizonte BJJ"
        ) == nil)
    }

    @Test("the server flag is the authority — an unflagged belt entry stays locked")
    func unflaggedBeltStaysLocked() {
        #expect(CertificateData(
            entry: entry(kind: .belt, certificateAvailable: false),
            studentName: "Lucas Almeida",
            academyName: "Horizonte BJJ"
        ) == nil)
    }

    @Test("reversed promotions never certify (defensive against a stale flag)")
    func reversedStaysLocked() {
        #expect(CertificateData(
            entry: entry(kind: .belt, reversed: true, certificateAvailable: true),
            studentName: "Lucas Almeida",
            academyName: "Horizonte BJJ"
        ) == nil)
    }

    @Test("a session without an academy name brands with the product default")
    func academyFallback() throws {
        let data = try #require(CertificateData(
            entry: entry(kind: .belt, certificateAvailable: true),
            studentName: "Lucas Almeida",
            academyName: nil
        ))
        #expect(data.academyName == "Tatame")
    }

    @Test("certificate date line renders the full pt-BR date")
    func fullDate() {
        let date = Date(timeIntervalSince1970: 1_732_104_000)
        #expect(GraduationFormatters.fullDatePTBR(date) == "20 de novembro de 2024")
    }
}
