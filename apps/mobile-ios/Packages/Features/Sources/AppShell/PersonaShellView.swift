// Persona shells (AUTH.26 scaffold + spec 003/004/006/007 tabs): aluno gets
// the real Início (check-in + stat tiles, ATT.22), the Agenda tab (AGD.9 —
// closing the recorded missing-tab debt; Início · Agenda · Carteira · Perfil
// order per design) and the Carteira tab (BIL.22), professor the dashboard
// Início (ATT.24, with the month-calendar header entry, AGD.10) and the
// Turmas tab, responsável the dependents panel (ENR.24-26) and the
// Pagamentos tab (BIL.24). The glass pill tab bar remains recorded parity
// debt.

import AgendaFeature
import AttendanceFeature
import BillingFeature
import DesignSystem
import EnrollmentFeature
import GraduationFeature
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
    enum Tab: Hashable {
        case inicio
        case agenda
        case turmas
        case carteira
        case pagamentos
        case perfil
    }

    let persona: Persona
    let context: SessionContext
    let readOnly: Bool

    @State private var selection: Tab = .inicio
    @State private var showGraduation = false
    @State private var showProfessorCalendar = false
    @Environment(SessionStore.self) private var session
    @Environment(\.enrollmentRepository) private var enrollmentRepository
    @Environment(\.attendanceRepository) private var attendanceRepository
    @Environment(\.billingRepository) private var billingRepository
    @Environment(\.agendaRepository) private var agendaRepository

    var body: some View {
        TabView(selection: $selection) {
            switch persona {
            case .aluno:
                featureTab(title: "Início", icon: persona.homeIcon) {
                    // Home card → Graduação screen (spec 005, story 6).
                    NavigationStack {
                        AlunoHomeView(
                            repository: attendanceRepository,
                            onOpenGraduation: { showGraduation = true },
                            // Real home mensalidade alert deep-links into the
                            // Carteira (spec 006, story 7).
                            onOpenCarteira: { selection = .carteira },
                            // Hero "Ver agenda" CTA switches to the Agenda
                            // tab (spec 007 — the recorded debt closes).
                            onOpenAgenda: { selection = .agenda }
                        )
                        .navigationBarHiddenOnIOS()
                        .navigationDestination(isPresented: $showGraduation) {
                            AlunoGraduationView()
                        }
                    }
                }
                .tag(Tab.inicio)
                featureTab(title: "Agenda", icon: "calendar") {
                    // Real Agenda tab (AGD.9); the "Mês" header button pushes
                    // the month calendar inside this stack (AGD.10).
                    NavigationStack {
                        AlunoAgendaView(
                            repository: agendaRepository,
                            academyName: context.activeMembership.academyName
                        )
                        .navigationBarHiddenOnIOS()
                    }
                }
                .tag(Tab.agenda)
                featureTab(title: "Carteira", icon: "creditcard") {
                    AlunoCarteiraView(
                        repository: billingRepository,
                        academyName: context.activeMembership.academyName
                    )
                }
                .tag(Tab.carteira)
            case .professor:
                featureTab(title: "Início", icon: persona.homeIcon) {
                    // The header calendar icon pushes the professor month
                    // calendar (spec 007 story 20, AGD.10).
                    NavigationStack {
                        ProfessorDashboardView(
                            repository: attendanceRepository,
                            professorName: context.user.fullName,
                            professorUserId: context.user.id,
                            onVerTurmas: { selection = .turmas },
                            onOpenCalendar: { showProfessorCalendar = true }
                        )
                        .navigationBarHiddenOnIOS()
                        .navigationDestination(isPresented: $showProfessorCalendar) {
                            MonthCalendarView(persona: .professor, repository: agendaRepository)
                        }
                    }
                }
                .tag(Tab.inicio)
                featureTab(title: "Turmas", icon: "person.3") {
                    ProfessorTurmasView(
                        repository: enrollmentRepository,
                        academyName: context.activeMembership.academyName
                    )
                }
                .tag(Tab.turmas)
            case .responsavel:
                featureTab(title: "Alunos", icon: persona.homeIcon) {
                    ResponsavelHomeView(
                        repository: enrollmentRepository,
                        session: session,
                        context: context
                    )
                }
                .tag(Tab.inicio)
                featureTab(title: "Pagamentos", icon: "creditcard") {
                    ResponsavelPagamentosView(repository: billingRepository)
                }
                .tag(Tab.pagamentos)
            }
            perfilTab
                .tag(Tab.perfil)
        }
        .tint(LumiraTokens.Colors.inkPurple)
    }

    /// Perfil tab: aluno gets the belt-chip header (spec 005 story 7),
    /// professor the professor-12 profile (belt chip + graduações válidas);
    /// responsável keeps the session card until its slice lands.
    @ViewBuilder
    private var perfilTab: some View {
        switch persona {
        case .aluno:
            shellTab(title: "Perfil", icon: "person.crop.circle") {
                AlunoProfileHeader(fullName: context.user.fullName)
            }
        case .professor:
            shellTab(title: "Perfil", icon: "person.crop.circle") {
                ProfessorProfileView(
                    fullName: context.user.fullName,
                    academyName: context.activeMembership.academyName
                )
            }
        case .responsavel:
            shellTab(title: "Perfil", icon: "person.crop.circle") {
                EmptyView()
            }
        }
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

    private func shellTab(
        title: String,
        icon: String,
        @ViewBuilder header: () -> some View = { EmptyView() }
    ) -> some View {
        VStack(spacing: 0) {
            if readOnly {
                ReadOnlyBanner()
            }
            ScrollView {
                VStack(spacing: LumiraTokens.Space.s4) {
                    header()
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

extension View {
    /// The handoff home header replaces the system bar on iOS; the macOS
    /// floor (test-only host) has no hiding API.
    @ViewBuilder
    func navigationBarHiddenOnIOS() -> some View {
        #if os(iOS)
        toolbar(.hidden, for: .navigationBar)
        #else
        self
        #endif
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
