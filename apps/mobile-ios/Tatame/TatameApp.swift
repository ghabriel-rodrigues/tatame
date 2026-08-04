// Tatame app target — thin shell (ticket 01, decision 4).
//
// @main -> composition root -> auth gate (RootView) -> persona shells.
// Repositories are composed once here and injected via the environment
// (ticket 06, decision 5); views never build networking themselves.

import AppShell
import EnrollmentFeature
import SwiftUI
import TatameAPI
import TatameCore

@main
struct TatameApp: App {
    @State private var composition = AppComposition()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(composition.sessionStore)
                .environment(\.enrollmentRepository, composition.enrollmentRepository)
        }
    }
}

/// Bridges the (Sendable) session-invalidated signal from the refresh
/// coordinator into the MainActor SessionStore, breaking the construction
/// cycle stack -> store -> stack.
@MainActor
private final class SessionExpiryRelay {
    weak var store: SessionStore?

    nonisolated init() {}

    func notify() async {
        await store?.sessionExpired()
    }
}

/// Composition root: Keychain store, generated-client stack, SessionStore.
@MainActor
final class AppComposition {
    let sessionStore: SessionStore
    let enrollmentRepository: any EnrollmentRepository

    init() {
        // Dev server URL. Environment-specific .xcconfig wiring is ticket 08
        // (CI) territory; localhost matches the seeded backend (`nx serve api`).
        let serverURL = URL(string: "http://localhost:3000")!

        let keychain = KeychainRefreshTokenStore()
        let relay = SessionExpiryRelay()
        let stack = TatameClientFactory.makeAuthStack(
            serverURL: serverURL,
            refreshTokenStore: keychain,
            onSessionInvalidated: { await relay.notify() }
        )
        let store = SessionStore(
            repository: stack.repository,
            refreshTokenStore: keychain,
            accessTokenStore: stack.accessTokenStore
        )
        relay.store = store
        sessionStore = store
        enrollmentRepository = stack.enrollmentRepository
    }
}
