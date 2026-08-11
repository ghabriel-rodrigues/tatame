// Belt logo drawn in SwiftUI (handoff: rounded-square badge with a stylized
// belt — bar + rank stripes). Tokens only, no assets.

import DesignSystem
import SwiftUI

/// The stylized belt glyph: a rounded bar plus rank stripes.
struct BeltGlyph: View {
    var color: Color = ThemedColors.white

    var body: some View {
        HStack(spacing: 2.5) {
            Capsule()
                .fill(color)
                .frame(width: 17, height: 8)
            Capsule()
                .fill(color)
                .frame(width: 3, height: 8)
            Capsule()
                .fill(color)
                .frame(width: 3, height: 8)
        }
        .accessibilityHidden(true)
    }
}

/// The squircle brand badge hosting the belt glyph.
struct BrandBadge: View {
    enum Style {
        /// Translucent glass on the purple gradient (splash).
        case glass
        /// Solid deep-purple square (login header).
        case solid
    }

    var style: Style
    var size: CGFloat

    @Environment(\.tatameTheme) private var theme

    var body: some View {
        RoundedRectangle(cornerRadius: size * 0.32, style: .continuous)
            .fill(fillStyle)
            .overlay {
                if style == .glass {
                    RoundedRectangle(cornerRadius: size * 0.32, style: .continuous)
                        .strokeBorder(LumiraTokens.Glass.border.opacity(0.4), lineWidth: 1)
                }
            }
            .frame(width: size, height: size)
            .overlay(BeltGlyph())
    }

    private var fillStyle: Color {
        switch style {
        case .glass:
            ThemedColors.white.opacity(0.16)
        case .solid:
            theme.color("purple-700") ?? ThemedColors.purple700
        }
    }
}
