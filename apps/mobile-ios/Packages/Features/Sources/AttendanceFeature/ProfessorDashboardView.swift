// Professor dashboard (handoff professor-02): greeting header, live tiles
// (alunos hoje, presença média, eventos futuros — real since spec 008), the
// next-class hero with its check-in count and "Iniciar chamada", the
// "Eventos futuros" read-only list (spec 008 story 22), and the explicit
// "Próximos da graduação" placeholder. PT-BR copy; Lumira tokens only.

import DesignSystem
import NotificationsFeature
import SwiftUI
import TatameCore

public struct ProfessorDashboardView: View {
    @State private var model: ProfessorDashboardModel
    private let professorName: String
    private let professorUserId: UUID
    private let onVerTurmas: () -> Void
    private let onOpenCalendar: (() -> Void)?
    private let hasUnreadNotifications: Bool
    private let onOpenNotifications: (() -> Void)?

    public init(
        repository: any AttendanceRepository,
        professorName: String,
        professorUserId: UUID,
        onVerTurmas: @escaping () -> Void = {},
        onOpenCalendar: (() -> Void)? = nil,
        hasUnreadNotifications: Bool = false,
        onOpenNotifications: (() -> Void)? = nil
    ) {
        _model = State(initialValue: ProfessorDashboardModel(repository: repository))
        self.professorName = professorName
        self.professorUserId = professorUserId
        self.onVerTurmas = onVerTurmas
        self.onOpenCalendar = onOpenCalendar
        self.hasUnreadNotifications = hasUnreadNotifications
        self.onOpenNotifications = onOpenNotifications
    }

    public var body: some View {
        ProfessorDashboardContent(
            model: model,
            professorName: professorName,
            professorUserId: professorUserId,
            onVerTurmas: onVerTurmas,
            onOpenCalendar: onOpenCalendar,
            hasUnreadNotifications: hasUnreadNotifications,
            onOpenNotifications: onOpenNotifications
        )
    }
}

struct ProfessorDashboardContent: View {
    @Bindable var model: ProfessorDashboardModel
    let professorName: String
    let professorUserId: UUID
    let onVerTurmas: () -> Void
    var onOpenCalendar: (() -> Void)?
    var hasUnreadNotifications = false
    var onOpenNotifications: (() -> Void)?

    @Environment(\.tatameTheme) private var theme
    @Environment(\.attendanceRepository) private var repository

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: LumiraTokens.Space.s4) {
                header

                switch model.phase {
                case .idle, .loading:
                    loadingState
                case .failed(let message):
                    AttendanceErrorBanner(message: message) {
                        Task { await model.load() }
                    }
                case .loaded(let dashboard):
                    statTiles(dashboard)
                    heroCard(dashboard)
                    upcomingEventsSection(dashboard)
                    graduationPlaceholder
                }
            }
            .padding(.horizontal, LumiraTokens.Space.s6)
            .padding(.bottom, LumiraTokens.Space.s6)
        }
        .background(ThemedColors.bgApp)
        .task { await model.load() }
        .refreshable { await model.load() }
        .sheet(
            isPresented: Binding(
                get: { model.chamadaClassId != nil },
                set: { presented in
                    if !presented {
                        model.chamadaClassId = nil
                        Task { await model.load() }
                    }
                }
            )
        ) {
            if let classId = model.chamadaClassId {
                LiveChamadaSheet(classId: classId, repository: repository)
                    .presentationDetents([.large])
            }
        }
    }

    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                Text(AttendanceFormatters.headerDatePTBR())
                    .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                    .foregroundStyle(ThemedColors.fg4)
                Text("\(AttendanceFormatters.greetingPTBR(hour: Calendar.current.component(.hour, from: Date()))),\n\(AttendanceFormatters.firstName(professorName))")
                    .font(.system(size: LumiraTokens.FontSize.textXl, weight: .bold, design: .rounded))
                    .foregroundStyle(ThemedColors.fg1)
            }
            Spacer()
            HStack(spacing: LumiraTokens.Space.s3) {
                // Home-header bell + unread dot (spec 010, story 13 — the
                // professor persona is not a dead end).
                if let onOpenNotifications {
                    NotificationsBellButton(
                        hasUnread: hasUnreadNotifications,
                        action: onOpenNotifications
                    )
                }
                // Month calendar entry (spec 007 story 20, handoff
                // professor-02 header icon).
                if let onOpenCalendar {
                    Button(action: onOpenCalendar) {
                        Image(systemName: "calendar")
                            .font(.system(size: LumiraTokens.FontSize.textMd))
                            .foregroundStyle(ThemedColors.fg2)
                            .frame(width: 42, height: 42)
                            .background(ThemedColors.bgSurface)
                            .clipShape(Circle())
                            .overlay(Circle().strokeBorder(ThemedColors.border1, lineWidth: 1))
                    }
                    .accessibilityIdentifier("professor-calendar-button")
                }
                AttendanceAvatar(initials: NameInitials.from(professorName))
            }
        }
        .padding(.top, LumiraTokens.Space.s6)
    }

    private var loadingState: some View {
        VStack(spacing: LumiraTokens.Space.s4) {
            HStack(spacing: LumiraTokens.Space.s3) {
                ForEach(0..<3, id: \.self) { _ in
                    RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                        .fill(ThemedColors.bgSunken)
                        .frame(height: 76)
                }
            }
            RoundedRectangle(cornerRadius: LumiraTokens.Radius.lg, style: .continuous)
                .fill(ThemedColors.bgSunken)
                .frame(height: 140)
        }
        .redacted(reason: .placeholder)
    }

    // MARK: Tiles (stories 34-35)

    private func statTiles(_ dashboard: ProfessorDashboard) -> some View {
        HStack(spacing: LumiraTokens.Space.s3) {
            AlunoStatTile(value: "\(dashboard.alunosHoje)", label: "alunos hoje")
            AlunoStatTile(
                value: AttendanceFormatters.percentLabel(dashboard.presencaMediaPct),
                label: "presença média"
            )
            // Real since spec 008 (story 22).
            AlunoStatTile(value: "\(dashboard.upcomingEventsCount)", label: "eventos futuros")
        }
    }

    // MARK: Eventos futuros (spec 008 story 22 — read-only academy program:
    // date square, name, "N confirmados · gratuito/R$ X"; hidden when empty)

    @ViewBuilder
    private func upcomingEventsSection(_ dashboard: ProfessorDashboard) -> some View {
        if !dashboard.upcomingEvents.isEmpty {
            VStack(alignment: .leading, spacing: LumiraTokens.Space.s3) {
                Text("Eventos futuros")
                    .font(.system(size: LumiraTokens.FontSize.textMd, weight: .bold, design: .rounded))
                    .foregroundStyle(ThemedColors.fg1)
                ForEach(dashboard.upcomingEvents) { event in
                    EventRowCard(event: event)
                        .accessibilityIdentifier("dashboard-event-\(event.id.uuidString.lowercased())")
                }
            }
            .accessibilityIdentifier("eventos-futuros")
        }
    }

    // MARK: Next-class hero (story 36)

    @ViewBuilder
    private func heroCard(_ dashboard: ProfessorDashboard) -> some View {
        VStack(alignment: .leading, spacing: LumiraTokens.Space.s2) {
            if let nextClass = dashboard.nextClass {
                HStack(spacing: LumiraTokens.Space.s1) {
                    Image(systemName: "clock")
                    Text("Próxima aula · \(nextClass.slot.nextSlotLabelPTBR)")
                }
                .font(.system(size: LumiraTokens.FontSize.text2xs, weight: .semibold, design: .rounded))
                .foregroundStyle(ThemedColors.fgOnColor)
                .padding(.horizontal, LumiraTokens.Space.s2)
                .padding(.vertical, LumiraTokens.Space.s1)
                .background(ThemedColors.white.opacity(0.18))
                .clipShape(Capsule())

                Text(nextClass.className)
                    .font(.system(size: LumiraTokens.FontSize.textLg, weight: .bold, design: .rounded))
                    .foregroundStyle(ThemedColors.fgOnColor)
                Text("\(nextClass.checkedInCount) confirmados")
                    .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                    .foregroundStyle(ThemedColors.fgOnColor.opacity(0.75))
                    .accessibilityIdentifier("hero-checked-in-count")

                HStack(spacing: LumiraTokens.Space.s3) {
                    Button {
                        model.iniciarChamada()
                    } label: {
                        Text("Iniciar chamada")
                            .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                            .foregroundStyle(ThemedColors.inkPurple)
                            .padding(.horizontal, LumiraTokens.Space.s4)
                            .frame(height: 38)
                            .background(ThemedColors.white)
                            .clipShape(Capsule())
                    }
                    .accessibilityIdentifier("iniciar-chamada-button")

                    Button("Ver turmas", action: onVerTurmas)
                        .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                        .foregroundStyle(ThemedColors.fgOnColor)
                }
                .padding(.top, LumiraTokens.Space.s2)
            } else {
                Text("Sem aulas hoje")
                    .font(.system(size: LumiraTokens.FontSize.textLg, weight: .bold, design: .rounded))
                    .foregroundStyle(ThemedColors.fgOnColor)
                Button("Ver turmas", action: onVerTurmas)
                    .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                    .foregroundStyle(ThemedColors.fgOnColor)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(LumiraTokens.Space.s5)
        .background(
            LinearGradient(
                colors: [
                    theme.color("purple-700") ?? ThemedColors.purple700,
                    theme.color("purple-500") ?? ThemedColors.purple500,
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.lg, style: .continuous))
    }

    private var graduationPlaceholder: some View {
        VStack(alignment: .leading, spacing: LumiraTokens.Space.s2) {
            HStack {
                Text("Próximos da graduação")
                    .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                    .foregroundStyle(ThemedColors.fg1)
                Spacer()
                Text("Fase 5")
                    .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold, design: .rounded))
                    .foregroundStyle(ThemedColors.fg4)
            }
            Text("A fila de graduação chega com as regras de graduação.")
                .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                .foregroundStyle(ThemedColors.fg4)
        }
        .padding(LumiraTokens.Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ThemedColors.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                .strokeBorder(ThemedColors.border1, lineWidth: 1)
        )
        .opacity(0.7)
    }
}
