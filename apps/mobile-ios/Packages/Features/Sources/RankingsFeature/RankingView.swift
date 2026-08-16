// Full ranking screen (spec 013, REP.17 — handoff aluno-06/07 and
// professor-05/06): Por aulas / Por eventos segmented control, position
// circles (leader filled), gradient bars scaled to the leader, "N aulas"/
// "N eventos" trailing, the "você" chip + outlined row for the aluno's own
// position, and the selos footnote (per-segment copy on the professor —
// the professor-06 prototype fix). PT-BR copy; Lumira tokens only.

import DesignSystem
import SwiftUI
import TatameCore

public struct RankingView: View {
    @Environment(\.rankingsRepository) private var repository
    @State private var model: RankingModel?
    private let persona: RankingPersona
    private let academyName: String?

    public init(persona: RankingPersona, academyName: String?) {
        self.persona = persona
        self.academyName = academyName
    }

    public var body: some View {
        Group {
            if let model {
                RankingContent(model: model)
            } else {
                ThemedColors.bgApp
            }
        }
        .task {
            if model == nil {
                let created = RankingModel(
                    persona: persona,
                    academyName: academyName,
                    repository: repository
                )
                model = created
                await created.load()
            }
        }
    }
}

struct RankingContent: View {
    @Bindable var model: RankingModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: LumiraTokens.Space.s4) {
                Text(model.subtitle)
                    .font(.quicksand(size: LumiraTokens.FontSize.textXs))
                    .foregroundStyle(ThemedColors.fg4)
                    .accessibilityIdentifier("ranking-subtitle")

                RankingSegmentedControl(selection: model.segment) { segment in
                    Task { await model.select(segment) }
                }

                switch model.phase {
                case .idle, .loading:
                    loadingState
                case .failed(let message):
                    RankingErrorBanner(message: message) {
                        Task { await model.load() }
                    }
                case .loaded(let ranking):
                    rankingList(ranking)
                    footnoteCard
                }
            }
            .padding(.horizontal, LumiraTokens.Space.s6)
            .padding(.top, LumiraTokens.Space.s2)
            .padding(.bottom, LumiraTokens.Space.s6)
        }
        .background(ThemedColors.bgApp)
        .navigationTitle(RankingsMessages.titlePTBR(persona: model.persona))
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .refreshable { await model.load() }
    }

    private var loadingState: some View {
        VStack(spacing: LumiraTokens.Space.s3) {
            ForEach(0..<6, id: \.self) { _ in
                RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                    .fill(ThemedColors.bgSunken)
                    .frame(height: 58)
            }
        }
        .redacted(reason: .placeholder)
    }

    // MARK: Rows (stories 13-16)

    @ViewBuilder
    private func rankingList(_ ranking: Ranking) -> some View {
        if ranking.top.isEmpty {
            Text("Ninguém pontuou nesta janela ainda — o ranking começa na próxima presença.")
                .font(.quicksand(size: LumiraTokens.FontSize.textSm))
                .foregroundStyle(ThemedColors.fg3)
                .frame(maxWidth: .infinity, alignment: .center)
                .padding(.vertical, LumiraTokens.Space.s8)
        } else {
            switch model.persona {
            case .aluno:
                // aluno-06/07: one card per row, own row outlined.
                VStack(spacing: LumiraTokens.Space.s3) {
                    ForEach(ranking.top) { row in
                        RankingRowView(row: row, ranking: ranking, showsVoce: true)
                            .padding(LumiraTokens.Space.s4)
                            .background(ThemedColors.bgSurface)
                            .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
                            .overlay(
                                RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                                    .strokeBorder(
                                        row.isMe ? ThemedColors.inkPurple : ThemedColors.border1,
                                        lineWidth: row.isMe ? 1.5 : 1
                                    )
                            )
                            .accessibilityIdentifier("ranking-row-\(row.position)")
                    }
                    if ranking.meOutsideTop, let me = ranking.me {
                        meOutsideRow(me, ranking: ranking)
                    }
                }
            case .professor:
                // professor-05/06: one card, divider-separated rows.
                VStack(spacing: 0) {
                    ForEach(ranking.top) { row in
                        RankingRowView(row: row, ranking: ranking, showsVoce: false)
                            .padding(.horizontal, LumiraTokens.Space.s4)
                            .padding(.vertical, LumiraTokens.Space.s3)
                            .accessibilityIdentifier("ranking-row-\(row.position)")
                        if row.position != ranking.top.last?.position {
                            Divider().overlay(ThemedColors.border1)
                        }
                    }
                }
                .background(ThemedColors.bgSurface)
                .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                        .strokeBorder(ThemedColors.border1, lineWidth: 1)
                )
            }
        }
    }

    /// The aluno's own row below the top-10 cut (story 16 — the ranking
    /// never hides the requester).
    private func meOutsideRow(_ me: RankingMe, ranking: Ranking) -> some View {
        VStack(spacing: LumiraTokens.Space.s2) {
            Text("···")
                .font(.quicksand(size: LumiraTokens.FontSize.textSm, weight: .bold))
                .foregroundStyle(ThemedColors.fg4)
            RankingRowView(
                row: RankingRow(position: me.position, name: "Sua posição", count: me.count, isMe: true),
                ranking: ranking,
                showsVoce: true
            )
            .padding(LumiraTokens.Space.s4)
            .background(ThemedColors.bgSurface)
            .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                    .strokeBorder(ThemedColors.inkPurple, lineWidth: 1.5)
            )
            .accessibilityIdentifier("ranking-me-row")
        }
    }

    // MARK: Selos footnote (story 17)

    private var footnoteCard: some View {
        RankingFootnoteText(copy: model.footnote)
            .font(.quicksand(size: LumiraTokens.FontSize.text2xs))
            .foregroundStyle(ThemedColors.fg4)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(LumiraTokens.Space.s4)
            .background(ThemedColors.bgSunken)
            .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
            .accessibilityIdentifier("ranking-footnote")
    }
}

/// One ranking row: position circle (leader filled), name (+ "você" chip),
/// gradient bar scaled to the leader, trailing count.
struct RankingRowView: View {
    let row: RankingRow
    let ranking: Ranking
    /// Aluno screens only — professors see no self affordances.
    let showsVoce: Bool

    var body: some View {
        HStack(alignment: .center, spacing: LumiraTokens.Space.s3) {
            RankingPositionCircle(position: row.position)
            VStack(alignment: .leading, spacing: LumiraTokens.Space.s2) {
                HStack(spacing: LumiraTokens.Space.s2) {
                    Text(row.name)
                        .font(.quicksand(size: LumiraTokens.FontSize.textSm, weight: .semibold))
                        .foregroundStyle(ThemedColors.fg1)
                        .lineLimit(1)
                    if showsVoce, row.isMe {
                        Text("você")
                            .font(.quicksand(size: LumiraTokens.FontSize.text2xs, weight: .semibold))
                            .foregroundStyle(ThemedColors.inkPurple)
                            .padding(.horizontal, LumiraTokens.Space.s2)
                            .padding(.vertical, 1)
                            .background(ThemedColors.purple100)
                            .clipShape(Capsule())
                            .accessibilityIdentifier("ranking-voce-chip")
                    }
                    Spacer()
                    Text(RankingsFormatters.countLabelPTBR(count: row.count, by: ranking.by))
                        .font(.quicksand(size: LumiraTokens.FontSize.textXs, weight: .semibold))
                        .foregroundStyle(ThemedColors.fg3)
                }
                RankingGradientBar(fraction: ranking.barFraction(count: row.count))
            }
        }
    }
}

/// Position circle — the leader is the filled one (aluno-06).
struct RankingPositionCircle: View {
    let position: Int

    var body: some View {
        Text("\(position)")
            .font(.quicksand(size: LumiraTokens.FontSize.textXs, weight: .bold))
            .foregroundStyle(position == 1 ? ThemedColors.fgOnColor : ThemedColors.fg3)
            .frame(width: 28, height: 28)
            .background(position == 1 ? ThemedColors.purple700 : ThemedColors.bgSunken)
            .clipShape(Circle())
            .overlay {
                if position != 1 {
                    Circle().strokeBorder(ThemedColors.border1, lineWidth: 1)
                }
            }
    }
}

/// The purple→pink gradient bar, width proportional to the leader's count.
struct RankingGradientBar: View {
    let fraction: Double

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(ThemedColors.bgSunken)
                Capsule()
                    .fill(
                        LinearGradient(
                            colors: [ThemedColors.purple600, ThemedColors.pink500],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .frame(width: max(0, proxy.size.width * fraction))
            }
        }
        .frame(height: 6)
    }
}

/// Footnote copy with the selo names highlighted in pink (aluno-06 styling).
struct RankingFootnoteText: View {
    let copy: String

    var body: some View {
        Text(attributed)
    }

    private var attributed: AttributedString {
        var attributed = AttributedString(copy)
        for name in RankingsMessages.seloNames {
            if let range = attributed.range(of: name) {
                attributed[range].foregroundColor = ThemedColors.inkPink
                attributed[range].font = .quicksand(
                    size: LumiraTokens.FontSize.text2xs,
                    weight: .semibold
                )
            }
        }
        return attributed
    }
}

/// Shared load-failure banner with retry (same chrome as the other slices).
struct RankingErrorBanner: View {
    let message: String
    let onRetry: () -> Void

    var body: some View {
        VStack(spacing: LumiraTokens.Space.s3) {
            Text(message)
                .font(.quicksand(size: LumiraTokens.FontSize.textSm))
                .foregroundStyle(ThemedColors.fg2)
                .multilineTextAlignment(.center)
            Button("Tentar novamente", action: onRetry)
                .font(.quicksand(size: LumiraTokens.FontSize.textSm, weight: .semibold))
                .foregroundStyle(ThemedColors.inkPurple)
        }
        .frame(maxWidth: .infinity)
        .padding(LumiraTokens.Space.s5)
        .background(ThemedColors.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                .strokeBorder(ThemedColors.border1, lineWidth: 1)
        )
    }
}
