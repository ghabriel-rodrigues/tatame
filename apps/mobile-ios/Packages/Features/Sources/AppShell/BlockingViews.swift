// Blocking screens (AUTH.26): web-console-only roles and suspended academy.

import DesignSystem
import SwiftUI
import TatameCore

/// Admin / platform roles on mobile: point to the web console (spec: those
/// surfaces are web-only; valid credentials never feel broken).
struct WebConsoleView: View {
    let context: SessionContext

    var body: some View {
        VStack(spacing: LumiraTokens.Space.s4) {
            Spacer()
            Image(systemName: "desktopcomputer")
                .font(.system(size: LumiraTokens.FontSize.text3xl))
                .foregroundStyle(LumiraTokens.Colors.inkPurple)
            Text("Use o console web")
                .font(.system(size: LumiraTokens.FontSize.textXl, weight: .bold, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg1)
            Text("O perfil \(context.activeMembership.role.displayNamePTBR) é atendido pelo console web do Tatame. Acesse pelo navegador do seu computador.")
                .font(.system(size: LumiraTokens.FontSize.textSm, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg3)
                .multilineTextAlignment(.center)
            Spacer()
            LogoutButton()
        }
        .padding(LumiraTokens.Space.s6)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(LumiraTokens.Colors.bgApp)
        .accessibilityIdentifier("web-console-screen")
    }
}

/// Suspended academy: blocking screen — only logout works (spec story 38).
struct SuspendedView: View {
    let context: SessionContext

    var body: some View {
        VStack(spacing: LumiraTokens.Space.s4) {
            Spacer()
            Image(systemName: "lock.fill")
                .font(.system(size: LumiraTokens.FontSize.text3xl))
                .foregroundStyle(LumiraTokens.Colors.danger500)
            Text("Academia suspensa")
                .font(.system(size: LumiraTokens.FontSize.textXl, weight: .bold, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg1)
            Text("O acesso de \(context.activeMembership.academyName ?? "sua academia") está temporariamente bloqueado. Fale com a administração da academia.")
                .font(.system(size: LumiraTokens.FontSize.textSm, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg3)
                .multilineTextAlignment(.center)
            Spacer()
            LogoutButton()
        }
        .padding(LumiraTokens.Space.s6)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(LumiraTokens.Colors.bgApp)
        .accessibilityIdentifier("suspended-screen")
    }
}
