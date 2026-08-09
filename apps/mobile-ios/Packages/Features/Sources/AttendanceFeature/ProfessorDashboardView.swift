// Professor dashboard (handoff professor-02): greeting header, live tiles
// (alunos hoje, presença média — eventos futuros stays a placeholder), the
// next-class hero with its check-in count and "Iniciar chamada", and the
// explicit "Próximos da graduação" placeholder. PT-BR copy; Lumira tokens
// only.

import DesignSystem
import SwiftUI
import TatameCore

public struct ProfessorDashboardView: View {
    @State private var model: ProfessorDashboardModel
    private let professorName: String
    private let professorUserId: UUID
    private let onVerTurmas: () -> Void
    private let onOpenCalendar: (() -> Void)?

    public init(
        repository: any AttendanceRepository,
        professorName: String,
        professorUserId: UUID,
        onVerTurmas: @escaping () -> Void = {},
        onOpenCalendar: (() -> Void)? = nil
    ) {
        _model = State(initialValue: ProfessorDashboardModel(repository: repository))
        self.professorName = professorName
        self.professorUserId = professorUserId
        self.onVerTurmas = onVerTurmas
        self.onOpenCalendar = onOpenCalendar
    }

    public var body: some View {
        ProfessorDashboardContent(
            model: model,
            professorName: professorName,
            professorUserId: professorUserId,
            onVerTurmas: onVerTurmas,
            onOpenCalendar: onOpenCalendar
        )
    }
}

struct ProfessorDashboardContent: View {
    @Bindable var model: ProfessorDashboardModel
    let professorName: String
    let professorUserId: UUID
    let onVerTurmas: () -> Void
    var onOpenCalendar: (() -> Void)?

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
                    graduationPlaceholder
                }
            }
            .padding(.horizontal, LumiraTokens.Space.s6)
            .padding(.bottom, LumiraTokens.Space.s6)
        }
        .background(LumiraTokens.Colors.bgApp)
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
                    .foregroundStyle(LumiraTokens.Colors.fg4)
                Text("\(AttendanceFormatters.greetingPTBR(hour: Calendar.current.component(.hour, from: Date()))),\n\(AttendanceFormatters.firstName(professorName))")
                    .font(.system(size: LumiraTokens.FontSize.textXl, weight: .bold, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg1)
            }
            Spacer()
            HStack(spacing: LumiraTokens.Space.s3) {
                // Month calendar entry (spec 007 story 20, handoff
                // professor-02 header icon).
                if let onOpenCalendar {
                    Button(action: onOpenCalendar) {
                        Image(systemName: "calendar")
                            .font(.system(size: LumiraTokens.FontSize.textMd))
                            .foregroundStyle(LumiraTokens.Colors.fg2)
                            .frame(width: 42, height: 42)
                            .background(LumiraTokens.Colors.bgSurface)
                            .clipShape(Circle())
                            .overlay(Circle().strokeBorder(LumiraTokens.Colors.border1, lineWidth: 1))
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
                        .fill(LumiraTokens.Colors.bgSunken)
                        .frame(height: 76)
                }
            }
            RoundedRectangle(cornerRadius: LumiraTokens.Radius.lg, style: .continuous)
                .fill(LumiraTokens.Colors.bgSunken)
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
            // Events belong to the events slice — explicit placeholder.
            AlunoStatTile(value: "—", label: "eventos futuros", footnote: "Em breve")
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
                .foregroundStyle(LumiraTokens.Colors.fgOnColor)
                .padding(.horizontal, LumiraTokens.Space.s2)
                .padding(.vertical, LumiraTokens.Space.s1)
                .background(LumiraTokens.Colors.white.opacity(0.18))
                .clipShape(Capsule())

                Text(nextClass.className)
                    .font(.system(size: LumiraTokens.FontSize.textLg, weight: .bold, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fgOnColor)
                Text("\(nextClass.checkedInCount) confirmados")
                    .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fgOnColor.opacity(0.75))
                    .accessibilityIdentifier("hero-checked-in-count")

                HStack(spacing: LumiraTokens.Space.s3) {
                    Button {
                        model.iniciarChamada()
                    } label: {
                        Text("Iniciar chamada")
                            .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                            .foregroundStyle(LumiraTokens.Colors.inkPurple)
                            .padding(.horizontal, LumiraTokens.Space.s4)
                            .frame(height: 38)
                            .background(LumiraTokens.Colors.white)
                            .clipShape(Capsule())
                    }
                    .accessibilityIdentifier("iniciar-chamada-button")

                    Button("Ver turmas", action: onVerTurmas)
                        .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                        .foregroundStyle(LumiraTokens.Colors.fgOnColor)
                }
                .padding(.top, LumiraTokens.Space.s2)
            } else {
                Text("Sem aulas hoje")
                    .font(.system(size: LumiraTokens.FontSize.textLg, weight: .bold, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fgOnColor)
                Button("Ver turmas", action: onVerTurmas)
                    .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fgOnColor)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(LumiraTokens.Space.s5)
        .background(
            LinearGradient(
                colors: [
                    theme.color("purple-700") ?? LumiraTokens.Colors.purple700,
                    theme.color("purple-500") ?? LumiraTokens.Colors.purple500,
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
                    .foregroundStyle(LumiraTokens.Colors.fg1)
                Spacer()
                Text("Fase 5")
                    .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg4)
            }
            Text("A fila de graduação chega com as regras de graduação.")
                .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg4)
        }
        .padding(LumiraTokens.Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(LumiraTokens.Colors.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                .strokeBorder(LumiraTokens.Colors.border1, lineWidth: 1)
        )
        .opacity(0.7)
    }
}
