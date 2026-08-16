// Certificado de graduação (spec 013, REP.18 — handoff aluno-09): the
// timeline's belt-promotion entries open a client-rendered, academy-branded
// certificate — brand badge, academy name, student name, the belt through
// the shared BeltBar tokens, award date and the professor signature line.
// "Download" hands the rendered view to the OS share sheet as a PNG via
// ImageRenderer + ShareLink — the lean path: pure SwiftUI, no UIKit print
// controller, and the share sheet already offers print/save; a real PDF
// file stays recorded debt (spec 013, out of scope).

import DesignSystem
import SwiftUI
import TatameCore

/// What a certificate states — derivable only from a non-reversed belt
/// promotion carrying the server's `certificateAvailable` flag (degree and
/// initial entries return nil: certificates mean belt promotions, story 30).
public struct CertificateData: Equatable, Hashable, Sendable {
    public let studentName: String
    public let academyName: String
    public let belt: BeltRef
    public let awardedAt: Date
    public let professorName: String

    public init?(entry: GraduationEntry, studentName: String, academyName: String?) {
        guard entry.certificateAvailable, entry.kind == .belt, !entry.reversed else {
            return nil
        }
        self.studentName = studentName
        self.academyName = academyName ?? "Tatame"
        self.belt = entry.belt
        self.awardedAt = entry.awardedAt
        self.professorName = entry.awardedBy.fullName
    }
}

public struct CertificateView: View {
    private let data: CertificateData
    @State private var renderedImage: Image?
    @Environment(\.tatameTheme) private var theme

    public init(data: CertificateData) {
        self.data = data
    }

    public var body: some View {
        ScrollView {
            VStack(spacing: LumiraTokens.Space.s5) {
                certificateCard
                shareHint
            }
            .padding(LumiraTokens.Space.s6)
        }
        .background(ThemedColors.bgApp)
        .navigationTitle("Certificado")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                if let renderedImage {
                    ShareLink(
                        item: renderedImage,
                        preview: SharePreview(
                            "Certificado — Faixa \(data.belt.name)",
                            image: renderedImage
                        )
                    ) {
                        Image(systemName: "square.and.arrow.up")
                    }
                    .accessibilityIdentifier("certificado-share")
                }
            }
        }
        .task { render() }
    }

    /// The shareable composition (also what ImageRenderer snapshots).
    private var certificateCard: some View {
        CertificateCard(data: data, theme: theme)
    }

    private var shareHint: some View {
        Text("Use compartilhar para salvar, imprimir ou publicar.")
            .font(.quicksand(size: LumiraTokens.FontSize.text2xs))
            .foregroundStyle(ThemedColors.fg4)
    }

    /// Renders the branded card to a shareable PNG (3x for print-quality).
    @MainActor
    private func render() {
        let renderer = ImageRenderer(
            content: CertificateCard(data: data, theme: theme)
                .frame(width: 360)
        )
        renderer.scale = 3
        if let cgImage = renderer.cgImage {
            renderedImage = Image(decorative: cgImage, scale: 3)
        }
    }
}

/// The branded certificate composition (aluno-09 keepsake).
struct CertificateCard: View {
    let data: CertificateData
    let theme: TatameTheme

    var body: some View {
        VStack(spacing: LumiraTokens.Space.s4) {
            CertificateBrandBadge(theme: theme)
                .padding(.top, LumiraTokens.Space.s5)

            Text(data.academyName.uppercased())
                .font(.quicksand(size: LumiraTokens.FontSize.text2xs, weight: .semibold))
                .tracking(LumiraTokens.FontSize.text2xs * LumiraTokens.Tracking.caps)
                .foregroundStyle(ThemedColors.fg4)
                .accessibilityIdentifier("certificado-academia")

            Text("Certificado de Graduação")
                .font(.quicksand(size: LumiraTokens.FontSize.textLg, weight: .bold))
                .foregroundStyle(ThemedColors.fg1)

            Text("Certificamos que")
                .font(.quicksand(size: LumiraTokens.FontSize.textXs))
                .foregroundStyle(ThemedColors.fg3)

            Text(data.studentName)
                .font(.quicksand(size: LumiraTokens.FontSize.textXl, weight: .bold))
                .foregroundStyle(ThemedColors.inkPurple)
                .multilineTextAlignment(.center)
                .accessibilityIdentifier("certificado-aluno")

            Text("foi promovido(a) à")
                .font(.quicksand(size: LumiraTokens.FontSize.textXs))
                .foregroundStyle(ThemedColors.fg3)

            VStack(spacing: LumiraTokens.Space.s2) {
                Text("Faixa \(data.belt.name)")
                    .font(.quicksand(size: LumiraTokens.FontSize.textMd, weight: .bold))
                    .foregroundStyle(ThemedColors.fg1)
                    .accessibilityIdentifier("certificado-faixa")
                // The belt itself through the shared tokenized component —
                // a fresh promotion carries zero degrees.
                BeltBar(
                    colorSlug: data.belt.colorSlug,
                    tipColorSlug: data.belt.tipColorSlug,
                    degrees: 0,
                    maxDegrees: data.belt.maxDegrees,
                    size: .lg
                )
                .padding(.horizontal, LumiraTokens.Space.s6)
            }

            Text(GraduationFormatters.fullDatePTBR(data.awardedAt))
                .font(.quicksand(size: LumiraTokens.FontSize.textXs))
                .foregroundStyle(ThemedColors.fg3)
                .accessibilityIdentifier("certificado-data")

            VStack(spacing: LumiraTokens.Space.s1) {
                Rectangle()
                    .fill(ThemedColors.border1)
                    .frame(width: 160, height: 1)
                Text(GraduationFormatters.professorLinePTBR(
                    GraduationActor(userId: UUID(), fullName: data.professorName)
                ))
                .font(.quicksand(size: LumiraTokens.FontSize.textSm, weight: .semibold))
                .foregroundStyle(ThemedColors.fg1)
                .accessibilityIdentifier("certificado-professor")
                Text("Professor responsável")
                    .font(.quicksand(size: LumiraTokens.FontSize.text2xs))
                    .foregroundStyle(ThemedColors.fg4)
            }
            .padding(.top, LumiraTokens.Space.s3)
            .padding(.bottom, LumiraTokens.Space.s5)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, LumiraTokens.Space.s5)
        .background(ThemedColors.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.lg, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LumiraTokens.Radius.lg, style: .continuous)
                .strokeBorder(ThemedColors.border1, lineWidth: 1)
        )
        .accessibilityIdentifier("certificado-card")
    }
}

/// The squircle brand badge with the stylized belt glyph — the app's
/// BrandLogo equivalent, themed through the academy's white-label palette
/// (session brand via the theme engine, no hex literals).
struct CertificateBrandBadge: View {
    let theme: TatameTheme

    var body: some View {
        RoundedRectangle(cornerRadius: 18, style: .continuous)
            .fill(
                LinearGradient(
                    colors: [
                        theme.color("purple-700") ?? ThemedColors.purple700,
                        theme.color("purple-500") ?? ThemedColors.purple500,
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .frame(width: 56, height: 56)
            .overlay {
                HStack(spacing: 2.5) {
                    Capsule()
                        .fill(ThemedColors.white)
                        .frame(width: 17, height: 8)
                    Capsule()
                        .fill(ThemedColors.white)
                        .frame(width: 3, height: 8)
                    Capsule()
                        .fill(ThemedColors.white)
                        .frame(width: 3, height: 8)
                }
                .accessibilityHidden(true)
            }
    }
}
