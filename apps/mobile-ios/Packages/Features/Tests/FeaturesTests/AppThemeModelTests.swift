// AppThemeModel tests (spec 011, CFG.16-17): last-brand cache hydrate/
// refresh, per-device mode persistence, and session-change propagation into
// the theme environment value.

import DesignSystem
import Foundation
import Testing
import TatameCore
@testable import AppShell

// MARK: - Fixtures

private enum ThemeFixtures {
    /// The Oceano-like fixture brand (CFG.2's non-default preset shape).
    static let brand = AcademyBrand(deep: "#14213D", vibrant: "#3A5FA8", accent: "#E63946")

    static func context(brand: AcademyBrand?, platform: Bool = false) -> SessionContext {
        let membership = Membership(
            id: UUID(),
            type: platform ? .platform : .academy,
            role: platform ? .owner : .student,
            tenantId: platform ? nil : UUID(),
            academyName: platform ? nil : "Alliance Leblon",
            academyStatus: platform ? nil : .active,
            status: "active"
        )
        return SessionContext(
            user: UserSummary(id: UUID(), email: "aluno@tatame.dev", fullName: "Aluno Dev"),
            memberships: [membership],
            activeMembership: membership,
            permissions: ["graduation.update": true],
            academyBrand: brand
        )
    }

    /// Scratch, isolated defaults suite per test.
    static func makeDefaults() -> UserDefaults {
        let suite = "app-theme-tests-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        return defaults
    }
}

// MARK: - Tests

@Suite("AppThemeModel")
@MainActor
struct AppThemeModelTests {
    @Test("cold start without a cached brand is the default Tatame theme, light")
    func defaultColdStart() {
        let model = AppThemeModel(defaults: ThemeFixtures.makeDefaults())
        #expect(model.brand == nil)
        #expect(model.mode == .light)
        #expect(model.isDark == false)
        #expect(model.theme.palette["purple-700"] == "#4F2389")
    }

    @Test("cold start hydrates the cached last brand before any session lands (story 21)")
    func brandedColdStartFromCache() throws {
        let defaults = ThemeFixtures.makeDefaults()
        defaults.set(
            ["deep": "#14213D", "vibrant": "#3A5FA8", "accent": "#E63946"],
            forKey: AppThemeModel.DefaultsKey.lastBrand
        )

        let model = AppThemeModel(defaults: defaults)

        let brand = try #require(model.brand)
        #expect(brand == BrandInput(deep: "#14213D", vibrant: "#3A5FA8", accent: "#E63946"))
        // The environment theme carries the derived tenant scale, not the
        // default purple.
        #expect(model.theme.palette["purple-700"] == "#14213D")
        #expect(model.theme.palette["pink-500"] == "#E63946")
    }

    @Test("a corrupt cache entry degrades to the default brand")
    func corruptCache() {
        let defaults = ThemeFixtures.makeDefaults()
        defaults.set(["deep": "#14213D"], forKey: AppThemeModel.DefaultsKey.lastBrand)
        let model = AppThemeModel(defaults: defaults)
        #expect(model.brand == nil)
        #expect(model.theme.palette["purple-700"] == "#4F2389")
    }

    @Test("signing in with a branded academy adopts the brand and refreshes the cache")
    func signedInAdoptsAndCaches() {
        let defaults = ThemeFixtures.makeDefaults()
        let model = AppThemeModel(defaults: defaults)

        model.apply(sessionState: .signedIn(ThemeFixtures.context(brand: ThemeFixtures.brand)))

        #expect(model.brand?.deep == "#14213D")
        #expect(model.theme.palette["purple-700"] == "#14213D")
        let cached = defaults.dictionary(forKey: AppThemeModel.DefaultsKey.lastBrand) as? [String: String]
        #expect(cached == ["deep": "#14213D", "vibrant": "#3A5FA8", "accent": "#E63946"])
        // The theme derivation went through derivePalette — byte-equal.
        let derived = try? derivePalette(
            BrandInput(deep: "#14213D", vibrant: "#3A5FA8", accent: "#E63946"),
            mode: .light
        )
        #expect(model.theme.palette == derived)
    }

    @Test("an unbranded academy session renders the default brand and clears the cache (story 25)")
    func signedInUnbranded() {
        let defaults = ThemeFixtures.makeDefaults()
        defaults.set(
            ["deep": "#14213D", "vibrant": "#3A5FA8", "accent": "#E63946"],
            forKey: AppThemeModel.DefaultsKey.lastBrand
        )
        let model = AppThemeModel(defaults: defaults)

        model.apply(sessionState: .signedIn(ThemeFixtures.context(brand: nil)))

        #expect(model.brand == nil)
        #expect(model.theme.palette["purple-700"] == "#4F2389")
        #expect(defaults.dictionary(forKey: AppThemeModel.DefaultsKey.lastBrand) == nil)
    }

    @Test("a platform session is never white-labeled (story 27)")
    func platformSessionDefaultBrand() {
        let model = AppThemeModel(defaults: ThemeFixtures.makeDefaults())
        model.apply(sessionState: .signedIn(ThemeFixtures.context(brand: ThemeFixtures.brand)))

        model.apply(sessionState: .signedIn(ThemeFixtures.context(brand: nil, platform: true)))

        #expect(model.brand == nil)
        #expect(model.theme.palette["purple-700"] == "#4F2389")
    }

    @Test("logout reverts to the default brand and clears the cache")
    func signedOutClears() {
        let defaults = ThemeFixtures.makeDefaults()
        let model = AppThemeModel(defaults: defaults)
        model.apply(sessionState: .signedIn(ThemeFixtures.context(brand: ThemeFixtures.brand)))

        model.apply(sessionState: .signedOut(message: nil))

        #expect(model.brand == nil)
        #expect(model.theme.palette["purple-700"] == "#4F2389")
        #expect(defaults.dictionary(forKey: AppThemeModel.DefaultsKey.lastBrand) == nil)
    }

    @Test("the unknown state keeps the cached brand under the splash")
    func unknownKeepsCachedBrand() {
        let defaults = ThemeFixtures.makeDefaults()
        defaults.set(
            ["deep": "#14213D", "vibrant": "#3A5FA8", "accent": "#E63946"],
            forKey: AppThemeModel.DefaultsKey.lastBrand
        )
        let model = AppThemeModel(defaults: defaults)

        model.apply(sessionState: .unknown)

        #expect(model.brand?.deep == "#14213D")
    }

    @Test("the Tema escuro flip persists and flows into the theme (CFG.17)")
    func darkModeFlipPersists() {
        let defaults = ThemeFixtures.makeDefaults()
        let model = AppThemeModel(defaults: defaults)

        model.setDarkMode(true)

        #expect(model.isDark)
        #expect(model.theme.mode == .dark)
        // Dark derivation, not the light palette re-labeled.
        #expect(model.theme.palette["purple-ink"] == "#B08AF7")
        #expect(defaults.string(forKey: AppThemeModel.DefaultsKey.mode) == "dark")

        model.setDarkMode(false)
        #expect(model.mode == .light)
        #expect(defaults.string(forKey: AppThemeModel.DefaultsKey.mode) == "light")
    }

    @Test("the persisted mode survives a relaunch (new model, same defaults)")
    func darkModeSurvivesRelaunch() {
        let defaults = ThemeFixtures.makeDefaults()
        AppThemeModel(defaults: defaults).setDarkMode(true)

        let relaunched = AppThemeModel(defaults: defaults)

        #expect(relaunched.isDark)
        #expect(relaunched.theme.mode == .dark)
    }

    @Test("dark mode composes with the session brand (aluno-21: dark + brand overlay)")
    func darkModeWithBrand() {
        let model = AppThemeModel(defaults: ThemeFixtures.makeDefaults())
        model.apply(sessionState: .signedIn(ThemeFixtures.context(brand: ThemeFixtures.brand)))
        model.setDarkMode(true)

        let derived = try? derivePalette(
            BrandInput(deep: "#14213D", vibrant: "#3A5FA8", accent: "#E63946"),
            mode: .dark
        )
        #expect(model.theme.palette == derived)
    }
}
