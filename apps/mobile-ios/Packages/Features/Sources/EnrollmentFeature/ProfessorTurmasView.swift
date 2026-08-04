// Professor "Minhas turmas" (handoff professor-07): class cards with the
// schedule line, occupancy chip, optional age chip, Lotada badge, and the
// occupancy progress bar. PT-BR copy; Lumira tokens only.

import DesignSystem
import SwiftUI
import TatameCore

public struct ProfessorTurmasView: View {
    @State private var model: ProfessorTurmasModel
    private let academyName: String?

    public init(repository: any EnrollmentRepository, academyName: String?) {
        _model = State(initialValue: ProfessorTurmasModel(repository: repository))
        self.academyName = academyName
    }

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: LumiraTokens.Space.s4) {
                    header

                    switch model.phase {
                    case .idle, .loading:
                        loadingCards
                    case .failed(let message):
                        EnrollmentErrorBanner(message: message) {
                            Task { await model.load() }
                        }
                    case .loaded(let classes):
                        if classes.isEmpty {
                            emptyState
                        } else {
                            ForEach(classes) { summary in
                                NavigationLink(value: summary.id) {
                                    TurmaCard(summary: summary)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
                .padding(.horizontal, LumiraTokens.Space.s6)
                .padding(.bottom, LumiraTokens.Space.s6)
            }
            .background(LumiraTokens.Colors.bgApp)
            .navigationDestination(for: UUID.self) { classId in
                TurmaDetailView(classId: classId)
            }
            .hideNavigationBarOnIOS()
            .task { await model.load() }
            .refreshable { await model.load() }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: LumiraTokens.Space.s1) {
            Text("Minhas turmas")
                .font(.system(size: LumiraTokens.FontSize.textXl, weight: .bold, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg1)
            if let academyName {
                Text(academyName)
                    .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg4)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, LumiraTokens.Space.s6)
    }

    private var loadingCards: some View {
        VStack(spacing: LumiraTokens.Space.s4) {
            ForEach(0..<3, id: \.self) { _ in
                RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                    .fill(LumiraTokens.Colors.bgSunken)
                    .frame(height: 96)
            }
        }
        .redacted(reason: .placeholder)
    }

    private var emptyState: some View {
        Text("Você ainda não tem turmas atribuídas.")
            .font(.system(size: LumiraTokens.FontSize.textSm, design: .rounded))
            .foregroundStyle(LumiraTokens.Colors.fg3)
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.vertical, LumiraTokens.Space.s12)
    }
}

/// One class card (handoff professor-07).
struct TurmaCard: View {
    let summary: ClassSummary

    var body: some View {
        VStack(alignment: .leading, spacing: LumiraTokens.Space.s2) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: LumiraTokens.Space.s1) {
                    Text(summary.name)
                        .font(.system(size: LumiraTokens.FontSize.textBase, weight: .semibold, design: .rounded))
                        .foregroundStyle(LumiraTokens.Colors.fg1)
                    Text(summary.schedules.scheduleLinePTBR)
                        .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                        .foregroundStyle(LumiraTokens.Colors.fg4)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold))
                    .foregroundStyle(LumiraTokens.Colors.fg4)
            }

            HStack(spacing: LumiraTokens.Space.s2) {
                if let ageLabel = summary.ageRangeLabelPTBR {
                    EnrollmentChip(text: ageLabel, style: .brand)
                }
                EnrollmentChip(text: summary.occupancyLabelPTBR, style: .neutral)
                if summary.lotada {
                    EnrollmentChip(text: "Lotada", style: .danger)
                }
            }

            OccupancyBar(fraction: summary.occupancyFraction)
                .padding(.top, LumiraTokens.Space.s1)
        }
        .padding(LumiraTokens.Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(LumiraTokens.Colors.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                .strokeBorder(LumiraTokens.Colors.border1, lineWidth: 1)
        )
    }
}

// MARK: Shared enrollment components

/// Handoff pill chip (age range / occupancy / Lotada).
struct EnrollmentChip: View {
    enum Style {
        case brand
        case neutral
        case danger
    }

    let text: String
    let style: Style

    var body: some View {
        Text(text)
            .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold, design: .rounded))
            .foregroundStyle(foreground)
            .padding(.horizontal, LumiraTokens.Space.s2)
            .padding(.vertical, LumiraTokens.Space.s1)
            .background(background)
            .clipShape(Capsule())
    }

    private var foreground: Color {
        switch style {
        case .brand: LumiraTokens.Colors.inkPurple
        case .neutral: LumiraTokens.Colors.fg3
        case .danger: LumiraTokens.Colors.danger500
        }
    }

    private var background: Color {
        switch style {
        case .brand: LumiraTokens.Colors.purple100
        case .neutral: LumiraTokens.Colors.bgSunken
        case .danger: LumiraTokens.Colors.danger100
        }
    }
}

/// Occupancy progress bar (handoff class card footer).
struct OccupancyBar: View {
    let fraction: Double

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(LumiraTokens.Colors.bgSunken)
                Capsule()
                    .fill(LumiraTokens.Colors.brand2)
                    .frame(width: max(0, proxy.size.width * fraction))
            }
        }
        .frame(height: 5)
    }
}

extension View {
    /// The handoff headers replace the system bar on iOS; the macOS floor
    /// (test-only host) has no hiding API.
    @ViewBuilder
    func hideNavigationBarOnIOS() -> some View {
        #if os(iOS)
        toolbar(.hidden, for: .navigationBar)
        #else
        self
        #endif
    }
}

/// Load-failure banner with retry (shared by the enrollment screens).
struct EnrollmentErrorBanner: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        VStack(spacing: LumiraTokens.Space.s3) {
            Text(message)
                .font(.system(size: LumiraTokens.FontSize.textSm, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.danger500)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button("Tentar novamente", action: retry)
                .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.inkPurple)
        }
        .padding(LumiraTokens.Space.s4)
        .background(LumiraTokens.Colors.danger100)
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
    }
}
