// Persona shells (AUTH.26 scaffold + spec 003 tabs): professor gets the
// real Turmas tab and responsável the dependents panel (ENR.24-26); the
// remaining tabs stay placeholders until their slices land. The glass pill
// tab bar remains recorded parity debt.

import DesignSystem
import EnrollmentFeature
import SwiftUI
import TatameCore

enum Persona {
    case aluno
    case professor
    case responsavel

    var titlePTBR: String {
        switch self {
        case .aluno: "Aluno"
        case .professor: "Professor"
        case .responsavel: "Responsável"
        }
    }

    var homeIcon: String {
        switch self {
        case .aluno: "figure.martial.arts"
        case .professor: "list.clipboard"
        case .responsavel: "figure.2.and.child.holdinghands"
        }
    }
}

struct PersonaShellView: View {
    let persona: Persona
    let context: SessionContext
    let readOnly: Bool

    @Environment(SessionStore.self) private var session
    @Environment(\.enrollmentRepository) private var enrollmentRepository

    var body: some View {
        TabView {
            switch persona {
            case .aluno:
                shellTab(title: "Início", icon: persona.homeIcon)
            case .professor:
                shellTab(title: "Início", icon: persona.homeIcon)
                featureTab(title: "Turmas", icon: "person.3") {
                    ProfessorTurmasView(
                        repository: enrollmentRepository,
                        academyName: context.activeMembership.academyName
                    )
                }
            case .responsavel:
                featureTab(title: "Alunos", icon: persona.homeIcon) {
                    ResponsavelHomeView(
                        repository: enrollmentRepository,
                        session: session,
                        context: context
                    )
                }
            }
            shellTab(title: "Perfil", icon: "person.crop.circle")
        }
        .tint(LumiraTokens.Colors.inkPurple)
    }

    /// Real feature tab with the shared read-only banner slot.
    private func featureTab(
        title: String,
        icon: String,
        @ViewBuilder content: () -> some View
    ) -> some View {
        VStack(spacing: 0) {
            if readOnly {
                ReadOnlyBanner()
            }
            content()
        }
        .background(LumiraTokens.Colors.bgApp)
        .tabItem {
            Label(title, systemImage: icon)
        }
    }

    private func shellTab(title: String, icon: String) -> some View {
        VStack(spacing: 0) {
            if readOnly {
                ReadOnlyBanner()
            }
            ScrollView {
                VStack(spacing: LumiraTokens.Space.s4) {
                    SessionContextCard(context: context, shellTitle: persona.titlePTBR)
                    LogoutButton()
                }
                .padding(LumiraTokens.Space.s6)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(LumiraTokens.Colors.bgApp)
        .tabItem {
            Label(title, systemImage: icon)
        }
    }
}

/// Delinquent academy → read-only mode banner (spec story 39).
struct ReadOnlyBanner: View {
    var body: some View {
        HStack(spacing: LumiraTokens.Space.s2) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: LumiraTokens.FontSize.textSm))
            Text("Pagamento da academia pendente — modo somente leitura.")
                .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold, design: .rounded))
        }
        .foregroundStyle(LumiraTokens.Colors.warning500)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, LumiraTokens.Space.s4)
        .padding(.vertical, LumiraTokens.Space.s2)
        .background(LumiraTokens.Colors.warning100)
        .accessibilityIdentifier("read-only-banner")
    }
}

/// Placeholder card proving the session context reached the shell.
struct SessionContextCard: View {
    let context: SessionContext
    let shellTitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: LumiraTokens.Space.s2) {
            Text(shellTitle)
                .font(.system(size: LumiraTokens.FontSize.textLg, weight: .bold, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg1)
            row(label: "Nome", value: context.user.fullName)
            row(label: "Email", value: context.user.email)
            row(label: "Perfil", value: context.activeMembership.role.displayNamePTBR)
            if let academy = context.activeMembership.academyName {
                row(label: "Academia", value: academy)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(LumiraTokens.Space.s4)
        .background(LumiraTokens.Colors.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                .strokeBorder(LumiraTokens.Colors.border1, lineWidth: 1)
        )
    }

    private func row(label: String, value: String) -> some View {
        HStack(spacing: LumiraTokens.Space.s2) {
            Text(label)
                .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg4)
            Text(value)
                .font(.system(size: LumiraTokens.FontSize.textSm, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg2)
        }
    }
}

/// "Sair" — revoke + wipe via SessionStore (spec stories 51-52).
struct LogoutButton: View {
    @Environment(SessionStore.self) private var session

    var body: some View {
        Button {
            Task { await session.logout() }
        } label: {
            Text("Sair")
                .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.danger500)
                .frame(maxWidth: .infinity)
                .frame(height: 44)
                .background(LumiraTokens.Colors.danger100)
                .clipShape(Capsule())
        }
        .accessibilityIdentifier("logout-button")
    }
}
