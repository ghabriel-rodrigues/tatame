// Small shared pieces for the attendance screens (Lumira tokens only).

import DesignSystem
import SwiftUI
import TatameCore

/// Avatar circle with initials (handoff rows) — attendance-local twin of the
/// enrollment one (targets don't share internals).
struct AttendanceAvatar: View {
    let initials: String
    var size: CGFloat = 36

    var body: some View {
        Text(initials)
            .font(.system(size: size * 0.33, weight: .bold, design: .rounded))
            .foregroundStyle(ThemedColors.inkPurple)
            .frame(width: size, height: size)
            .background(ThemedColors.purple100)
            .clipShape(Circle())
    }
}

/// Handoff pill chip.
struct AttendanceChip: View {
    enum Style {
        case brand
        case neutral
        case success
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
        case .brand: ThemedColors.inkPurple
        case .neutral: ThemedColors.fg3
        case .success: ThemedColors.success500
        }
    }

    private var background: Color {
        switch style {
        case .brand: ThemedColors.purple100
        case .neutral: ThemedColors.bgSunken
        case .success: ThemedColors.success100
        }
    }
}

/// Load-failure banner with retry.
struct AttendanceErrorBanner: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        VStack(spacing: LumiraTokens.Space.s3) {
            Text(message)
                .font(.system(size: LumiraTokens.FontSize.textSm, design: .rounded))
                .foregroundStyle(ThemedColors.danger500)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button("Tentar novamente", action: retry)
                .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                .foregroundStyle(ThemedColors.inkPurple)
        }
        .padding(LumiraTokens.Space.s4)
        .background(ThemedColors.danger100)
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
    }
}

/// Inline action-error banner (toggle/close failures).
struct AttendanceActionErrorBanner: View {
    let message: String
    var identifier = "attendance-action-error"

    var body: some View {
        Text(message)
            .font(.system(size: LumiraTokens.FontSize.textSm, design: .rounded))
            .foregroundStyle(ThemedColors.danger500)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(LumiraTokens.Space.s3)
            .background(ThemedColors.danger100)
            .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.sm, style: .continuous))
            .accessibilityIdentifier(identifier)
    }
}

/// The 4-digit code rendered as separate boxes (aluno-04 / professor-03).
struct CodeDigitBoxes: View {
    let digits: String
    var boxSize: CGFloat = 52

    var body: some View {
        HStack(spacing: LumiraTokens.Space.s2) {
            ForEach(0..<4, id: \.self) { index in
                Text(digit(at: index))
                    .font(.system(size: boxSize * 0.46, weight: .bold, design: .rounded))
                    .foregroundStyle(ThemedColors.fg1)
                    .frame(width: boxSize, height: boxSize * 1.15)
                    .background(ThemedColors.bgSurface)
                    .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.sm, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: LumiraTokens.Radius.sm, style: .continuous)
                            .strokeBorder(ThemedColors.border2, lineWidth: 1)
                    )
            }
        }
    }

    private func digit(at index: Int) -> String {
        let characters = Array(digits)
        return index < characters.count ? String(characters[index]) : " "
    }
}

/// PT-BR label for the method markers on lists (spec story 28: manual rows
/// are visually marked).
extension CheckinMethod {
    var markerLabelPTBR: String? {
        switch self {
        case .manual: "manual"
        case .qr, .code: nil
        }
    }
}
