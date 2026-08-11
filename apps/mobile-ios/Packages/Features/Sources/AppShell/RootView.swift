// RootView — the auth gate + role-gated shell router (AUTH.26; ticket 01
// decision 8: @main -> auth gate -> persona shell). Splash covers the silent
// cold-start restore and always shows its full ~1.9s (handoff timing).

import AuthFeature
import DesignSystem
import SwiftUI
import TatameCore

public struct RootView: View {
    @Environment(SessionStore.self) private var session
    @State private var splashFinished = false
    /// Session brand + persisted dark-mode preference → `\.tatameTheme`
    /// (spec 011, CFG.16-17). Cache-hydrated at init so the cold start
    /// paints branded before the silent restore lands.
    @State private var appTheme = AppThemeModel()

    public init() {}

    public var body: some View {
        ZStack {
            switch session.state {
            case .unknown:
                ThemedColors.bgApp.ignoresSafeArea()
            case .signedOut(let message):
                LoginView(session: session, notice: message)
            case .signedIn(let context):
                shell(for: context)
            }

            if !splashFinished || session.state == .unknown {
                SplashView {
                    splashFinished = true
                }
                .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: LumiraTokens.Motion.durSlow), value: splashFinished)
        .environment(appTheme)
        .environment(\.tatameTheme, appTheme.theme)
        // Explicit two-state (ticket 06): the persisted mode always wins —
        // never the system scheme (follow = recorded debt).
        .preferredColorScheme(appTheme.isDark ? .dark : .light)
        .onChange(of: session.state, initial: true) { oldState, newState in
            appTheme.apply(sessionState: newState)
            hydrateContextIfNeeded(from: oldState, to: newState)
        }
        .task {
            await session.bootstrap()
        }
    }

    /// Fresh-login contexts carry no academy payload (the login response has
    /// no `academy` and an empty permissions map) — one `/auth/me` round trip
    /// hydrates brand + permissions (CFG.16 "updates on login/switch").
    /// Restore/session-refresh paths already come from `/auth/me`.
    private func hydrateContextIfNeeded(from oldState: SessionState, to newState: SessionState) {
        guard case .signedIn(let context) = newState, context.permissions.isEmpty else { return }
        if case .signedIn = oldState { return }
        Task { await session.refreshPermissions() }
    }

    @ViewBuilder
    private func shell(for context: SessionContext) -> some View {
        switch context.route {
        case .aluno(let readOnly):
            PersonaShellView(persona: .aluno, context: context, readOnly: readOnly)
        case .professor(let readOnly):
            PersonaShellView(persona: .professor, context: context, readOnly: readOnly)
        case .responsavel(let readOnly):
            PersonaShellView(persona: .responsavel, context: context, readOnly: readOnly)
        case .webConsole:
            WebConsoleView(context: context)
        case .suspended:
            SuspendedView(context: context)
        }
    }
}
