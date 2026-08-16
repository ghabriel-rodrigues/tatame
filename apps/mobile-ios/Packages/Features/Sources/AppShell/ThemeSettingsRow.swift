// Perfil "Tema escuro" row (spec 011, CFG.17 — aluno-19's moon row, finally
// functional). The switch flips the persisted per-device mode through
// AppThemeModel; the whole shell re-renders on the dark token set per
// aluno-21. PT-BR copy; tokens only.

import DesignSystem
import SwiftUI

struct ThemeSettingsRow: View {
    @Environment(AppThemeModel.self) private var appTheme

    var body: some View {
        HStack(spacing: LumiraTokens.Space.s3) {
            ZStack {
                RoundedRectangle(cornerRadius: LumiraTokens.Radius.sm, style: .continuous)
                    .fill(ThemedColors.purple50)
                    .frame(width: 38, height: 38)
                Image(systemName: "moon")
                    .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold))
                    .foregroundStyle(ThemedColors.purple600)
            }
            Text("Tema escuro")
                .font(.quicksand(size: LumiraTokens.FontSize.textSm, weight: .semibold))
                .foregroundStyle(ThemedColors.fg1)
            Spacer()
            Toggle("", isOn: darkModeBinding)
                .labelsHidden()
                .tint(ThemedColors.inkPurple)
                .accessibilityIdentifier("dark-theme-toggle")
        }
        .padding(LumiraTokens.Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ThemedColors.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                .strokeBorder(ThemedColors.border1, lineWidth: 1)
        )
        .accessibilityIdentifier("theme-settings-row")
    }

    private var darkModeBinding: Binding<Bool> {
        Binding(
            get: { appTheme.isDark },
            set: { appTheme.setDarkMode($0) }
        )
    }
}
