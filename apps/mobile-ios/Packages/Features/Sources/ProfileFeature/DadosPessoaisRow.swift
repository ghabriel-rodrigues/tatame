// The aluno perfil "Dados pessoais" entry row (aluno-19): person icon +
// chevron, opening the aluno-18 screen — the Phase-1 stub finally works
// (spec 013, REP.16).

import DesignSystem
import SwiftUI

public struct DadosPessoaisRow: View {
    private let onTap: () -> Void

    public init(onTap: @escaping () -> Void) {
        self.onTap = onTap
    }

    public var body: some View {
        Button(action: onTap) {
            HStack(spacing: LumiraTokens.Space.s3) {
                Image(systemName: "person.text.rectangle")
                    .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold))
                    .foregroundStyle(ThemedColors.inkPurple)
                    .frame(width: 36, height: 36)
                    .background(ThemedColors.purple50)
                    .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.sm, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text("Dados pessoais")
                        .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                        .foregroundStyle(ThemedColors.fg1)
                    Text("Identificação, contato e endereço")
                        .font(.system(size: LumiraTokens.FontSize.text2xs, design: .rounded))
                        .foregroundStyle(ThemedColors.fg4)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold))
                    .foregroundStyle(ThemedColors.fg4)
            }
            .padding(LumiraTokens.Space.s4)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(ThemedColors.bgSurface)
            .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                    .strokeBorder(ThemedColors.border1, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("perfil-dados-pessoais-row")
    }
}
