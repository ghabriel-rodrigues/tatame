// Responsável dependents panel (handoff responsavel-02): greeting, one card
// per child (avatar, age · turma, next-class tile, Fase-4 frequency
// placeholder), dashed "Cadastrar aluno" action (hidden when the academy
// disabled the toggle), navigation to the child detail. Billing/notification
// areas of the handoff belong to their own slices.

import DesignSystem
import NotificationsFeature
import SwiftUI
import TatameCore

public struct ResponsavelHomeView: View {
    @State private var model: ResponsavelHomeModel?
    private let repository: any EnrollmentRepository
    private let session: SessionStore
    private let context: SessionContext
    private let hasUnreadNotifications: Bool
    private let onNotificationsBadgeCleared: (@MainActor () -> Void)?
    private let onNotificationDestination: ((NotificationDestination) -> Void)?

    public init(
        repository: any EnrollmentRepository,
        session: SessionStore,
        context: SessionContext,
        hasUnreadNotifications: Bool = false,
        onNotificationsBadgeCleared: (@MainActor () -> Void)? = nil,
        onNotificationDestination: ((NotificationDestination) -> Void)? = nil
    ) {
        self.repository = repository
        self.session = session
        self.context = context
        self.hasUnreadNotifications = hasUnreadNotifications
        self.onNotificationsBadgeCleared = onNotificationsBadgeCleared
        self.onNotificationDestination = onNotificationDestination
    }

    public var body: some View {
        NavigationStack {
            Group {
                if let model {
                    ResponsavelHomeContent(
                        model: model,
                        context: context,
                        hasUnreadNotifications: hasUnreadNotifications,
                        onNotificationsBadgeCleared: onNotificationsBadgeCleared,
                        onNotificationDestination: onNotificationDestination
                    )
                } else {
                    ThemedColors.bgApp
                }
            }
            .task {
                if model == nil {
                    let created = ResponsavelHomeModel(repository: repository, session: session)
                    model = created
                    await created.load()
                }
            }
        }
    }
}

struct ResponsavelHomeContent: View {
    @Bindable var model: ResponsavelHomeModel
    let context: SessionContext
    var hasUnreadNotifications = false
    var onNotificationsBadgeCleared: (@MainActor () -> Void)?
    var onNotificationDestination: ((NotificationDestination) -> Void)?

    /// The Notificações screen pushes inside this tab's own stack (spec
    /// 010, NOT.13 — responsavel-09).
    @State private var showNotifications = false
    @Environment(\.enrollmentRepository) private var repository
    @Environment(\.notificationsRepository) private var notificationsRepository

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: LumiraTokens.Space.s4) {
                greeting

                switch model.phase {
                case .idle, .loading:
                    loadingCards
                case .failed(let message):
                    EnrollmentErrorBanner(message: message) {
                        Task { await model.load() }
                    }
                case .loaded(let dependents):
                    if dependents.isEmpty {
                        Text("Nenhum aluno vinculado a você ainda.")
                            .font(.quicksand(size: LumiraTokens.FontSize.textSm))
                            .foregroundStyle(ThemedColors.fg3)
                            .frame(maxWidth: .infinity, alignment: .center)
                            .padding(.vertical, LumiraTokens.Space.s8)
                    } else {
                        ForEach(dependents) { dependent in
                            NavigationLink(value: dependent.id) {
                                DependentCard(dependent: dependent)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    if model.canRegisterDependents {
                        registerButton
                    }
                }
            }
            .padding(.horizontal, LumiraTokens.Space.s6)
            .padding(.bottom, LumiraTokens.Space.s6)
        }
        .background(ThemedColors.bgApp)
        .hideNavigationBarOnIOS()
        .refreshable { await model.load() }
        .navigationDestination(for: UUID.self) { dependentId in
            DependentDetailView(dependentId: dependentId)
        }
        .navigationDestination(isPresented: $showNotifications) {
            // Guardian feed (spec 010, NOT.13 — responsavel-09): tab
            // destinations pop first so the switch lands cleanly.
            NotificationsView(
                persona: .responsavel,
                repository: notificationsRepository,
                onBadgeCleared: onNotificationsBadgeCleared,
                onNavigate: { destination in
                    showNotifications = false
                    onNotificationDestination?(destination)
                }
            )
            .navigationBarBackButtonHidden()
            .hideNavigationBarOnIOS()
        }
        .sheet(isPresented: $model.showRegisterSheet) {
            RegisterDependentSheet(repository: repository) {
                Task { await model.dependentRegistered() }
            }
            .presentationDetents([.medium, .large])
        }
    }

    private var greeting: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: LumiraTokens.Space.s1) {
                Text(Date.now.formatted(.dateTime.weekday(.wide).day().month(.wide).locale(Locale(identifier: "pt_BR"))))
                    .font(.quicksand(size: LumiraTokens.FontSize.textXs))
                    .foregroundStyle(ThemedColors.fg4)
                Text("Olá,\n\(firstName)")
                    .font(.quicksand(size: LumiraTokens.FontSize.textXl, weight: .bold))
                    .foregroundStyle(ThemedColors.fg1)
            }
            Spacer()
            // Home-header bell + unread dot (spec 010, story 10 —
            // responsavel-09 opens from here).
            NotificationsBellButton(hasUnread: hasUnreadNotifications) {
                showNotifications = true
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, LumiraTokens.Space.s6)
    }

    private var firstName: String {
        context.user.fullName.split(separator: " ").first.map(String.init) ?? context.user.fullName
    }

    private var loadingCards: some View {
        VStack(spacing: LumiraTokens.Space.s4) {
            ForEach(0..<2, id: \.self) { _ in
                RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                    .fill(ThemedColors.bgSunken)
                    .frame(height: 120)
            }
        }
        .redacted(reason: .placeholder)
    }

    /// Handoff dashed "Cadastrar aluno" button — hidden when the academy
    /// disabled the dependents.register toggle (story 36).
    private var registerButton: some View {
        Button {
            model.showRegisterSheet = true
        } label: {
            HStack(spacing: LumiraTokens.Space.s2) {
                Image(systemName: "plus")
                    .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold))
                Text("Cadastrar aluno")
                    .font(.quicksand(size: LumiraTokens.FontSize.textSm, weight: .semibold))
            }
            .foregroundStyle(ThemedColors.inkPurple)
            .frame(maxWidth: .infinity)
            .frame(height: 44)
            .background(
                RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                    .strokeBorder(
                        ThemedColors.inkPurple,
                        style: StrokeStyle(lineWidth: 1, dash: [5, 4])
                    )
            )
        }
        .accessibilityIdentifier("register-dependent-button")
    }
}

/// One dependent card (handoff responsavel-02). Frequency and graduation
/// tiles are other slices — the next-class tile is real data.
struct DependentCard: View {
    let dependent: Dependent

    var body: some View {
        VStack(alignment: .leading, spacing: LumiraTokens.Space.s3) {
            HStack(spacing: LumiraTokens.Space.s3) {
                AvatarCircle(initials: NameInitials.from(dependent.fullName), size: 40)
                VStack(alignment: .leading, spacing: 2) {
                    Text(dependent.fullName)
                        .font(.quicksand(size: LumiraTokens.FontSize.textSm, weight: .semibold))
                        .foregroundStyle(ThemedColors.fg1)
                    Text(subtitle)
                        .font(.quicksand(size: LumiraTokens.FontSize.textXs))
                        .foregroundStyle(ThemedColors.fg4)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold))
                    .foregroundStyle(ThemedColors.fg4)
            }

            // Drawn belt with degrees (spec 005, story 34).
            if let belt = dependent.belt {
                VStack(alignment: .leading, spacing: LumiraTokens.Space.s1) {
                    BeltBar(
                        colorSlug: belt.colorSlug,
                        tipColorSlug: belt.tipColorSlug,
                        degrees: belt.degrees,
                        maxDegrees: belt.maxDegrees,
                        size: .sm
                    )
                    Text(GraduationFormatters.chipLabelPTBR(belt: belt))
                        .font(.quicksand(size: LumiraTokens.FontSize.text2xs))
                        .foregroundStyle(ThemedColors.fg4)
                }
            }

            HStack(spacing: LumiraTokens.Space.s3) {
                StatTile(value: "—", label: "frequência", footnote: "Fase 4")
                if let nextSlot = dependent.enrolledClass?.nextSlot {
                    StatTile(value: nextSlot.nextSlotLabelPTBR, label: "próxima aula")
                } else {
                    StatTile(value: "—", label: "próxima aula", footnote: "sem turma")
                }
            }

            // Mensalidade alert fed by real charge data (spec 006, story 22).
            if let alert = dependent.mensalidade {
                HStack(spacing: LumiraTokens.Space.s2) {
                    Image(systemName: "creditcard")
                        .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold))
                    Text("Mensalidade em aberto · \(BillingFormatters.alertLinePTBR(alert: alert))")
                        .font(.quicksand(size: LumiraTokens.FontSize.text2xs, weight: .semibold))
                }
                .foregroundStyle(ThemedColors.warning500)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, LumiraTokens.Space.s3)
                .padding(.vertical, LumiraTokens.Space.s2)
                .background(ThemedColors.warning100)
                .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.sm, style: .continuous))
                .accessibilityIdentifier("dependent-mensalidade-alert")
            }
        }
        .padding(LumiraTokens.Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ThemedColors.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                .strokeBorder(ThemedColors.border1, lineWidth: 1)
        )
    }

    private var subtitle: String {
        let age = BirthDates.ageLabelPTBR(fromISO: dependent.birthDate)
        let turma = dependent.enrolledClass?.name
        switch (age, turma) {
        case let (.some(age), .some(turma)): return "\(age) · \(turma)"
        case let (.some(age), nil): return "\(age) · sem turma"
        case let (nil, .some(turma)): return turma
        case (nil, nil): return "sem turma"
        }
    }
}
