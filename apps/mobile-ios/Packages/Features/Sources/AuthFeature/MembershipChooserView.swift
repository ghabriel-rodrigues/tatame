// Membership chooser (spec: multi-membership login picks one active
// membership; switching re-issues tokens without re-login).

import DesignSystem
import SwiftUI
import TatameCore

struct MembershipChooserView: View {
    let session: AuthSession
    let model: LoginModel

    var body: some View {
        VStack(alignment: .leading, spacing: LumiraTokens.Space.s4) {
            Text("Escolha onde entrar")
                .font(.system(size: LumiraTokens.FontSize.textLg, weight: .bold, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg1)
            Text("Sua conta participa de mais de uma academia ou perfil.")
                .font(.system(size: LumiraTokens.FontSize.textSm, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg3)

            ScrollView {
                VStack(spacing: LumiraTokens.Space.s3) {
                    ForEach(session.memberships) { membership in
                        Button {
                            Task { await model.choose(membership) }
                        } label: {
                            membershipRow(membership)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .padding(LumiraTokens.Space.s6)
        .presentationBackground(LumiraTokens.Colors.bgApp)
    }

    private func membershipRow(_ membership: Membership) -> some View {
        HStack(spacing: LumiraTokens.Space.s3) {
            VStack(alignment: .leading, spacing: LumiraTokens.Space.s1) {
                Text(membership.academyName ?? "Plataforma Tatame")
                    .font(.system(size: LumiraTokens.FontSize.textBase, weight: .semibold, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg1)
                Text(membership.role.displayNamePTBR)
                    .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.inkPurple)
            }
            Spacer()
            if membership.id == session.activeMembershipId {
                Text("Último acesso")
                    .font(.system(size: LumiraTokens.FontSize.text2xs, weight: .semibold, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.inkPurple)
                    .padding(.horizontal, LumiraTokens.Space.s2)
                    .padding(.vertical, LumiraTokens.Space.s1)
                    .background(LumiraTokens.Colors.brandTint)
                    .clipShape(Capsule())
            }
            Image(systemName: "chevron.right")
                .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold))
                .foregroundStyle(LumiraTokens.Colors.fg4)
        }
        .padding(LumiraTokens.Space.s4)
        .background(LumiraTokens.Colors.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                .strokeBorder(LumiraTokens.Colors.border1, lineWidth: 1)
        )
    }
}
