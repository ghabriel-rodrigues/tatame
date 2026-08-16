// Small shared pieces for the graduation screens (Lumira tokens only).

import DesignSystem
import SwiftUI
import TatameCore

/// Load-failure banner with retry (graduation-local twin — targets don't
/// share internals).
struct GraduationErrorBanner: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        VStack(spacing: LumiraTokens.Space.s3) {
            Text(message)
                .font(.quicksand(size: LumiraTokens.FontSize.textSm))
                .foregroundStyle(ThemedColors.danger500)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button("Tentar novamente", action: retry)
                .font(.quicksand(size: LumiraTokens.FontSize.textSm, weight: .semibold))
                .foregroundStyle(ThemedColors.inkPurple)
        }
        .padding(LumiraTokens.Space.s4)
        .background(ThemedColors.danger100)
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
    }
}

/// Inline action-error banner (award/note failures).
struct GraduationActionErrorBanner: View {
    let message: String
    var identifier = "graduation-action-error"

    var body: some View {
        Text(message)
            .font(.quicksand(size: LumiraTokens.FontSize.textSm))
            .foregroundStyle(ThemedColors.danger500)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(LumiraTokens.Space.s3)
            .background(ThemedColors.danger100)
            .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.sm, style: .continuous))
            .accessibilityIdentifier(identifier)
    }
}

/// Avatar circle with initials (graduation-local twin).
struct GraduationAvatar: View {
    let initials: String
    var size: CGFloat = 44

    var body: some View {
        Text(initials)
            .font(.quicksand(size: size * 0.33, weight: .bold))
            .foregroundStyle(ThemedColors.fgOnColor)
            .frame(width: size, height: size)
            .background(
                LinearGradient(
                    colors: [ThemedColors.purple500, ThemedColors.brandAccent],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .clipShape(Circle())
    }
}

/// Initials from a full name ("Lucas Almeida" → "LA").
enum GraduationInitials {
    static func from(_ fullName: String) -> String {
        let parts = fullName.split(separator: " ")
        let first = parts.first?.prefix(1) ?? ""
        let last = parts.count > 1 ? (parts.last?.prefix(1) ?? "") : ""
        return String(first + last).uppercased()
    }
}

/// Thin progress bar used on the graduation surfaces.
struct GraduationProgressBar: View {
    let fraction: Double
    /// Hero variant renders on the purple gradient (white fill).
    var onColor = false

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(onColor ? ThemedColors.white.opacity(0.24) : ThemedColors.bgSunken)
                Capsule()
                    .fill(onColor ? ThemedColors.white : ThemedColors.brandAccent)
                    .frame(width: max(0, proxy.size.width * fraction))
            }
        }
        .frame(height: 5)
    }
}

/// The `BeltChip` label + drawing props for a `BeltView` (one place maps the
/// domain payload onto the design-system chip).
public extension BeltChip {
    init(belt: BeltView, style: BeltChip.Style = .neutral) {
        self.init(
            label: GraduationFormatters.chipLabelPTBR(belt: belt),
            colorSlug: belt.colorSlug,
            tipColorSlug: belt.tipColorSlug,
            degrees: belt.degrees,
            maxDegrees: belt.maxDegrees,
            style: style
        )
    }
}
