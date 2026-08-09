// BeltBar — the one belt-rendering component (spec 005, GRD.21; resolved
// belt-tokenization anatomy). Drawn with SwiftUI primitives, never images:
// rounded bar filled by the colorSlug token, inset `belt.outline` hairline
// (what keeps Branca visible — never "fixed" with gray), ponteira ~22% width
// in `tipColorSlug ?? belt.tip`, white degree stripes on the ponteira.
// Keyed by data (`BeltDef`-shaped payloads) — zero hardcoded ladders; an
// unknown colorSlug falls back to gray with a logged warning.

import os
import SwiftUI

/// Pure rendering rules behind `BeltBar` (unit-tested view-model helpers).
public enum BeltBarSpec {
    /// `color.belt.*` slug → generated Lumira token. Belts are static,
    /// brand-independent tokens — exempt from white-label and dark remix.
    public static let colorsBySlug: [String: Color] = [
        "belt.white": LumiraTokens.Colors.beltWhite,
        "belt.gray": LumiraTokens.Colors.beltGray,
        "belt.yellow": LumiraTokens.Colors.beltYellow,
        "belt.orange": LumiraTokens.Colors.beltOrange,
        "belt.green": LumiraTokens.Colors.beltGreen,
        "belt.blue": LumiraTokens.Colors.beltBlue,
        "belt.purple": LumiraTokens.Colors.beltPurple,
        "belt.brown": LumiraTokens.Colors.beltBrown,
        "belt.black": LumiraTokens.Colors.beltBlack,
        "belt.red": LumiraTokens.Colors.beltRed,
    ]

    /// True when the slug maps to a shipped belt token.
    public static func isKnown(colorSlug: String) -> Bool {
        colorsBySlug[colorSlug] != nil
    }

    /// Bar fill for a slug — unknown slugs render gray (defensive default;
    /// keeps old clients alive if the catalog gains a color first) and log
    /// a warning.
    public static func fill(colorSlug: String) -> Color {
        if let color = colorsBySlug[colorSlug] {
            return color
        }
        logger.warning("Unknown belt colorSlug '\(colorSlug, privacy: .public)' — rendering gray fallback")
        return LumiraTokens.Colors.beltGray
    }

    /// Ponteira fill: `tipColorSlug ?? belt.tip` (black belt sends belt.red).
    public static func tipFill(tipColorSlug: String?) -> Color {
        guard let tipColorSlug else { return LumiraTokens.Colors.beltTip }
        return fill(colorSlug: tipColorSlug)
    }

    /// Degree stripes drawn on the ponteira: current degrees clamped into
    /// 0...maxDegrees; a zero maxDegrees (red belt in v1) never stripes.
    public static func stripeCount(degrees: Int, maxDegrees: Int) -> Int {
        guard maxDegrees > 0 else { return 0 }
        return min(max(degrees, 0), maxDegrees)
    }

    /// Ponteira share of the bar width (anatomy: ~22%).
    public static let tipFraction: CGFloat = 0.22

    private static let logger = Logger(subsystem: "app.tatame.ios", category: "BeltBar")
}

/// The drawn belt (bar + ponteira + degree stripes), sizes sm/md/lg.
public struct BeltBar: View {
    public enum Size: Sendable {
        /// List rows (roll call, dependent cards).
        case sm
        /// Cards (aluno home, timeline markers, profile).
        case md
        /// Hero (Graduação screen).
        case lg

        var height: CGFloat {
            switch self {
            case .sm: 10
            case .md: 16
            case .lg: 22
            }
        }

        var stripeWidth: CGFloat {
            switch self {
            case .sm: 2
            case .md: 3
            case .lg: 4
            }
        }
    }

    private let colorSlug: String
    private let tipColorSlug: String?
    private let degrees: Int
    private let maxDegrees: Int
    private let size: Size

    public init(colorSlug: String, tipColorSlug: String?, degrees: Int, maxDegrees: Int, size: Size = .md) {
        self.colorSlug = colorSlug
        self.tipColorSlug = tipColorSlug
        self.degrees = degrees
        self.maxDegrees = maxDegrees
        self.size = size
    }

    public var body: some View {
        GeometryReader { proxy in
            let radius = min(LumiraTokens.Radius.xs, size.height / 2)
            let tipWidth = proxy.size.width * BeltBarSpec.tipFraction
            ZStack(alignment: .trailing) {
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .fill(BeltBarSpec.fill(colorSlug: colorSlug))
                // Ponteira: solid block at the right end (~22% width).
                BeltTipShape(radius: radius)
                    .fill(BeltBarSpec.tipFill(tipColorSlug: tipColorSlug))
                    .frame(width: tipWidth)
                // Degree stripes: white, evenly spaced on the ponteira.
                let stripes = BeltBarSpec.stripeCount(degrees: degrees, maxDegrees: maxDegrees)
                if stripes > 0 {
                    HStack(spacing: 0) {
                        ForEach(0..<stripes, id: \.self) { _ in
                            Rectangle()
                                .fill(LumiraTokens.Colors.beltStripe)
                                .frame(width: size.stripeWidth)
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .frame(width: tipWidth)
                }
                // Inset hairline outline — uniform on every belt; the spec
                // exists so Branca holds its edge on any surface.
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .strokeBorder(LumiraTokens.Colors.beltOutline, lineWidth: 1)
                    .frame(width: proxy.size.width)
            }
        }
        .frame(height: size.height)
        .accessibilityHidden(true)
    }
}

/// Right-end tip block that follows the bar's rounded trailing corners.
private struct BeltTipShape: Shape {
    let radius: CGFloat

    func path(in rect: CGRect) -> Path {
        Path(
            roundedRect: rect,
            cornerRadii: RectangleCornerRadii(
                topLeading: 0,
                bottomLeading: 0,
                bottomTrailing: radius,
                topTrailing: radius
            ),
            style: .continuous
        )
    }
}

/// Belt chip variant: a mini drawn belt + PT-BR label in a pill (profile
/// headers, graduações válidas, list rows).
public struct BeltChip: View {
    public enum Style: Sendable {
        /// Surface pill (lists, régua chips).
        case neutral
        /// Ink pill (profile header chips — professor-12 / aluno-19).
        case prominent
        /// Dimmed régua chip (kids belt disabled by the admin).
        case disabled
    }

    private let label: String
    private let colorSlug: String
    private let tipColorSlug: String?
    private let degrees: Int
    private let maxDegrees: Int
    private let style: Style

    public init(
        label: String,
        colorSlug: String,
        tipColorSlug: String? = nil,
        degrees: Int = 0,
        maxDegrees: Int = 0,
        style: Style = .neutral
    ) {
        self.label = label
        self.colorSlug = colorSlug
        self.tipColorSlug = tipColorSlug
        self.degrees = degrees
        self.maxDegrees = maxDegrees
        self.style = style
    }

    public var body: some View {
        HStack(spacing: LumiraTokens.Space.s2) {
            BeltBar(
                colorSlug: colorSlug,
                tipColorSlug: tipColorSlug,
                degrees: degrees,
                maxDegrees: maxDegrees,
                size: .sm
            )
            .frame(width: 34)
            Text(label)
                .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold, design: .rounded))
                .foregroundStyle(foreground)
        }
        .padding(.horizontal, LumiraTokens.Space.s3)
        .padding(.vertical, LumiraTokens.Space.s1)
        .background(background)
        .clipShape(Capsule())
        .overlay(
            Capsule().strokeBorder(border, lineWidth: style == .prominent ? 0 : 1)
        )
        .opacity(style == .disabled ? 0.45 : 1)
    }

    private var foreground: Color {
        switch style {
        case .prominent: LumiraTokens.Colors.fgOnColor
        case .neutral, .disabled: LumiraTokens.Colors.fg2
        }
    }

    private var background: Color {
        switch style {
        case .prominent: LumiraTokens.Colors.fg1
        case .neutral, .disabled: LumiraTokens.Colors.bgSurface
        }
    }

    private var border: Color {
        switch style {
        case .prominent: .clear
        case .neutral, .disabled: LumiraTokens.Colors.border1
        }
    }
}
