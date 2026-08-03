// Login (handoff aluno-02): brand badge, "Bem-vindo de volta", email/senha
// fields, gradient pill CTA, "Esqueci minha senha" stub, invite notice.
// PT-BR copy; Lumira tokens only.

import DesignSystem
import SwiftUI
import TatameCore

public struct LoginView: View {
    @State private var model: LoginModel
    /// Involuntary sign-out notice (session expired / offline) from the root.
    private let notice: String?

    @State private var showForgotPasswordStub = false
    @Environment(\.tatameTheme) private var theme

    public init(session: SessionStore, notice: String? = nil) {
        _model = State(initialValue: LoginModel(session: session))
        self.notice = notice
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                BrandBadge(style: .solid, size: 56)
                    .padding(.top, LumiraTokens.Space.s16)
                    .padding(.bottom, LumiraTokens.Space.s6)

                Text("Bem-vindo de volta")
                    .font(.system(size: LumiraTokens.FontSize.textXl, weight: .bold, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg1)
                Text("Entre para acompanhar seus treinos.")
                    .font(.system(size: LumiraTokens.FontSize.textSm, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg3)
                    .padding(.top, LumiraTokens.Space.s1)
                    .padding(.bottom, LumiraTokens.Space.s6)

                if let notice {
                    noticeBanner(notice)
                        .padding(.bottom, LumiraTokens.Space.s4)
                }

                VStack(spacing: LumiraTokens.Space.s3) {
                    TextField("Email", text: $model.email)
                        .textContentType(.emailAddress)
                        .loginFieldStyle()
                        #if os(iOS)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        #endif
                    SecureField("Senha", text: $model.password)
                        .textContentType(.password)
                        .loginFieldStyle()
                }

                if case .failed(let message) = model.phase {
                    errorBanner(message)
                        .padding(.top, LumiraTokens.Space.s3)
                }

                submitButton
                    .padding(.top, LumiraTokens.Space.s4)

                HStack {
                    Button("Esqueci minha senha") {
                        showForgotPasswordStub = true
                    }
                    .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.inkPurple)

                    Spacer()

                    Text("Criar conta")
                        .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                        .foregroundStyle(LumiraTokens.Colors.fg3)
                }
                .padding(.top, LumiraTokens.Space.s4)

                inviteNotice
                    .padding(.top, LumiraTokens.Space.s8)
            }
            .padding(.horizontal, LumiraTokens.Space.s6)
        }
        .scrollBounceBehavior(.basedOnSize)
        .background(loginBackground)
        .sheet(isPresented: chooserBinding) {
            if case .choosingMembership(let session) = model.phase {
                MembershipChooserView(session: session, model: model)
                    .presentationDetents([.medium])
            }
        }
        .alert("Recuperação de senha", isPresented: $showForgotPasswordStub) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("Em breve: você vai receber um link por email para redefinir sua senha.")
        }
    }

    // MARK: Subviews

    private var loginBackground: some View {
        LinearGradient(
            colors: [LumiraTokens.Colors.brandTint, LumiraTokens.Colors.bgApp],
            startPoint: .top,
            endPoint: .center
        )
        .ignoresSafeArea()
    }

    private var submitButton: some View {
        Button {
            Task { await model.submit() }
        } label: {
            Group {
                if model.phase == .submitting {
                    ProgressView()
                        .tint(LumiraTokens.Colors.fgOnColor)
                } else {
                    Text("Entrar")
                        .font(.system(size: LumiraTokens.FontSize.textBase, weight: .semibold, design: .rounded))
                }
            }
            .foregroundStyle(LumiraTokens.Colors.fgOnColor)
            .frame(maxWidth: .infinity)
            .frame(height: 48)
            .background(
                LinearGradient(
                    colors: [
                        theme.color("purple-700") ?? LumiraTokens.Colors.purple700,
                        theme.color("purple-500") ?? LumiraTokens.Colors.purple500,
                    ],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            )
            .clipShape(Capsule())
            .shadow(
                color: (theme.color("purple-500") ?? LumiraTokens.Colors.purple500).opacity(0.35),
                radius: 12,
                y: 6
            )
        }
        .disabled(model.phase == .submitting)
    }

    private func errorBanner(_ message: String) -> some View {
        Text(message)
            .font(.system(size: LumiraTokens.FontSize.textSm, design: .rounded))
            .foregroundStyle(LumiraTokens.Colors.danger500)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(LumiraTokens.Space.s3)
            .background(LumiraTokens.Colors.danger100)
            .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.sm, style: .continuous))
            .accessibilityIdentifier("login-error")
    }

    private func noticeBanner(_ message: String) -> some View {
        Text(message)
            .font(.system(size: LumiraTokens.FontSize.textSm, design: .rounded))
            .foregroundStyle(LumiraTokens.Colors.inkPurple)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(LumiraTokens.Space.s3)
            .background(LumiraTokens.Colors.brandTint)
            .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.sm, style: .continuous))
    }

    private var inviteNotice: some View {
        HStack(alignment: .top, spacing: LumiraTokens.Space.s3) {
            Image(systemName: "qrcode")
                .font(.system(size: LumiraTokens.FontSize.textMd))
                .foregroundStyle(LumiraTokens.Colors.inkPurple)
            Text(inviteNoticeText)
                .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg3)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(LumiraTokens.Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(LumiraTokens.Colors.brandTint)
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
    }

    private var inviteNoticeText: AttributedString {
        var prefix = AttributedString("Novo na academia? Peça ao seu professor o ")
        var link = AttributedString("link de convite")
        link.font = .system(size: LumiraTokens.FontSize.textXs, weight: .bold, design: .rounded)
        link.foregroundColor = LumiraTokens.Colors.inkPurple
        let suffix = AttributedString(" — seu cadastro já entra vinculado à turma certa.")
        prefix.append(link)
        prefix.append(suffix)
        return prefix
    }

    private var chooserBinding: Binding<Bool> {
        Binding(
            get: {
                if case .choosingMembership = model.phase { return true }
                return false
            },
            set: { presented in
                if !presented {
                    model.cancelChooser()
                }
            }
        )
    }
}

/// Handoff field styling: white surface, thin border, rounded corners.
private struct LoginFieldStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .font(.system(size: LumiraTokens.FontSize.textSm, design: .rounded))
            .foregroundStyle(LumiraTokens.Colors.fg1)
            .padding(.horizontal, LumiraTokens.Space.s4)
            .frame(height: 48)
            .background(LumiraTokens.Colors.bgSurface)
            .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                    .strokeBorder(LumiraTokens.Colors.border1, lineWidth: 1)
            )
    }
}

private extension View {
    func loginFieldStyle() -> some View {
        modifier(LoginFieldStyle())
    }
}
