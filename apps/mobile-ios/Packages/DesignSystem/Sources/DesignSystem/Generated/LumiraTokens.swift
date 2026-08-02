// GENERATED FILE — do not edit. Source: tokens/tokens.json (design-system:tokens).
//
// Committed copy of packages/design-system/build/swift/LumiraTokens.swift
// (ticket 01, decision 6: the out-of-nx-graph Xcode build never depends on an
// nx target having run). Refresh by re-running the design-system:tokens target
// and copying the output here as a normal reviewed diff:
//   rtk cp packages/design-system/build/swift/LumiraTokens.swift \
//     apps/mobile-ios/Packages/DesignSystem/Sources/DesignSystem/Generated/LumiraTokens.swift

import SwiftUI

public extension Color {
    /// 0xAARRGGBB initializer for generated Lumira tokens.
    init(lumiraHex hex: UInt64) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: Double((hex >> 24) & 0xFF) / 255
        )
    }
}

/// One layer of a purple-tinted Lumira shadow (maps to SwiftUI .shadow —
/// radius ≈ blur / 2 — per the ds-01 degradation policy).
public struct LumiraShadow: Sendable {
    public let color: Color
    public let x: CGFloat
    public let y: CGFloat
    public let blur: CGFloat
    public let spread: CGFloat
    public let inset: Bool
}

/**
 Lumira design tokens for SwiftUI. Static defaults (light); `DarkColors` is the
 partial dark overlay (applyTema remix + default-brand dark tints). White-label
 overlays come from DerivePalette.swift at theme-construction time. Tracking
 values are em multipliers.
 */
public enum LumiraTokens {
    public enum Colors {
        public static let purple50 = Color(lumiraHex: 0xFFF8F2FE)
        public static let purple100 = Color(lumiraHex: 0xFFEEDDFB)
        public static let purple200 = Color(lumiraHex: 0xFFDEBFF8)
        public static let purple300 = Color(lumiraHex: 0xFFC695F4)
        public static let purple400 = Color(lumiraHex: 0xFFA968F0)
        public static let purple500 = Color(lumiraHex: 0xFF8B3DEB)
        public static let purple600 = Color(lumiraHex: 0xFF6B2DBA)
        public static let purple700 = Color(lumiraHex: 0xFF4F2389)
        public static let purple800 = Color(lumiraHex: 0xFF3B1A66)
        public static let purple900 = Color(lumiraHex: 0xFF2A1248)
        public static let purple950 = Color(lumiraHex: 0xFF1A0B2E)
        public static let pink50 = Color(lumiraHex: 0xFFFEF5F9)
        public static let pink100 = Color(lumiraHex: 0xFFFDE9F3)
        public static let pink200 = Color(lumiraHex: 0xFFFBD2E8)
        public static let pink300 = Color(lumiraHex: 0xFFF7AED8)
        public static let pink400 = Color(lumiraHex: 0xFFF285C5)
        public static let pink500 = Color(lumiraHex: 0xFFEC5BAE)
        public static let pink600 = Color(lumiraHex: 0xFFD63E96)
        public static let pink700 = Color(lumiraHex: 0xFFB8267A)
        public static let gray50 = Color(lumiraHex: 0xFFFAF9FC)
        public static let gray100 = Color(lumiraHex: 0xFFF2F0F6)
        public static let gray200 = Color(lumiraHex: 0xFFE6E3EC)
        public static let gray300 = Color(lumiraHex: 0xFFD2CED9)
        public static let gray400 = Color(lumiraHex: 0xFFB3ADBC)
        public static let gray500 = Color(lumiraHex: 0xFF8E8799)
        public static let gray600 = Color(lumiraHex: 0xFF6B6378)
        public static let gray700 = Color(lumiraHex: 0xFF4A4258)
        public static let gray800 = Color(lumiraHex: 0xFF2E2839)
        public static let gray900 = Color(lumiraHex: 0xFF1C1726)
        public static let gray950 = Color(lumiraHex: 0xFF0F0B17)
        public static let white = Color(lumiraHex: 0xFFFFFFFF)
        public static let inkPurple = Color(lumiraHex: 0xFF4F2389)
        public static let inkPink = Color(lumiraHex: 0xFFA83C78)
        public static let success100 = Color(lumiraHex: 0xFFD9F2E5)
        public static let success500 = Color(lumiraHex: 0xFF2BB673)
        public static let warning100 = Color(lumiraHex: 0xFFFCEBCC)
        public static let warning500 = Color(lumiraHex: 0xFFF0A020)
        public static let danger100 = Color(lumiraHex: 0xFFFBDDE2)
        public static let danger500 = Color(lumiraHex: 0xFFE04359)
        public static let info100 = Color(lumiraHex: 0xFFDDE5FD)
        public static let info500 = Color(lumiraHex: 0xFF5B7DF5)
        public static let fg1 = Color(lumiraHex: 0xFF1A0B2E)
        public static let fg2 = Color(lumiraHex: 0xFF3B1A66)
        public static let fg3 = Color(lumiraHex: 0xFF6B6378)
        public static let fg4 = Color(lumiraHex: 0xFF8E8799)
        public static let fgOnColor = Color(lumiraHex: 0xFFFFFFFF)
        public static let bgApp = Color(lumiraHex: 0xFFFAF9FC)
        public static let bgSurface = Color(lumiraHex: 0xFFFFFFFF)
        public static let bgSunken = Color(lumiraHex: 0xFFF2F0F6)
        public static let bgOverlay = Color(lumiraHex: 0x8C1A0B2E)
        public static let brand1 = Color(lumiraHex: 0xFF4F2389)
        public static let brand2 = Color(lumiraHex: 0xFF8B3DEB)
        public static let brandAccent = Color(lumiraHex: 0xFFEC5BAE)
        public static let brandTint = Color(lumiraHex: 0xFFF8F2FE)
        public static let border1 = Color(lumiraHex: 0xFFE6E3EC)
        public static let border2 = Color(lumiraHex: 0xFFD2CED9)
        public static let borderStrong = Color(lumiraHex: 0xFF4F2389)
        public static let beltWhite = Color(lumiraHex: 0xFFEDEAE2)
        public static let beltGray = Color(lumiraHex: 0xFF9A9AA2)
        public static let beltYellow = Color(lumiraHex: 0xFFE8C93D)
        public static let beltOrange = Color(lumiraHex: 0xFFE8833D)
        public static let beltGreen = Color(lumiraHex: 0xFF3D8B4F)
        public static let beltBlue = Color(lumiraHex: 0xFF1E5CB3)
        public static let beltPurple = Color(lumiraHex: 0xFF6B2DBA)
        public static let beltBrown = Color(lumiraHex: 0xFF6B4A2D)
        public static let beltBlack = Color(lumiraHex: 0xFF17141F)
        public static let beltRed = Color(lumiraHex: 0xFFB3261E)
        public static let beltTip = Color(lumiraHex: 0xFF17141F)
        public static let beltStripe = Color(lumiraHex: 0xFFFFFFFF)
        public static let beltOutline = Color(lumiraHex: 0x241A0B2E)
    }

    /// Dark-mode overrides — same names as `Colors` (plus glass* colors).
    public enum DarkColors {
        public static let purple50 = Color(lumiraHex: 0xFF292143)
        public static let purple100 = Color(lumiraHex: 0xFF312450)
        public static let purple200 = Color(lumiraHex: 0xFF3D2966)
        public static let purple300 = Color(lumiraHex: 0xFF512F86)
        public static let purple400 = Color(lumiraHex: 0xFF6C37B6)
        public static let pink50 = Color(lumiraHex: 0xFF2F2240)
        public static let pink100 = Color(lumiraHex: 0xFF3B2748)
        public static let pink200 = Color(lumiraHex: 0xFF553057)
        public static let pink300 = Color(lumiraHex: 0xFF7A3C6D)
        public static let pink400 = Color(lumiraHex: 0xFFB04B8C)
        public static let gray50 = Color(lumiraHex: 0xFF241E3A)
        public static let gray100 = Color(lumiraHex: 0xFF2E2748)
        public static let gray200 = Color(lumiraHex: 0xFF3D3560)
        public static let gray300 = Color(lumiraHex: 0xFF4D4478)
        public static let gray400 = Color(lumiraHex: 0xFF7E7699)
        public static let gray600 = Color(lumiraHex: 0xFFC7C0DC)
        public static let inkPurple = Color(lumiraHex: 0xFFB08AF7)
        public static let inkPink = Color(lumiraHex: 0xFFFAA1CE)
        public static let success100 = Color(lumiraHex: 0xFF163526)
        public static let warning100 = Color(lumiraHex: 0xFF3A2F14)
        public static let danger100 = Color(lumiraHex: 0xFF3A1B22)
        public static let fg1 = Color(lumiraHex: 0xFFF2EFFA)
        public static let fg2 = Color(lumiraHex: 0xFFD6D0E8)
        public static let fg3 = Color(lumiraHex: 0xFFA79FC2)
        public static let fg4 = Color(lumiraHex: 0xFF7E7699)
        public static let bgApp = Color(lumiraHex: 0xFF141021)
        public static let bgSurface = Color(lumiraHex: 0xFF1D1830)
        public static let border1 = Color(lumiraHex: 0xFF2E2748)
        public static let border2 = Color(lumiraHex: 0xFF3D3560)
        public static let glassBgDeep = Color(lumiraHex: 0xEB1A152C)
        public static let glassBorder = Color(lumiraHex: 0x24FFFFFF)
    }

    public enum Space {
        public static let s0: CGFloat = 0
        public static let s1: CGFloat = 4
        public static let s2: CGFloat = 8
        public static let s3: CGFloat = 12
        public static let s4: CGFloat = 16
        public static let s5: CGFloat = 20
        public static let s6: CGFloat = 24
        public static let s8: CGFloat = 32
        public static let s10: CGFloat = 40
        public static let s12: CGFloat = 48
        public static let s16: CGFloat = 64
        public static let s20: CGFloat = 80
        public static let s24: CGFloat = 96
    }

    public enum Radius {
        public static let xs: CGFloat = 6
        public static let sm: CGFloat = 10
        public static let md: CGFloat = 14
        public static let lg: CGFloat = 20
        public static let xl: CGFloat = 28
        public static let xxl: CGFloat = 36
        public static let pill: CGFloat = 999
    }

    public enum FontSize {
        public static let text2xs: CGFloat = 11
        public static let textXs: CGFloat = 12
        public static let textSm: CGFloat = 14
        public static let textBase: CGFloat = 16
        public static let textMd: CGFloat = 18
        public static let textLg: CGFloat = 20
        public static let textXl: CGFloat = 24
        public static let text2xl: CGFloat = 30
        public static let text3xl: CGFloat = 36
        public static let text4xl: CGFloat = 48
        public static let text5xl: CGFloat = 60
        public static let text6xl: CGFloat = 72
    }

    public enum FontWeights {
        public static let light: Font.Weight = .light
        public static let regular: Font.Weight = .regular
        public static let medium: Font.Weight = .medium
        public static let semibold: Font.Weight = .semibold
        public static let bold: Font.Weight = .bold
    }

    public enum LineHeight {
        public static let tight: CGFloat = 1.15
        public static let snug: CGFloat = 1.3
        public static let normal: CGFloat = 1.5
        public static let relaxed: CGFloat = 1.65
    }

    public enum Tracking {
        public static let tight: CGFloat = -0.02 // em
        public static let normal: CGFloat = 0 // em
        public static let wide: CGFloat = 0.04 // em
        public static let caps: CGFloat = 0.08 // em
    }

    public enum Motion {
        public static let easeOut: (Double, Double, Double, Double) = (0.22, 1, 0.36, 1)
        public static let easeIn: (Double, Double, Double, Double) = (0.55, 0, 1, 0.45)
        public static let easeSpring: (Double, Double, Double, Double) = (0.34, 1.56, 0.64, 1)
        public static let durFast: TimeInterval = 0.12
        public static let durBase: TimeInterval = 0.2
        public static let durSlow: TimeInterval = 0.32
    }

    public enum Shadows {
        public static let xs: [LumiraShadow] = [LumiraShadow(color: Color(lumiraHex: 0x0F2A1248), x: 0, y: 1, blur: 2, spread: 0, inset: false)]
        public static let sm: [LumiraShadow] = [LumiraShadow(color: Color(lumiraHex: 0x142A1248), x: 0, y: 2, blur: 6, spread: 0, inset: false)]
        public static let md: [LumiraShadow] = [LumiraShadow(color: Color(lumiraHex: 0x1A2A1248), x: 0, y: 8, blur: 20, spread: 0, inset: false)]
        public static let lg: [LumiraShadow] = [LumiraShadow(color: Color(lumiraHex: 0x242A1248), x: 0, y: 18, blur: 40, spread: 0, inset: false)]
        public static let xl: [LumiraShadow] = [LumiraShadow(color: Color(lumiraHex: 0x2E2A1248), x: 0, y: 30, blur: 60, spread: 0, inset: false)]
        public static let glow: [LumiraShadow] = [LumiraShadow(color: Color(lumiraHex: 0x598B3DEB), x: 0, y: 8, blur: 32, spread: 0, inset: false)]
        public static let inset: [LumiraShadow] = [LumiraShadow(color: Color(lumiraHex: 0x0F2A1248), x: 0, y: 1, blur: 2, spread: 0, inset: true)]
    }

    public enum Glass {
        public static let bg = Color(lumiraHex: 0x8CFFFFFF)
        public static let bgDeep = Color(lumiraHex: 0xA6F8F2FE)
        public static let border = Color(lumiraHex: 0xB3FFFFFF)
        public static let stroke = Color(lumiraHex: 0x2E8B3DEB)
        public static let blur: CGFloat = 20
        public static let blurStrong: CGFloat = 24
        public static let saturation: CGFloat = 1.8
        public static let shineAngle: CGFloat = 135
        public static let shineColors: [Color] = [Color(lumiraHex: 0xB3FFFFFF), Color(lumiraHex: 0x26FFFFFF), Color(lumiraHex: 0x00FFFFFF)]
        public static let shineStops: [CGFloat] = [0, 0.4, 1]
        public static let shadow: [LumiraShadow] = [LumiraShadow(color: Color(lumiraHex: 0x262A1248), x: 0, y: 8, blur: 32, spread: 0, inset: false), LumiraShadow(color: Color(lumiraHex: 0xE6FFFFFF), x: 0, y: 1, blur: 0, spread: 0, inset: true), LumiraShadow(color: Color(lumiraHex: 0x148B3DEB), x: 0, y: -1, blur: 0, spread: 0, inset: true)]
    }

    public enum FocusRing {
        public static let width: CGFloat = 3
        public static let alpha: CGFloat = 0.4
        public static let ringColor = Color(lumiraHex: 0xFF8B3DEB)
    }
}
