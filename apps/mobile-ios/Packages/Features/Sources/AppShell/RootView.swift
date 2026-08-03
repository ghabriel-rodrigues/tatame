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

    public init() {}

    public var body: some View {
        ZStack {
            switch session.state {
            case .unknown:
                LumiraTokens.Colors.bgApp.ignoresSafeArea()
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
        .task {
            await session.bootstrap()
        }
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
