// The two ranking entry points (spec 013, REP.17): the aluno home
// "Ranking do mês" card with the live position line (aluno-03 copy) and the
// professor dashboard "Ranking de presença · <mês>" section with the real
// top 3 + "Ver todos". Both self-load (best-effort) from the environment
// repository and hand navigation back to the shell.

import DesignSystem
import SwiftUI
import TatameCore

/// Aluno home entry card — pink bar-chart icon + live position line,
/// opening the full screen (replaces the Phase-4 placeholder).
public struct AlunoRankingHomeCard: View {
    @Environment(\.rankingsRepository) private var repository
    @State private var model: RankingEntryModel?
    private let onOpen: () -> Void

    public init(onOpen: @escaping () -> Void) {
        self.onOpen = onOpen
    }

    public var body: some View {
        Button(action: onOpen) {
            HStack(spacing: LumiraTokens.Space.s3) {
                Image(systemName: "chart.bar.fill")
                    .foregroundStyle(ThemedColors.inkPink)
                    .frame(width: 36, height: 36)
                    .background(ThemedColors.pink100)
                    .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.sm, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text("Ranking do mês")
                        .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                        .foregroundStyle(ThemedColors.fg1)
                    Text(model?.homeCardLine ?? RankingsFormatters.homeCardLinePTBR(me: nil))
                        .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                        .foregroundStyle(ThemedColors.fg4)
                        .multilineTextAlignment(.leading)
                        .accessibilityIdentifier("ranking-card-line")
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold))
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
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("ranking-home-card")
        .task {
            if model == nil {
                let created = RankingEntryModel(repository: repository)
                model = created
                await created.load()
            }
        }
    }
}

/// Professor dashboard section — the month's real top 3 with "Ver todos"
/// opening the full screen (the Phase-4 placeholder finally pays out).
public struct ProfessorRankingSection: View {
    @Environment(\.rankingsRepository) private var repository
    @State private var model: RankingEntryModel?
    private let onVerTodos: () -> Void

    public init(onVerTodos: @escaping () -> Void) {
        self.onVerTodos = onVerTodos
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: LumiraTokens.Space.s3) {
            HStack {
                Text(model?.dashboardTitle ?? "Ranking de presença")
                    .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                    .foregroundStyle(ThemedColors.fg1)
                    .accessibilityIdentifier("ranking-section-title")
                Spacer()
                Button("Ver todos", action: onVerTodos)
                    .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold, design: .rounded))
                    .foregroundStyle(ThemedColors.inkPurple)
                    .accessibilityIdentifier("ranking-ver-todos")
            }
            if let ranking = model?.ranking, let topThree = model?.topThree, !topThree.isEmpty {
                VStack(spacing: LumiraTokens.Space.s3) {
                    ForEach(topThree) { row in
                        RankingRowView(row: row, ranking: ranking, showsVoce: false)
                            .accessibilityIdentifier("ranking-top-\(row.position)")
                    }
                }
            } else {
                Text("As presenças do mês montam o pódio aqui.")
                    .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                    .foregroundStyle(ThemedColors.fg4)
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
        .accessibilityIdentifier("ranking-presenca-section")
        .task {
            if model == nil {
                let created = RankingEntryModel(repository: repository)
                model = created
                await created.load()
            }
        }
    }
}
