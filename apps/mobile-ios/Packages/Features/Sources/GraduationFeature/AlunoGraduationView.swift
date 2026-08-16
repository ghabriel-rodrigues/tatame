// Aluno Graduação (handoff aluno-09): the purple hero card — "FAIXA ATUAL",
// drawn BeltBar with degrees, progress bar to the next milestone against the
// academy's real rule — and the "Histórico de evolução" timeline (belt or
// degree, date, professor, observação). "Ver certificado" on belt promotions
// is real since spec 013 (REP.18): it pushes the branded certificate view.
// PT-BR copy; Lumira tokens only.

import DesignSystem
import SwiftUI
import TatameCore

public struct AlunoGraduationView: View {
    @Environment(\.graduationRepository) private var repository
    @State private var model: AlunoGraduationModel?
    private let studentName: String
    private let academyName: String?

    /// The certificate states the session's identity facts (spec 013: the
    /// view renders from timeline + session — no new endpoint), so the
    /// shell passes them in; empty defaults keep the certificate locked
    /// out of nameless contexts (previews).
    public init(studentName: String = "", academyName: String? = nil) {
        self.studentName = studentName
        self.academyName = academyName
    }

    public var body: some View {
        Group {
            if let model {
                AlunoGraduationContent(
                    model: model,
                    studentName: studentName,
                    academyName: academyName
                )
            } else {
                ThemedColors.bgApp
            }
        }
        .task {
            if model == nil {
                let created = AlunoGraduationModel(repository: repository)
                model = created
                await created.load()
            }
        }
    }
}

struct AlunoGraduationContent: View {
    let model: AlunoGraduationModel
    var studentName = ""
    var academyName: String?
    /// Belt-promotion certificate pushed from a timeline row (REP.18).
    @State private var certificateTarget: CertificateData?
    @Environment(\.tatameTheme) private var theme

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: LumiraTokens.Space.s4) {
                switch model.phase {
                case .idle, .loading:
                    loadingState
                case .failed(let message):
                    GraduationErrorBanner(message: message) {
                        Task { await model.load() }
                    }
                    .padding(.top, LumiraTokens.Space.s6)
                case .loaded(let graduation):
                    heroCard(graduation)
                    timelineSection(graduation.timeline)
                }
            }
            .padding(.horizontal, LumiraTokens.Space.s6)
            .padding(.bottom, LumiraTokens.Space.s6)
        }
        .background(ThemedColors.bgApp)
        .navigationTitle("Graduação")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .refreshable { await model.load() }
        .navigationDestination(item: $certificateTarget) { data in
            CertificateView(data: data)
        }
    }

    private var loadingState: some View {
        VStack(spacing: LumiraTokens.Space.s4) {
            RoundedRectangle(cornerRadius: LumiraTokens.Radius.lg, style: .continuous)
                .fill(ThemedColors.bgSunken)
                .frame(height: 132)
            ForEach(0..<3, id: \.self) { _ in
                RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                    .fill(ThemedColors.bgSunken)
                    .frame(height: 72)
            }
        }
        .redacted(reason: .placeholder)
        .padding(.top, LumiraTokens.Space.s4)
    }

    // MARK: Hero (stories 1-3)

    private func heroCard(_ graduation: AlunoGraduation) -> some View {
        VStack(alignment: .leading, spacing: LumiraTokens.Space.s3) {
            Text("FAIXA ATUAL")
                .font(.system(size: LumiraTokens.FontSize.text2xs, weight: .semibold, design: .rounded))
                .tracking(LumiraTokens.FontSize.text2xs * LumiraTokens.Tracking.caps)
                .foregroundStyle(ThemedColors.fgOnColor.opacity(0.7))
            Text(GraduationFormatters.heroTitlePTBR(belt: graduation.belt))
                .font(.system(size: LumiraTokens.FontSize.textLg, weight: .bold, design: .rounded))
                .foregroundStyle(ThemedColors.fgOnColor)
                .accessibilityIdentifier("graduation-hero-title")

            BeltBar(
                colorSlug: graduation.belt.colorSlug,
                tipColorSlug: graduation.belt.tipColorSlug,
                degrees: graduation.belt.degrees,
                maxDegrees: graduation.belt.maxDegrees,
                size: .lg
            )

            HStack {
                Text(graduation.progress.label)
                    .font(.system(size: LumiraTokens.FontSize.text2xs, design: .rounded))
                    .foregroundStyle(ThemedColors.fgOnColor.opacity(0.7))
                Spacer()
                Text(GraduationFormatters.progressLinePTBR(graduation.progress))
                    .font(.system(size: LumiraTokens.FontSize.text2xs, weight: .semibold, design: .rounded))
                    .foregroundStyle(ThemedColors.fgOnColor)
                    .accessibilityIdentifier("graduation-progress-line")
            }
            .padding(.top, LumiraTokens.Space.s1)
            GraduationProgressBar(fraction: graduation.progress.fraction, onColor: true)
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
        .padding(.top, LumiraTokens.Space.s2)
    }

    // MARK: Timeline (stories 4-5)

    @ViewBuilder
    private func timelineSection(_ timeline: [GraduationEntry]) -> some View {
        Text("Histórico de evolução")
            .font(.system(size: LumiraTokens.FontSize.textBase, weight: .semibold, design: .rounded))
            .foregroundStyle(ThemedColors.fg1)
            .padding(.top, LumiraTokens.Space.s2)

        if timeline.isEmpty {
            Text("Sua jornada começa aqui — as graduações aparecem neste histórico.")
                .font(.system(size: LumiraTokens.FontSize.textSm, design: .rounded))
                .foregroundStyle(ThemedColors.fg3)
                .frame(maxWidth: .infinity, alignment: .center)
                .padding(.vertical, LumiraTokens.Space.s8)
        } else {
            VStack(alignment: .leading, spacing: LumiraTokens.Space.s3) {
                ForEach(timeline) { entry in
                    TimelineEntryRow(entry: entry) {
                        // Unlocked exactly on non-reversed belt promotions
                        // (REP.18); CertificateData re-checks the rule.
                        certificateTarget = CertificateData(
                            entry: entry,
                            studentName: studentName,
                            academyName: academyName
                        )
                    }
                }
            }
        }
    }
}

/// One "Histórico de evolução" row: marker dot + card (aluno-09).
struct TimelineEntryRow: View {
    let entry: GraduationEntry
    var onVerCertificado: () -> Void = {}

    var body: some View {
        HStack(alignment: .top, spacing: LumiraTokens.Space.s3) {
            Circle()
                .fill(dotColor)
                .frame(width: 10, height: 10)
                .overlay(Circle().strokeBorder(ThemedColors.border1, lineWidth: 1))
                .padding(.top, LumiraTokens.Space.s4)

            VStack(alignment: .leading, spacing: LumiraTokens.Space.s1) {
                HStack(alignment: .firstTextBaseline) {
                    Text(GraduationFormatters.timelineTitlePTBR(entry: entry))
                        .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                        .foregroundStyle(ThemedColors.fg1)
                    if entry.reversed {
                        Text("Revogada")
                            .font(.system(size: LumiraTokens.FontSize.text2xs, weight: .semibold, design: .rounded))
                            .foregroundStyle(ThemedColors.danger500)
                            .padding(.horizontal, LumiraTokens.Space.s2)
                            .padding(.vertical, 2)
                            .background(ThemedColors.danger100)
                            .clipShape(Capsule())
                    }
                    Spacer()
                    Text(GraduationFormatters.monthYearPTBR(entry.awardedAt))
                        .font(.system(size: LumiraTokens.FontSize.text2xs, design: .rounded))
                        .foregroundStyle(ThemedColors.fg4)
                }
                Text(GraduationFormatters.professorLinePTBR(entry.awardedBy))
                    .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                    .foregroundStyle(ThemedColors.fg4)
                if let notes = entry.notes, !notes.isEmpty {
                    Text("“\(notes)”")
                        .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded).italic())
                        .foregroundStyle(ThemedColors.fg3)
                }
                if entry.certificateAvailable {
                    // Real since spec 013 (REP.18): pushes the branded
                    // certificate view rendered from this entry + session.
                    Button(action: onVerCertificado) {
                        Text("Ver certificado")
                            .font(.system(size: LumiraTokens.FontSize.text2xs, weight: .semibold, design: .rounded))
                            .foregroundStyle(ThemedColors.inkPurple)
                            .padding(.horizontal, LumiraTokens.Space.s3)
                            .padding(.vertical, LumiraTokens.Space.s1)
                            .overlay(
                                Capsule().strokeBorder(ThemedColors.inkPurple, lineWidth: 1)
                            )
                    }
                    .buttonStyle(.plain)
                    .padding(.top, LumiraTokens.Space.s1)
                    .accessibilityIdentifier("ver-certificado-button")
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
            .opacity(entry.reversed ? 0.55 : 1)
        }
    }

    private var dotColor: Color {
        entry.reversed || entry.kind == .revocation
            ? ThemedColors.gray300
            : BeltBarSpec.fill(colorSlug: entry.belt.colorSlug)
    }
}
