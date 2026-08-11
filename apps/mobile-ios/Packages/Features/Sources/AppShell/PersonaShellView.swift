// Persona shells (AUTH.26 scaffold + spec 003/004/006/007/008 tabs): aluno
// gets the real Início (check-in + stat tiles, ATT.22; Próximos eventos →
// event detail, EVT.14), the Agenda tab (AGD.9; Eventos do mês + calendar
// events → detail, EVT.14) and the Carteira tab (BIL.22), professor the
// dashboard Início (ATT.24, with the month-calendar header entry, AGD.10,
// and the eventos-futuros tile/list, EVT.15) and the Turmas tab, responsável
// the dependents panel (ENR.24-26), the Pagamentos tab (BIL.24) and the
// Eventos tab (EVT.15 — the Phase-1 placeholder retires). The glass pill
// tab bar remains recorded parity debt.

import AgendaFeature
import AttendanceFeature
import BillingFeature
import DesignSystem
import EnrollmentFeature
import EventsFeature
import GraduationFeature
import NotificationsFeature
import StoreFeature
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
        case eventos
        case perfil
    }

    let persona: Persona
    let context: SessionContext
    let readOnly: Bool

    @State private var selection: Tab = .inicio
    @State private var showGraduation = false
    @State private var showProfessorCalendar = false
    /// Event detail pushed from the home "Próximos eventos" cards (EVT.14).
    @State private var homeEventTarget: EventDetailTarget?
    /// Event detail pushed from the Agenda "Eventos do mês" cards and the
    /// month calendar's Evento entries (EVT.14).
    @State private var agendaEventTarget: EventDetailTarget?
    /// Vitrine pushed from the home strip's "Ver tudo" (STO.14, spec 009).
    @State private var homeStoreOpen = false
    /// Product detail pushed straight from a home strip card (STO.14).
    @State private var homeStoreProductTarget: StoreProductTarget?
    /// Vitrine pushed from the perfil "Loja da academia" row (STO.14 —
    /// aluno and professor share the entry state; one perfil tab each).
    @State private var perfilStoreOpen = false
    /// Notificações screen pushed from the home-header bell (spec 010,
    /// NOT.12-13 — aluno and professor stacks live here; the responsável
    /// pushes inside its own stack).
    @State private var homeNotificationsOpen = false
    /// Meus pedidos pushed from a tapped `orders` notification row
    /// (spec 010 route map — aluno and professor storefront surface).
    @State private var homeOrdersOpen = false
    /// Home-header unread badge (spec 010, stories 1, 8) — created lazily
    /// once the environment repository is reachable, refetched on focus.
    @State private var notificationsBadge: NotificationsBadgeModel?
    @Environment(SessionStore.self) private var session
    @Environment(\.notificationsRepository) private var notificationsRepository
    @Environment(\.enrollmentRepository) private var enrollmentRepository
    @Environment(\.attendanceRepository) private var attendanceRepository
    @Environment(\.billingRepository) private var billingRepository
    @Environment(\.agendaRepository) private var agendaRepository
    @Environment(\.eventsRepository) private var eventsRepository
    @Environment(\.storeRepository) private var storeRepository

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
                            onOpenAgenda: { selection = .agenda },
                            // "Próximos eventos" card → event detail (EVT.14).
                            onOpenEvent: { homeEventTarget = EventDetailTarget(id: $0.id) },
                            // "Loja da academia" strip (STO.14, spec 009):
                            // "Ver tudo" opens the vitrine, cards push the
                            // product detail.
                            onOpenStore: { homeStoreOpen = true },
                            onOpenStoreProduct: { homeStoreProductTarget = StoreProductTarget(id: $0.id) },
                            // Home-header bell + Notificações screen
                            // (spec 010, NOT.12 — aluno-20).
                            hasUnreadNotifications: notificationsBadge?.hasUnread ?? false,
                            onOpenNotifications: { homeNotificationsOpen = true }
                        )
                        .navigationBarHiddenOnIOS()
                        .navigationDestination(isPresented: $showGraduation) {
                            AlunoGraduationView()
                        }
                        .navigationDestination(isPresented: $homeNotificationsOpen) {
                            NotificationsView(
                                persona: .aluno,
                                repository: notificationsRepository,
                                onBadgeCleared: { notificationsBadge?.clear() },
                                onNavigate: handleAlunoNotificationDestination
                            )
                            .navigationBarBackButtonHidden()
                            .navigationBarHiddenOnIOS()
                        }
                        .navigationDestination(isPresented: $homeOrdersOpen) {
                            StoreOrdersView(repository: storeRepository)
                        }
                        .navigationDestination(item: $homeEventTarget) { target in
                            AlunoEventDetailView(eventId: target.id, repository: eventsRepository)
                        }
                        .navigationDestination(isPresented: $homeStoreOpen) {
                            StoreVitrineView(
                                academyName: context.activeMembership.academyName,
                                repository: storeRepository
                            )
                        }
                        .navigationDestination(item: $homeStoreProductTarget) { target in
                            StoreProductDetailView(productId: target.id, repository: storeRepository)
                        }
                    }
                }
                .tag(Tab.inicio)
                featureTab(title: "Agenda", icon: "calendar") {
                    // Real Agenda tab (AGD.9); the "Mês" header button pushes
                    // the month calendar inside this stack (AGD.10); Eventos
                    // do mês cards and calendar Evento entries push the
                    // event detail (EVT.14).
                    NavigationStack {
                        AlunoAgendaView(
                            repository: agendaRepository,
                            academyName: context.activeMembership.academyName,
                            onOpenEvent: { agendaEventTarget = EventDetailTarget(id: $0.id) }
                        )
                        .navigationBarHiddenOnIOS()
                        .navigationDestination(item: $agendaEventTarget) { target in
                            AlunoEventDetailView(eventId: target.id, repository: eventsRepository)
                        }
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
                            onOpenCalendar: { showProfessorCalendar = true },
                            // Home-header bell + Notificações screen
                            // (spec 010, NOT.13 — story 13).
                            hasUnreadNotifications: notificationsBadge?.hasUnread ?? false,
                            onOpenNotifications: { homeNotificationsOpen = true }
                        )
                        .navigationBarHiddenOnIOS()
                        .navigationDestination(isPresented: $showProfessorCalendar) {
                            MonthCalendarView(persona: .professor, repository: agendaRepository)
                        }
                        .navigationDestination(isPresented: $homeNotificationsOpen) {
                            NotificationsView(
                                persona: .professor,
                                repository: notificationsRepository,
                                onBadgeCleared: { notificationsBadge?.clear() },
                                onNavigate: handleProfessorNotificationDestination
                            )
                            .navigationBarBackButtonHidden()
                            .navigationBarHiddenOnIOS()
                        }
                        .navigationDestination(isPresented: $homeOrdersOpen) {
                            StoreOrdersView(repository: storeRepository)
                        }
                        .navigationDestination(isPresented: $homeStoreOpen) {
                            StoreVitrineView(
                                academyName: context.activeMembership.academyName,
                                repository: storeRepository
                            )
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
                        context: context,
                        // Bell + internally pushed Notificações screen
                        // (spec 010, NOT.13 — responsavel-09); guardian
                        // routes land on tabs, mapped here.
                        hasUnreadNotifications: notificationsBadge?.hasUnread ?? false,
                        onNotificationsBadgeCleared: { notificationsBadge?.clear() },
                        onNotificationDestination: handleResponsavelNotificationDestination
                    )
                }
                .tag(Tab.inicio)
                featureTab(title: "Pagamentos", icon: "creditcard") {
                    ResponsavelPagamentosView(repository: billingRepository)
                }
                .tag(Tab.pagamentos)
                featureTab(title: "Eventos", icon: "calendar") {
                    // Real Eventos tab (EVT.15 — the Phase-1 placeholder
                    // retires): per-dependent confirmation chips per the
                    // charter, Pix per dependent.
                    ResponsavelEventosView(repository: eventsRepository)
                }
                .tag(Tab.eventos)
            }
            perfilTab
                .tag(Tab.perfil)
        }
        .tint(ThemedColors.inkPurple)
        .task {
            if notificationsBadge == nil {
                notificationsBadge = NotificationsBadgeModel(repository: notificationsRepository)
            }
            await notificationsBadge?.refresh()
        }
        .onChange(of: selection) { _, newValue in
            // Home focus refetch (spec 010 — the dot always means
            // something new; muted memberships get 0 from the server).
            if newValue == .inicio {
                Task { await notificationsBadge?.refresh() }
            }
        }
        .onChange(of: homeNotificationsOpen) { wasOpen, isOpen in
            if wasOpen, !isOpen {
                Task { await notificationsBadge?.refresh() }
            }
        }
    }

    /// Semantic-route landings for the aluno shell (spec 010 route map):
    /// tabs switch (popping the feed first), pushes stack on the Início
    /// navigation the feed already lives in.
    private func handleAlunoNotificationDestination(_ destination: NotificationDestination) {
        switch destination {
        case .carteiraTab:
            homeNotificationsOpen = false
            selection = .carteira
        case .eventDetail(let id):
            homeEventTarget = EventDetailTarget(id: id)
        case .graduation:
            showGraduation = true
        case .myOrders:
            homeOrdersOpen = true
        case .storeVitrine:
            homeStoreOpen = true
        case .pagamentosTab, .eventosTab, .alunosTab:
            break // Guardian-only landings never reach the aluno plan.
        }
    }

    /// Professor landings: only the storefront surface navigates (the
    /// route plan already keeps wallet/graduation/event rows inert).
    private func handleProfessorNotificationDestination(_ destination: NotificationDestination) {
        switch destination {
        case .myOrders:
            homeOrdersOpen = true
        case .storeVitrine:
            homeStoreOpen = true
        case .carteiraTab, .pagamentosTab, .eventosTab, .alunosTab, .eventDetail, .graduation:
            break
        }
    }

    /// Guardian landings are tab switches (spec 010: wallet → Pagamentos,
    /// event → Eventos, graduation → the dependents panel); the feed pops
    /// itself before this fires.
    private func handleResponsavelNotificationDestination(_ destination: NotificationDestination) {
        switch destination {
        case .pagamentosTab:
            selection = .pagamentos
        case .eventosTab:
            selection = .eventos
        case .alunosTab:
            selection = .inicio
        case .carteiraTab, .eventDetail, .graduation, .myOrders, .storeVitrine:
            break
        }
    }

    /// Perfil tab: aluno gets the belt-chip header (spec 005 story 7) and
    /// the "Loja da academia" row with its "Novo" pill (spec 009 story 16 —
    /// the dead shortcut finally works); professor the professor-12 profile
    /// (belt chip + graduações válidas) with the same Loja row (story 17 —
    /// per professor-13 the perfil row is the professor's entry, consumer-
    /// side only, no tab-bar change); responsável keeps the session card
    /// until its slice lands.
    @ViewBuilder
    private var perfilTab: some View {
        switch persona {
        case .aluno:
            // Aluno additionally gets the functional "Tema escuro" switch
            // (spec 011, CFG.17); professor/responsável toggles stay design
            // backlog per the handoff.
            perfilTabWithStore(showsNovoPill: true, showsThemeSwitch: true) {
                AlunoProfileHeader(fullName: context.user.fullName)
            }
        case .professor:
            perfilTabWithStore(showsNovoPill: false) {
                ProfessorProfileView(
                    fullName: context.user.fullName,
                    academyName: context.activeMembership.academyName
                )
            }
        case .responsavel:
            shellTab(title: "Perfil", icon: "person.crop.circle") {
                // The perfil "Notificações" switch (spec 010, story 9 —
                // responsavel-07 row); mute kills the badge, the screen
                // stays reachable.
                NotificationsSettingsRow()
            }
        }
    }

    /// Aluno/professor perfil: the shell scroll wrapped in a NavigationStack
    /// so the "Loja da academia" row pushes the shared vitrine (STO.14).
    private func perfilTabWithStore(
        showsNovoPill: Bool,
        showsThemeSwitch: Bool = false,
        @ViewBuilder header: () -> some View
    ) -> some View {
        NavigationStack {
            VStack(spacing: 0) {
                if readOnly {
                    ReadOnlyBanner()
                }
                ScrollView {
                    VStack(spacing: LumiraTokens.Space.s4) {
                        header()
                        StoreEntryRow(showsNovoPill: showsNovoPill) {
                            perfilStoreOpen = true
                        }
                        // The perfil "Notificações" switch (spec 010,
                        // story 9): mute silences the badge only.
                        NotificationsSettingsRow()
                        // "Tema escuro" (spec 011, CFG.17 — aluno-19 row
                        // order: below Notificações).
                        if showsThemeSwitch {
                            ThemeSettingsRow()
                        }
                        SessionContextCard(context: context, shellTitle: persona.titlePTBR)
                        LogoutButton()
                    }
                    .padding(LumiraTokens.Space.s6)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .background(ThemedColors.bgApp)
            .navigationBarHiddenOnIOS()
            .navigationDestination(isPresented: $perfilStoreOpen) {
                StoreVitrineView(
                    academyName: context.activeMembership.academyName,
                    repository: storeRepository
                )
            }
        }
        .tabItem {
            Label("Perfil", systemImage: "person.crop.circle")
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
        .background(ThemedColors.bgApp)
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
        .background(ThemedColors.bgApp)
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
        .foregroundStyle(ThemedColors.warning500)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, LumiraTokens.Space.s4)
        .padding(.vertical, LumiraTokens.Space.s2)
        .background(ThemedColors.warning100)
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
                .foregroundStyle(ThemedColors.fg1)
            row(label: "Nome", value: context.user.fullName)
            row(label: "Email", value: context.user.email)
            row(label: "Perfil", value: context.activeMembership.role.displayNamePTBR)
            if let academy = context.activeMembership.academyName {
                row(label: "Academia", value: academy)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(LumiraTokens.Space.s4)
        .background(ThemedColors.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                .strokeBorder(ThemedColors.border1, lineWidth: 1)
        )
    }

    private func row(label: String, value: String) -> some View {
        HStack(spacing: LumiraTokens.Space.s2) {
            Text(label)
                .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold, design: .rounded))
                .foregroundStyle(ThemedColors.fg4)
            Text(value)
                .font(.system(size: LumiraTokens.FontSize.textSm, design: .rounded))
                .foregroundStyle(ThemedColors.fg2)
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
                .foregroundStyle(ThemedColors.danger500)
                .frame(maxWidth: .infinity)
                .frame(height: 44)
                .background(ThemedColors.danger100)
                .clipShape(Capsule())
        }
        .accessibilityIdentifier("logout-button")
    }
}
