// AppThemeModel — session brand + dark-mode preference → TatameTheme
// (spec 011, CFG.16-17).
//
// Owns the two client-side theming inputs decided by design-system tickets
// 03/06: the academy's white-label brand (from the session, cached in
// UserDefaults so a cold start paints branded before the silent restore
// lands) and the per-device "Tema escuro" preference (UserDefaults, explicit
// two-state, default light — system-scheme follow is recorded debt). The
// root injects the resulting `TatameTheme` into `\.tatameTheme` and drives
// `preferredColorScheme` from `mode`.

import DesignSystem
import Foundation
import Observation
import TatameCore

@MainActor
@Observable
public final class AppThemeModel {
    public enum DefaultsKey {
        /// "light" | "dark" (`PaletteMode` raw values); absent = light.
        public static let mode = "tatame.theme.mode"
        /// ["deep": "#…", "vibrant": "#…", "accent": "#…"] — the last
        /// session's academy brand, for the branded cold start (story 21).
        public static let lastBrand = "tatame.theme.lastBrand"
    }

    /// Active academy brand; nil = default Tatame brand (story 25).
    public private(set) var brand: BrandInput?
    /// Persisted per-device mode preference (CFG.17).
    public private(set) var mode: PaletteMode
    /// The resolved theme the root injects into `\.tatameTheme`.
    public private(set) var theme: TatameTheme

    @ObservationIgnored private let defaults: UserDefaults

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        let mode = PaletteMode(rawValue: defaults.string(forKey: DefaultsKey.mode) ?? "") ?? .light
        let brand = Self.cachedBrand(in: defaults)
        self.mode = mode
        self.brand = brand
        self.theme = TatameTheme(brand: brand ?? TatameTheme.defaultBrand, mode: mode)
    }

    public var isDark: Bool { mode == .dark }

    /// The aluno perfil "Tema escuro" switch (CFG.17). Persists immediately.
    public func setDarkMode(_ enabled: Bool) {
        setMode(enabled ? .dark : .light)
    }

    public func setMode(_ newMode: PaletteMode) {
        guard newMode != mode else { return }
        mode = newMode
        defaults.set(newMode.rawValue, forKey: DefaultsKey.mode)
        rebuildTheme()
    }

    /// Session propagation (CFG.16): signedIn adopts + caches the academy
    /// brand (nil brand or platform context = default, cache cleared);
    /// signedOut reverts to the default brand (logged-out surfaces are never
    /// white-labeled); `.unknown` keeps the cached brand under the splash so
    /// the cold start never flashes default purple. The mode preference is
    /// per device and survives logout untouched.
    public func apply(sessionState: SessionState) {
        switch sessionState {
        case .unknown:
            break
        case .signedOut:
            updateBrand(nil)
        case .signedIn(let context):
            updateBrand(context.academyBrand.map {
                BrandInput(deep: $0.deep, vibrant: $0.vibrant, accent: $0.accent)
            })
        }
    }

    private func updateBrand(_ newBrand: BrandInput?) {
        if let newBrand {
            defaults.set(
                ["deep": newBrand.deep, "vibrant": newBrand.vibrant, "accent": newBrand.accent],
                forKey: DefaultsKey.lastBrand
            )
        } else {
            defaults.removeObject(forKey: DefaultsKey.lastBrand)
        }
        guard newBrand != brand else { return }
        brand = newBrand
        rebuildTheme()
    }

    private func rebuildTheme() {
        theme = TatameTheme(brand: brand ?? TatameTheme.defaultBrand, mode: mode)
    }

    private static func cachedBrand(in defaults: UserDefaults) -> BrandInput? {
        guard
            let dict = defaults.dictionary(forKey: DefaultsKey.lastBrand) as? [String: String],
            let deep = dict["deep"],
            let vibrant = dict["vibrant"],
            let accent = dict["accent"]
        else { return nil }
        return BrandInput(deep: deep, vibrant: vibrant, accent: accent)
    }
}
