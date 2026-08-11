// ThemedColors — mode-aware Lumira color facade (spec 011, CFG.17).
//
// The generated `LumiraTokens.Colors` are static light values and
// `LumiraTokens.DarkColors` the partial dark overlay (the prototypes'
// `applyTema()` remix — dark = static dark set first, per design-system
// ticket 06). This facade pairs the two: every member with a dark override
// resolves dynamically against the view hierarchy's color scheme — driven by
// `preferredColorScheme` from the persisted "Tema escuro" preference — and
// every member without one forwards the static light token unchanged, so the
// whole shell flips per aluno-21 without views switching on the mode.
//
// Brand-derived colors stay on the `\.tatameTheme` environment
// (`theme.color(token)`) — this facade never overlays the white-label brand.

import SwiftUI
#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

/// Resolves `light` in light mode and `dark` in dark mode, following the
/// hierarchy's effective color scheme (AppKit path exists only for the
/// macOS `swift test` floor).
private func themed(_ light: Color, _ dark: Color) -> Color {
    #if canImport(UIKit)
    Color(uiColor: UIColor { trait in
        trait.userInterfaceStyle == .dark ? UIColor(dark) : UIColor(light)
    })
    #elseif canImport(AppKit)
    Color(nsColor: NSColor(name: nil) { appearance in
        let isDark = appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
        return isDark ? NSColor(dark) : NSColor(light)
    })
    #else
    light
    #endif
}

/// Mode-aware counterpart of `LumiraTokens.Colors` — same member names.
/// Members with a `DarkColors` override are dynamic; the rest are the static
/// light tokens (no dark value in the canonical dark set — belts, semantics
/// 500s, deep grays and the brand aliases keep their light values, exactly
/// like the web's dark variable layer).
public enum ThemedColors {
    // MARK: Purple scale (50-400 remixed in dark)

    public static let purple50 = themed(LumiraTokens.Colors.purple50, LumiraTokens.DarkColors.purple50)
    public static let purple100 = themed(LumiraTokens.Colors.purple100, LumiraTokens.DarkColors.purple100)
    public static let purple200 = themed(LumiraTokens.Colors.purple200, LumiraTokens.DarkColors.purple200)
    public static let purple300 = themed(LumiraTokens.Colors.purple300, LumiraTokens.DarkColors.purple300)
    public static let purple400 = themed(LumiraTokens.Colors.purple400, LumiraTokens.DarkColors.purple400)
    public static let purple500 = LumiraTokens.Colors.purple500
    public static let purple600 = LumiraTokens.Colors.purple600
    public static let purple700 = LumiraTokens.Colors.purple700
    public static let purple800 = LumiraTokens.Colors.purple800
    public static let purple900 = LumiraTokens.Colors.purple900
    public static let purple950 = LumiraTokens.Colors.purple950

    // MARK: Pink scale (50-400 remixed in dark)

    public static let pink50 = themed(LumiraTokens.Colors.pink50, LumiraTokens.DarkColors.pink50)
    public static let pink100 = themed(LumiraTokens.Colors.pink100, LumiraTokens.DarkColors.pink100)
    public static let pink200 = themed(LumiraTokens.Colors.pink200, LumiraTokens.DarkColors.pink200)
    public static let pink300 = themed(LumiraTokens.Colors.pink300, LumiraTokens.DarkColors.pink300)
    public static let pink400 = themed(LumiraTokens.Colors.pink400, LumiraTokens.DarkColors.pink400)
    public static let pink500 = LumiraTokens.Colors.pink500
    public static let pink600 = LumiraTokens.Colors.pink600
    public static let pink700 = LumiraTokens.Colors.pink700

    // MARK: Gray scale (50-400 + 600 remixed in dark)

    public static let gray50 = themed(LumiraTokens.Colors.gray50, LumiraTokens.DarkColors.gray50)
    public static let gray100 = themed(LumiraTokens.Colors.gray100, LumiraTokens.DarkColors.gray100)
    public static let gray200 = themed(LumiraTokens.Colors.gray200, LumiraTokens.DarkColors.gray200)
    public static let gray300 = themed(LumiraTokens.Colors.gray300, LumiraTokens.DarkColors.gray300)
    public static let gray400 = themed(LumiraTokens.Colors.gray400, LumiraTokens.DarkColors.gray400)
    public static let gray500 = LumiraTokens.Colors.gray500
    public static let gray600 = themed(LumiraTokens.Colors.gray600, LumiraTokens.DarkColors.gray600)
    public static let gray700 = LumiraTokens.Colors.gray700
    public static let gray800 = LumiraTokens.Colors.gray800
    public static let gray900 = LumiraTokens.Colors.gray900
    public static let gray950 = LumiraTokens.Colors.gray950
    public static let white = LumiraTokens.Colors.white

    // MARK: Inks

    public static let inkPurple = themed(LumiraTokens.Colors.inkPurple, LumiraTokens.DarkColors.inkPurple)
    public static let inkPink = themed(LumiraTokens.Colors.inkPink, LumiraTokens.DarkColors.inkPink)

    // MARK: Semantics (100 tints remixed in dark, 500s static)

    public static let success100 = themed(LumiraTokens.Colors.success100, LumiraTokens.DarkColors.success100)
    public static let success500 = LumiraTokens.Colors.success500
    public static let warning100 = themed(LumiraTokens.Colors.warning100, LumiraTokens.DarkColors.warning100)
    public static let warning500 = LumiraTokens.Colors.warning500
    public static let danger100 = themed(LumiraTokens.Colors.danger100, LumiraTokens.DarkColors.danger100)
    public static let danger500 = LumiraTokens.Colors.danger500
    public static let info100 = LumiraTokens.Colors.info100
    public static let info500 = LumiraTokens.Colors.info500

    // MARK: Foreground / background / borders

    public static let fg1 = themed(LumiraTokens.Colors.fg1, LumiraTokens.DarkColors.fg1)
    public static let fg2 = themed(LumiraTokens.Colors.fg2, LumiraTokens.DarkColors.fg2)
    public static let fg3 = themed(LumiraTokens.Colors.fg3, LumiraTokens.DarkColors.fg3)
    public static let fg4 = themed(LumiraTokens.Colors.fg4, LumiraTokens.DarkColors.fg4)
    public static let fgOnColor = LumiraTokens.Colors.fgOnColor
    public static let bgApp = themed(LumiraTokens.Colors.bgApp, LumiraTokens.DarkColors.bgApp)
    public static let bgSurface = themed(LumiraTokens.Colors.bgSurface, LumiraTokens.DarkColors.bgSurface)
    public static let bgSunken = LumiraTokens.Colors.bgSunken
    public static let bgOverlay = LumiraTokens.Colors.bgOverlay
    public static let border1 = themed(LumiraTokens.Colors.border1, LumiraTokens.DarkColors.border1)
    public static let border2 = themed(LumiraTokens.Colors.border2, LumiraTokens.DarkColors.border2)
    public static let borderStrong = LumiraTokens.Colors.borderStrong

    // MARK: Brand aliases (default Tatame brand, no dark remix)

    public static let brand1 = LumiraTokens.Colors.brand1
    public static let brand2 = LumiraTokens.Colors.brand2
    public static let brandAccent = LumiraTokens.Colors.brandAccent
    public static let brandTint = themed(LumiraTokens.Colors.brandTint, LumiraTokens.DarkColors.purple50)

    // MARK: Belts (never remixed — a faixa é a faixa)

    public static let beltWhite = LumiraTokens.Colors.beltWhite
    public static let beltGray = LumiraTokens.Colors.beltGray
    public static let beltYellow = LumiraTokens.Colors.beltYellow
    public static let beltOrange = LumiraTokens.Colors.beltOrange
    public static let beltGreen = LumiraTokens.Colors.beltGreen
    public static let beltBlue = LumiraTokens.Colors.beltBlue
    public static let beltPurple = LumiraTokens.Colors.beltPurple
    public static let beltBrown = LumiraTokens.Colors.beltBrown
    public static let beltBlack = LumiraTokens.Colors.beltBlack
    public static let beltRed = LumiraTokens.Colors.beltRed
    public static let beltTip = LumiraTokens.Colors.beltTip
    public static let beltStripe = LumiraTokens.Colors.beltStripe
    public static let beltOutline = LumiraTokens.Colors.beltOutline
}
