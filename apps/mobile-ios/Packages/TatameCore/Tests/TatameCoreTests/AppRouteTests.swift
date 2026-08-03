import Foundation
import Testing
@testable import TatameCore

@Suite("Role gate (AppRoute)")
struct AppRouteTests {
    private func context(role: MembershipRole, academyStatus: AcademyStatus?) -> SessionContext {
        let membership = Membership(
            id: UUID(),
            type: [.owner, .support, .finance].contains(role) ? .platform : .academy,
            role: role,
            tenantId: [.owner, .support, .finance].contains(role) ? nil : UUID(),
            academyName: "Alliance Leblon",
            academyStatus: academyStatus,
            status: "active"
        )
        return SessionContext(
            user: UserSummary(id: UUID(), email: "x@tatame.dev", fullName: "X"),
            memberships: [membership],
            activeMembership: membership
        )
    }

    @Test("aluno / professor / responsável land on their shells")
    func personaShells() {
        #expect(context(role: .student, academyStatus: .active).route == .aluno(readOnly: false))
        #expect(context(role: .professor, academyStatus: .trial).route == .professor(readOnly: false))
        #expect(context(role: .guardian, academyStatus: .active).route == .responsavel(readOnly: false))
    }

    @Test("admin and platform roles are web-console-only on mobile")
    func webOnlyRoles() {
        #expect(context(role: .admin, academyStatus: .active).route == .webConsole)
        #expect(context(role: .owner, academyStatus: nil).route == .webConsole)
        #expect(context(role: .support, academyStatus: nil).route == .webConsole)
        #expect(context(role: .finance, academyStatus: nil).route == .webConsole)
    }

    @Test("suspended academy blocks every persona shell")
    func suspendedBlocks() {
        #expect(context(role: .student, academyStatus: .suspended).route == .suspended)
        #expect(context(role: .professor, academyStatus: .suspended).route == .suspended)
        #expect(context(role: .guardian, academyStatus: .suspended).route == .suspended)
    }

    @Test("delinquent academy degrades shells to read-only")
    func delinquentReadOnly() {
        #expect(context(role: .student, academyStatus: .delinquent).route == .aluno(readOnly: true))
        #expect(context(role: .professor, academyStatus: .delinquent).route == .professor(readOnly: true))
        #expect(context(role: .guardian, academyStatus: .delinquent).route == .responsavel(readOnly: true))
    }
}
